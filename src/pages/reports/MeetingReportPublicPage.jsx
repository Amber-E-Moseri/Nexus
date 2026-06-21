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
  if (!text) {
    console.error('No text provided to copy')
    return false
  }

  // Try modern clipboard API
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      console.log('Copied via Clipboard API')
      return true
    }
  } catch (err) {
    console.warn('Clipboard API error:', err.message)
  }

  // Fallback: textarea selection method
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, 99999)

    const success = document.execCommand('copy')
    document.body.removeChild(textarea)

    console.log('Fallback copy result:', success)
    return success
  } catch (err) {
    console.error('Fallback copy failed:', err.message)
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
  const { share_token } = useParams()
  const [searchParams] = useSearchParams()

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setNotFound(false)

      const { data, error } = await supabase
        .from('meeting_attendance_reports')
        .select(`
          id, meeting_id, attended_count, absent_count, expected_count, unexpected_count,
          report_date, label, share_token, subgroup_filter, reach_pct,
          present_names, absent_names, unexpected_names,
          meetings(id, title, date, description)
        `)
        .eq('share_token', share_token)
        .single()

      if (!active) return

      if (error || !data) {
        setReport(null)
        setNotFound(true)
        setLoading(false)
        return
      }

      setReport(data)
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [share_token])

  const presentNames = useMemo(
    () => buildListRows(report?.present_names ?? []),
    [report],
  )
  const absentNames = useMemo(
    () => buildListRows(report?.absent_names ?? []),
    [report],
  )
  const unexpectedNames = useMemo(
    () => buildListRows(report?.unexpected_names ?? []),
    [report],
  )

  const expectedTotal = report?.expected_count ?? 0
  const presentTotal = report?.attended_count ?? 0
  const absentTotal = report?.absent_count ?? 0
  const unexpectedTotal = report?.unexpected_count ?? 0
  const attendancePct = expectedTotal > 0 ? Math.round((presentTotal / expectedTotal) * 100) : 0
  const reachPct = Math.round(report?.reach_pct ?? 0)
  const band = reachBand((report?.reach_pct ?? 0) / 100)

  const meeting = report?.meetings ?? {}
  const meetingTitle = meeting.title || report?.label || 'Meeting Report'
  const meetingDate = meeting.date || report?.report_date || ''
  const meetingDescription = meeting.description || ''
  const subgroupFilter = report?.subgroup_filter || ''

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
            Go to BLW CAN NEXUS
          </a>
        </div>
      </div>
    )
  }

  const PRINT_STYLES_FULL = `
@media print {
  @page {
    margin: 0.55in 0.6in 0.7in 0.6in;
    size: A4 portrait;
  }
  html, body {
    height: auto !important;
    overflow: visible !important;
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .public-report-page {
    padding: 0 !important;
    background: white !important;
  }
  .public-report-header {
    page-break-after: avoid;
  }
  .public-report-shell {
    box-shadow: none !important;
    max-width: 100%;
  }
  .report-kpi-section,
  .report-list-section,
  .report-summary-section {
    page-break-inside: avoid;
    margin-bottom: 12px;
  }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    line-height: 1.4;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  thead {
    display: table-header-group;
  }
}
`

  return (
    <div className="public-report-page" style={{ minHeight: '100vh', background: PAGE_BG }}>
      <style>{PRINT_STYLES_FULL}</style>

      <header className="public-report-header" style={{ background: HEADER_GRADIENT, padding: '24px 28px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: '#FFFFFF', margin: 0, marginBottom: 8 }}>{meetingTitle}</h1>
              <div style={{ fontSize: 14, color: '#B8D4FF' }}>{meetingDate ? dateStamp(meetingDate) : '-'}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                const url = window.location.href
                console.log('Copy button clicked, URL:', url)

                // Always show the modal with the link
                setShowLinkModal(true)
              }}
              className="public-report-actions"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              <Link2 size={14} />
              {copiedLink ? 'Link Copied!' : 'Copy Link'}
            </button>
          </div>
          {meetingDescription && (
            <div style={{ fontSize: 13, color: '#D9D0F2', marginBottom: 12, lineHeight: 1.6 }}>
              {meetingDescription}
            </div>
          )}
          {subgroupFilter && (
            <div style={{ fontSize: 12, color: '#B8D4FF', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 12px' }}>
              {subgroupFilter}
            </div>
          )}
        </div>
      </header>

      <main style={{ padding: '32px 28px' }}>
        <div className="public-report-shell" style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="report-kpi-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <KpiTile label="Expected" value={expectedTotal} bg="#F4F1EA" bd="#EDE8DC" circle="rgba(76,42,146,.12)" labelColor="#9E9488" valueColor="#2D2A22" />
            <KpiTile label="Attended" value={presentTotal} detail={`${attendancePct}%`} bg="#EEF6F1" bd="#C3E0CC" circle="rgba(45,134,83,.15)" labelColor="#2D8653" valueColor="#1B5E3C" />
            <KpiTile label="Absent" value={absentTotal} bg="#FEF0ED" bd="#F5C4B8" circle="rgba(201,72,48,.15)" labelColor="#C94830" valueColor="#7A1C24" />
            <KpiTile label="Reach %" value={`${reachPct}%`} bg={band.bg} bd={band.border} circle="transparent" labelColor={band.fg} valueColor={band.fg} />
            <KpiTile label="Attendance %" value={`${attendancePct}%`} bg="#FFF4CC" bd="#EDD88A" circle="rgba(232,160,32,.15)" labelColor="#7A5A00" valueColor="#7A5A00" />
            <KpiTile label="Unexpected" value={unexpectedTotal} bg="#FFF8EC" bd="#EDD88A" circle="rgba(232,160,32,.15)" labelColor="#E8A020" valueColor="#7A5A00" />
          </div>

          <div className="report-list-section">
            <ListTable title="Who Attended" count={presentNames.length} tone={{ bg: '#EEF6F1', fg: '#1B5E3C' }} names={presentNames} />
          </div>

          <div className="report-list-section">
            <ListTable title="Who Was Absent" count={absentNames.length} tone={{ bg: '#FEF0ED', fg: '#7A1C24' }} names={absentNames} />
          </div>

          {unexpectedTotal > 0 && (
            <div className="report-list-section">
              <ListTable title="Unexpected Attendees" count={unexpectedNames.length} tone={{ bg: '#FFF8EC', fg: '#7A5A00' }} names={unexpectedNames} />
            </div>
          )}
        </div>
      </main>

      {showLinkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 700, color: '#1C1C1C' }}>Share Report Link</h2>
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#7E7D78', lineHeight: 1.5 }}>Copy this link to share the report:</p>
            <div style={{ background: '#F9F8F6', border: '1px solid #EDE8DC', borderRadius: 8, padding: 12, marginBottom: 16, wordBreak: 'break-all', fontSize: 12, fontFamily: 'monospace', color: '#2C2C2A', lineHeight: 1.4 }}>
              {window.location.href}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #EDE8DC', background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#1C1C1C' }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = window.location.href

                  const performCopy = async () => {
                    try {
                      // Try Clipboard API first (modern browsers)
                      if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(text)
                        console.log('Copied via Clipboard API')
                      } else {
                        // Fallback: select and copy with execCommand
                        const textarea = document.createElement('textarea')
                        textarea.value = text
                        textarea.style.position = 'fixed'
                        textarea.style.left = '-999999px'
                        textarea.style.top = '-999999px'
                        document.body.appendChild(textarea)
                        textarea.focus()
                        textarea.select()
                        document.execCommand('copy')
                        document.body.removeChild(textarea)
                        console.log('Copied via fallback method')
                      }

                      setCopiedLink(true)
                      setTimeout(() => setCopiedLink(false), 2000)
                      setShowLinkModal(false)
                    } catch (err) {
                      console.error('Copy failed:', err)
                      alert('Copy failed. Link is displayed above - you can select and copy it manually.')
                    }
                  }

                  performCopy()
                }}
                style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#4C2A92', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                {copiedLink ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer style={{ padding: '24px 28px', textAlign: 'center', color: MUTED, fontSize: 12 }}>
        <div>Generated: {dateStamp(report?.report_date)}</div>
        {report?.id && <div style={{ marginTop: 6, fontSize: 11, color: MUTED }}>Report ID: {report.id.slice(0, 8)}</div>}
      </footer>
    </div>
  )
}
