import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Filter, Link2, Printer, Users } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import { formatRelativeDate } from '../../lib/dateUtils'
import { supabase } from '../../lib/supabase'

function normalizeNameKey(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

const PRINT_STYLES = `
@media print {
  body {
    background: white !important;
  }
  .public-report-actions,
  .public-report-signin {
    display: none !important;
  }
  .public-report-page {
    padding: 0 !important;
  }
  .public-report-shell {
    box-shadow: none !important;
  }
}
`

const PAGE_BG = '#F4F1EA'
const PANEL_BG = '#FFFFFF'
const PANEL_BORDER = '#DDD7C8'
const TEXT = '#2C2C2A'
const MUTED = '#7B776F'
const HEADER_GRADIENT = 'linear-gradient(135deg, #2D1B69 0%, #4C2A92 50%, #6B3FAF 100%)'
const REPORT_SELECT = 'id, label, created_at, subgroup_filter, present_names, absent_names, unexpected_names, expected_count, attended_count, absent_count, unexpected_count, reach_pct'

function reachBand(pct) {
  const p = pct * 100
  if (p >= 80) return { bg: '#D9F2E3', fg: '#1B5E3C', border: '#A8DBC0' }
  if (p >= 65) return { bg: '#D4EEF0', fg: '#1B4E55', border: '#98CDD2' }
  if (p >= 50) return { bg: '#FFF4CC', fg: '#7A5A00', border: '#EDD88A' }
  if (p >= 35) return { bg: '#FEE8D6', fg: '#7A3210', border: '#F5C4A0' }
  return { bg: '#F8D7DA', fg: '#7A1C24', border: '#F0B0B6' }
}

function KpiTile({ label, value, detail, bg, bd, circle, labelColor, valueColor }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '14px 16px', background: bg, border: `1px solid ${bd}` }}>
      <div style={{ position: 'absolute', right: -18, bottom: -22, width: 72, height: 72, borderRadius: 999, background: circle }} />
      <div style={{ position: 'relative', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: labelColor }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 25, fontWeight: 800, color: valueColor, marginTop: 7, lineHeight: 1 }}>{value}</div>
      {detail ? <div style={{ position: 'relative', marginTop: 6, fontSize: 12, color: labelColor }}>{detail}</div> : null}
    </div>
  )
}

function buildListRows(names = []) {
  return [...names].sort((a, b) => a.localeCompare(b))
}

function dateStamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (err) {
    console.warn('Clipboard API failed, falling back to textarea method:', err)
  }

  // Fallback for older browsers or if clipboard API fails
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch (err) {
    console.error('Copy fallback failed:', err)
    return false
  }
}

function ListTable({ title, count, tone, names }) {
  return (
    <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ background: tone.bg, color: tone.fg, padding: '10px 14px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {title} ({count})
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${PANEL_BORDER}` }}>Name</th>
            <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${PANEL_BORDER}` }}>-</th>
          </tr>
        </thead>
        <tbody>
          {names.length === 0 ? (
            <tr>
              <td colSpan={2} style={{ padding: '18px 14px', fontSize: 13, color: MUTED }}>No names listed.</td>
            </tr>
          ) : names.map((name, index) => (
            <tr key={`${name}-${index}`}>
              <td style={{ padding: '10px 14px', borderBottom: index < names.length - 1 ? '1px solid #ECE8DE' : 'none', fontSize: 13, color: TEXT, fontWeight: 600 }}>{name}</td>
              <td style={{ padding: '10px 14px', borderBottom: index < names.length - 1 ? '1px solid #ECE8DE' : 'none', fontSize: 13, color: '#C8C1B4' }}>-</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MeetingReportPublicPage() {
  const { reportId } = useParams()
  const [searchParams] = useSearchParams()
  const filterSubgroup = searchParams.get('subgroup') ?? ''
  const filterCategory = searchParams.get('category') ?? ''
  const hasFilter = Boolean(filterSubgroup || filterCategory)

  const [report, setReport] = useState(null)
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setNotFound(false)

      const { data, error } = await supabase
        .from('meeting_attendance_reports')
        .select(REPORT_SELECT)
        .eq('id', reportId)
        .single()

      if (!active) return

      if (error || !data) {
        setReport(null)
        setNotFound(true)
        setLoading(false)
        return
      }

      setReport(data)

      // Roster lets us enrich flat name lists with subgroup / leadership category
      // so the link can scope the report to a specific demographic.
      const { data: rosterData } = await supabase
        .from('expected_attendees')
        .select('full_name, match_key, subgroup, leadership_category')

      if (!active) return
      setRoster(rosterData ?? [])
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [reportId])

  // Map normalized name -> { subgroup, leadership_category }
  const rosterByKey = useMemo(() => {
    const map = new Map()
    for (const row of roster) {
      const meta = {
        subgroup: (row.subgroup ?? '').trim(),
        leadership_category: (row.leadership_category ?? '').trim(),
      }
      map.set(normalizeNameKey(row.full_name), meta)
      if (row.match_key) map.set(normalizeNameKey(row.match_key), meta)
    }
    return map
  }, [roster])

  const matchesFilter = useMemo(() => {
    return (name) => {
      if (!hasFilter) return true
      const meta = rosterByKey.get(normalizeNameKey(name))
      if (!meta) return false
      if (filterSubgroup && meta.subgroup !== filterSubgroup) return false
      if (filterCategory && meta.leadership_category !== filterCategory) return false
      return true
    }
  }, [hasFilter, rosterByKey, filterSubgroup, filterCategory])

  const presentNames = useMemo(
    () => buildListRows((report?.present_names ?? []).filter(matchesFilter)),
    [report, matchesFilter],
  )
  const absentNames = useMemo(
    () => buildListRows((report?.absent_names ?? []).filter(matchesFilter)),
    [report, matchesFilter],
  )
  // Visitors aren't in the roster, so they have no demographic — hide them when filtering.
  const visitorNames = useMemo(
    () => (hasFilter ? [] : buildListRows(report?.unexpected_names ?? [])),
    [report, hasFilter],
  )

  // Recompute totals from the (possibly filtered) lists.
  const expectedTotal = hasFilter ? presentNames.length + absentNames.length : (report?.expected_count ?? 0)
  const presentTotal = hasFilter ? presentNames.length : (report?.attended_count ?? 0)
  const absentTotal = hasFilter ? absentNames.length : (report?.absent_count ?? 0)
  const visitorTotal = hasFilter ? 0 : (report?.unexpected_count ?? 0)
  const reachValue = hasFilter
    ? (expectedTotal > 0 ? Math.round((presentTotal / expectedTotal) * 100) : 0)
    : Math.round(report?.reach_pct ?? 0)
  const expectedPct = expectedTotal ? Math.round((presentTotal / expectedTotal) * 100) : 0
  const absentPct = expectedTotal ? Math.round((absentTotal / expectedTotal) * 100) : 0
  const band = reachBand(reachValue / 100)
  const filterLabel = [filterCategory, filterSubgroup].filter(Boolean).join(' · ')

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: PAGE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 14 }}>
        Loading report...
      </div>
    )
  }

  if (notFound || !report) {
    return (
      <div style={{ minHeight: '100vh', background: HEADER_GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#FFFFFF', maxWidth: 440 }}>
          <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 10 }}>Report not found</div>
          <div style={{ fontSize: 14, color: '#D9D0F2', lineHeight: 1.6, marginBottom: 18 }}>
            This report may have been deleted or the link is incorrect.
          </div>
          <a
            href="/"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', borderRadius: 10, background: '#FFFFFF', color: '#2D1B69', fontWeight: 700, textDecoration: 'none' }}
          >
            Go to BLW Canada OS
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="public-report-page" style={{ minHeight: '100vh', background: PAGE_BG }}>
      <style>{PRINT_STYLES}</style>

      <header style={{ background: HEADER_GRADIENT, padding: '20px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={20} color="#DCE9F8" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF' }}>BLW Canada OS</div>
              <div style={{ marginTop: 4, fontSize: 13, color: '#B8D4FF' }}>Meeting Attendance Report</div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', color: '#F8FBFF', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 500 }}>
                  <CalendarRange size={13} />
                  {report.label}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', color: '#C4D8F5', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 500 }}>
                  Generated {formatRelativeDate(report.created_at) ?? '-'}
                </span>
                {hasFilter ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(232,160,32,0.18)', color: '#FFE3A8', border: '1px solid rgba(232,160,32,0.35)', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                    <Filter size={12} />
                    {filterLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="public-report-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={async () => {
                const success = await copyToClipboard(window.location.href)
                if (success) {
                  setCopiedLink(true)
                  setTimeout(() => setCopiedLink(false), 2000)
                }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              <Link2 size={14} />
              {copiedLink ? 'Link Copied' : 'Copy Link'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              <Printer size={14} />
              Print
            </button>
            <a
              href="/meetings"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', color: '#DCE9F8', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
            >
              Open in BLW Canada OS
            </a>
          </div>
        </div>
      </header>

      <main style={{ padding: 32 }}>
        <div className="public-report-shell" style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            <KpiTile label="Expected" value={expectedTotal} bg="#F4F1EA" bd="#EDE8DC" circle="rgba(76,42,146,.12)" labelColor="#9E9488" valueColor="#2D2A22" />
            <KpiTile label="Present" value={presentTotal} detail={`${expectedPct}%`} bg="#EEF6F1" bd="#C3E0CC" circle="rgba(45,134,83,.15)" labelColor="#2D8653" valueColor="#1B5E3C" />
            <KpiTile label="Absent" value={absentTotal} detail={`${absentPct}%`} bg="#FEF0ED" bd="#F5C4B8" circle="rgba(201,72,48,.15)" labelColor="#C94830" valueColor="#7A1C24" />
            <KpiTile label="Visitors" value={visitorTotal} bg="#FFF8EC" bd="#EDD88A" circle="rgba(232,160,32,.15)" labelColor="#E8A020" valueColor="#7A5A00" />
          </div>

          <div style={{ background: PANEL_BG, borderRadius: 14, border: `1px solid ${band.border}`, backgroundColor: band.bg, padding: '22px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: band.fg, marginBottom: 4 }}>
              Reach %{hasFilter ? ` — ${filterLabel}` : ''}
            </div>
            <div style={{ fontSize: 52, fontWeight: 800, color: band.fg, lineHeight: 1 }}>{reachValue}%</div>
            <div style={{ fontSize: 12, color: band.fg, marginTop: 6, opacity: 0.78 }}>
              {presentTotal} of {expectedTotal} expected attendees matched
            </div>
          </div>

          <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '9px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Subgroup Summary
            </div>
            <div style={{ padding: '14px 16px', fontSize: 13, color: TEXT, lineHeight: 1.6 }}>
              {hasFilter ? (
                <div style={{ marginBottom: 6 }}><strong>Filtered to:</strong> {filterLabel}</div>
              ) : report.subgroup_filter ? (
                <div style={{ marginBottom: 6 }}><strong>Subgroup:</strong> {report.subgroup_filter}</div>
              ) : null}
              <div>Detailed subgroup breakdown available in the app.</div>
            </div>
          </div>

          <ListTable title="Present" count={presentNames.length} tone={{ bg: '#EEF6F1', fg: '#1B5E3C' }} names={presentNames} />
          <ListTable title="Absent" count={absentNames.length} tone={{ bg: '#FEF0ED', fg: '#7A1C24' }} names={absentNames} />

          {visitorNames.length > 0 ? (
            <ListTable title="Visitors" count={visitorNames.length} tone={{ bg: '#FFF8EC', fg: '#7A5A00' }} names={visitorNames} />
          ) : null}

          <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ background: '#1E1A2E', color: '#E8E0FF', padding: '9px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              Data Integrity Log
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, color: TEXT }}>Matched {presentTotal} of {expectedTotal} expected attendees{hasFilter ? ` (filtered to ${filterLabel})` : ''}</div>
              <div style={{ fontSize: 13, color: TEXT }}>Report generated {formatRelativeDate(report.created_at) ?? '-'}</div>
              {hasFilter ? <div style={{ fontSize: 13, color: TEXT }}>Filter: {filterLabel}</div> : report.subgroup_filter ? <div style={{ fontSize: 13, color: TEXT }}>Filter: {report.subgroup_filter}</div> : null}
            </div>
          </div>
        </div>
      </main>

      <footer style={{ padding: '0 24px 28px', textAlign: 'center', color: MUTED, fontSize: 12.5 }}>
        <div>Generated by BLW Canada OS · This report is view-only · {dateStamp(report.created_at)}</div>
        <div className="public-report-signin" style={{ marginTop: 8 }}>
          <a href="/login" style={{ color: '#4C2A92', fontWeight: 700, textDecoration: 'none' }}>Sign in to BLW Canada OS →</a>
        </div>
      </footer>
    </div>
  )
}
