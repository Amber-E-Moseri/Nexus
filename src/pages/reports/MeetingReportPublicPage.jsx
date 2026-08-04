import { useEffect, useMemo, useState, useRef } from 'react'
import { CalendarRange, Filter, Printer, Users } from 'lucide-react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { formatRelativeDate } from '../../lib/dateUtils'
import { supabase } from '../../lib/supabase'
import { useMediaQuery } from '../../hooks/useMediaQuery'

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

function KpiTile({ label, value, detail, bg, bd, circle, labelColor, valueColor, compact = false }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, padding: compact ? '14px 12px' : '20px 18px', background: bg, border: `1px solid ${bd}`, transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ position: 'absolute', right: -20, bottom: -28, width: 80, height: 80, borderRadius: 999, background: circle, opacity: 0.6 }} />
      <div style={{ position: 'relative', fontSize: compact ? 10 : 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: labelColor, marginBottom: compact ? 6 : 8 }}>{label}</div>
      <div style={{ position: 'relative', fontSize: compact ? 28 : 32, fontWeight: 800, color: valueColor, lineHeight: 1 }}>{value}</div>
      {detail ? <div style={{ position: 'relative', marginTop: compact ? 6 : 8, fontSize: compact ? 11 : 13, color: labelColor, fontWeight: 600 }}>{detail}</div> : null}
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

function ListTable({ title, count, tone, data }) {
  const personList = Array.isArray(data) && data.length > 0
    ? typeof data[0] === 'string'
      ? data.map(name => ({ name }))
      : data
    : data || []

  return (
    <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ background: tone.bg, color: tone.fg, padding: '14px 18px', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.8, background: 'rgba(0,0,0,0.08)', padding: '3px 8px', borderRadius: 4 }}>{count}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '12px 18px', textAlign: 'left', fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, borderBottom: `1px solid ${PANEL_BORDER}`, background: 'rgba(0,0,0,0.02)' }}>Name</th>
            {personList.some(p => p.leadership_category) && (
              <th style={{ padding: '12px 18px', textAlign: 'left', fontSize: 12, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, borderBottom: `1px solid ${PANEL_BORDER}`, background: 'rgba(0,0,0,0.02)' }}>Category</th>
            )}
          </tr>
        </thead>
        <tbody>
          {personList.length === 0 ? (
            <tr>
              <td colSpan={2} style={{ padding: '24px 18px', fontSize: 13, color: MUTED, textAlign: 'center', fontStyle: 'italic' }}>No names listed.</td>
            </tr>
          ) : personList.map((person, index) => (
            <tr key={`${typeof person === 'string' ? person : person.name}-${index}`} style={{ background: index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)', transition: 'background 0.2s' }}>
              <td style={{ padding: '12px 18px', borderBottom: index < personList.length - 1 ? `1px solid ${PANEL_BORDER}` : 'none', fontSize: 14, color: TEXT, fontWeight: 500 }}>
                {typeof person === 'string' ? person : person.name}
              </td>
              {personList.some(p => p.leadership_category) && (
                <td style={{ padding: '12px 18px', borderBottom: index < personList.length - 1 ? `1px solid ${PANEL_BORDER}` : 'none', fontSize: 13, color: MUTED, fontWeight: 500 }}>
                  {typeof person === 'string' ? '-' : (person.leadership_category || '-')}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MeetingReportPublicPage() {
  const { share_token } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const isMobile = useMediaQuery('(max-width: 640px)')

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeSubgroup, setActiveSubgroup] = useState('')
  const isInitialMount = useRef(true)
  const isSharedLink = !!share_token

  // Read activeSubgroup from URL params on mount
  useEffect(() => {
    const subgroupFromUrl = searchParams.get('subgroup') || ''
    if (subgroupFromUrl !== activeSubgroup) {
      setActiveSubgroup(subgroupFromUrl)
    }
    isInitialMount.current = false
  }, [])

  // Default activeSubgroup to subgroup_filter on shared links (only if not already set from URL)
  useEffect(() => {
    if (report?.subgroup_filter && !activeSubgroup && isInitialMount.current === false) {
      setActiveSubgroup(report.subgroup_filter)
    }
  }, [report])

  // Sync activeSubgroup with URL query parameter using browser history API
  useEffect(() => {
    if (isInitialMount.current) return

    if (activeSubgroup) {
      const newUrl = `${window.location.pathname}?subgroup=${encodeURIComponent(activeSubgroup)}`
      window.history.replaceState(null, '', newUrl)
    } else {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [activeSubgroup])

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
          present_names, absent_names, unexpected_names, by_subgroup
        `)
        .eq('share_token', share_token)
        .single()

      // Fetch meeting details separately if meeting_id exists
      let meetingData = null
      if (data?.meeting_id) {
        const { data: mData } = await supabase
          .from('meetings')
          .select('id, title, date')
          .eq('id', data.meeting_id)
          .single()
        meetingData = mData
      }

      if (!active) return

      if (error || !data) {
        setReport(null)
        setNotFound(true)
        setLoading(false)
        return
      }

      // Combine report and meeting data, rename by_subgroup to bySubgroup for consistency
      const reportWithMeeting = {
        ...data,
        meetings: meetingData || {},
        bySubgroup: data.by_subgroup || null,
      }

      setReport(reportWithMeeting)
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [share_token])

  // Extract available subgroups from report data
  const availableSubgroups = useMemo(() => {
    if (!report) return []
    // If report has bySubgroup data (regional mode), extract subgroup names
    if (report.bySubgroup && typeof report.bySubgroup === 'object') {
      return Object.keys(report.bySubgroup).sort()
    }
    return []
  }, [report])

  // Get current view data (filtered by activeSubgroup if available)
  const visibleReport = useMemo(() => {
    if (!report) return null

    // If no subgroup filtering or activeSubgroup not set, show all data
    if (!activeSubgroup || !report.bySubgroup || !report.bySubgroup[activeSubgroup]) {
      return {
        expectedCount: report.expected_count,
        attendedCount: report.attended_count,
        absentCount: report.absent_count,
        unexpectedCount: report.unexpected_count,
        presentData: (report.present_names || []).map(name => ({ name })),
        absentData: (report.absent_names || []).map(name => ({ name })),
        unexpectedData: (report.unexpected_names || []).map(name => ({ name })),
        presentNames: report.present_names || [],
        absentNames: report.absent_names || [],
        unexpectedNames: report.unexpected_names || [],
        reachPct: report.reach_pct, // Already 0-100 from database
      }
    }

    // Show data for selected subgroup with detailed person objects
    const subgroupData = report.bySubgroup[activeSubgroup]
    const subgroupExpected = subgroupData.expected?.length || 0
    const subgroupPresent = subgroupData.present?.length || 0
    const subgroupReachPct = subgroupExpected > 0
      ? (subgroupPresent / subgroupExpected) * 100
      : 0

    return {
      expectedCount: subgroupExpected,
      attendedCount: subgroupPresent,
      absentCount: subgroupData.absent?.length || 0,
      unexpectedCount: subgroupData.unexpected?.length || 0,
      presentData: subgroupData.present || [],
      absentData: subgroupData.absent || [],
      unexpectedData: subgroupData.unexpected || [],
      presentNames: subgroupData.present?.map(p => p.name) || [],
      absentNames: subgroupData.absent?.map(p => p.name) || [],
      unexpectedNames: subgroupData.unexpected?.map(p => p.name) || [],
      reachPct: subgroupReachPct, // Now 0-100 to match database format
    }
  }, [report, activeSubgroup])

  const presentNames = useMemo(
    () => buildListRows(visibleReport?.presentNames ?? []),
    [visibleReport],
  )
  const absentNames = useMemo(
    () => buildListRows(visibleReport?.absentNames ?? []),
    [visibleReport],
  )
  const unexpectedNames = useMemo(
    () => buildListRows(visibleReport?.unexpectedNames ?? []),
    [visibleReport],
  )

  const expectedTotal = visibleReport?.expectedCount ?? 0
  const presentTotal = visibleReport?.attendedCount ?? 0
  const absentTotal = visibleReport?.absentCount ?? 0
  const unexpectedTotal = visibleReport?.unexpectedCount ?? 0
  const attendancePct = expectedTotal > 0 ? Math.round((presentTotal / expectedTotal) * 100) : 0
  const reachPct = Math.round(visibleReport?.reachPct ?? 0) // Now already 0-100
  const band = reachBand((visibleReport?.reachPct ?? 0) / 100) // Convert 0-100 to 0-1 for band calculation

  const meeting = report?.meetings ?? {}
  const meetingTitle = meeting.title || report?.label || 'Meeting Report'
  const meetingDate = meeting.date || report?.report_date || ''
  const meetingDescription = meeting.description || ''
  const subgroupFilter = report?.subgroup_filter || ''
  const isGroupView = !!(subgroupFilter || activeSubgroup)

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
    margin: 0.75in 0.75in 0.9in 0.75in;
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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif !important;
  }
  .public-report-page {
    padding: 0 !important;
    background: white !important;
  }
  .public-report-header {
    page-break-after: avoid !important;
    padding: 0 0 24px 0 !important;
    margin-bottom: 24px !important;
    border-bottom: 2px solid #DDD7C8 !important;
    background: linear-gradient(135deg, #2D1B69 0%, #4C2A92 50%, #6B3FAF 100%) !important;
  }
  .public-report-header h1 {
    font-size: 28pt !important;
    margin: 0 0 8px 0 !important;
  }
  .public-report-actions {
    display: none !important;
  }
  .public-report-shell {
    box-shadow: none !important;
    max-width: 100% !important;
  }
  .report-kpi-section {
    page-break-inside: avoid !important;
    margin-bottom: 16px !important;
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important;
    gap: 12px !important;
  }
  .report-kpi-section > div {
    page-break-inside: avoid !important;
  }
  .report-list-section {
    page-break-inside: avoid !important;
    margin-bottom: 16px !important;
  }
  table {
    border-collapse: collapse !important;
    width: 100% !important;
    font-size: 11pt !important;
  }
  thead {
    display: table-header-group !important;
  }
  tbody tr {
    page-break-inside: avoid !important;
  }
  th, td {
    border: 1px solid #DDD7C8 !important;
    padding: 8px 10px !important;
  }
  th {
    background: #F9F8F6 !important;
    font-weight: 600 !important;
  }
}
`

  return (
    <div className="public-report-page" style={{ minHeight: '100vh', background: PAGE_BG, overflowX: 'hidden' }}>
      <style>{PRINT_STYLES_FULL}</style>

      <header className="public-report-header" style={{ background: HEADER_GRADIENT, padding: isMobile ? '20px 16px' : '40px 28px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: isMobile ? 14 : 24, flexWrap: 'wrap', marginBottom: isMobile ? 14 : 24 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: isMobile ? 22 : 32, fontWeight: 800, color: '#FFFFFF', margin: 0, marginBottom: 7, lineHeight: 1.18, overflowWrap: 'anywhere' }}>{meetingTitle}</h1>
              <div style={{ fontSize: isMobile ? 13 : 15, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{meetingDate ? dateStamp(meetingDate) : '-'}</div>
            </div>
          </div>
          {meetingDescription && (
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 16, lineHeight: 1.6, maxWidth: 600 }}>
              {meetingDescription}
            </div>
          )}
          {subgroupFilter && (
            <div style={{ fontSize: 12, color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.2)', fontWeight: 500 }}>
              <Filter size={14} />
              {subgroupFilter}
            </div>
          )}

          {/* Subgroup filter badge — only on group-specific views */}
          {subgroupFilter && (
            <div style={{ fontSize: 12, color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.2)', fontWeight: 500, marginTop: 8 }}>
              <Filter size={14} />
              {subgroupFilter}
            </div>
          )}
        </div>
      </header>

      <main style={{ padding: isMobile ? '20px 16px 28px' : '40px 28px' }}>
        <div className="public-report-shell" style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Overall KPIs */}
          <div className="report-kpi-section" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isMobile ? 10 : 14 }}>
            <KpiTile label="Expected" value={expectedTotal} bg="#F4F1EA" bd="#EDE8DC" circle="rgba(76,42,146,.12)" labelColor="#9E9488" valueColor="#2D2A22" compact={isMobile} />
            <KpiTile label="Present" value={presentTotal} bg="#EEF6F1" bd="#C3E0CC" circle="rgba(45,134,83,.15)" labelColor="#2D8653" valueColor="#1B5E3C" compact={isMobile} />
            <KpiTile label="Absent" value={absentTotal} bg="#FEF0ED" bd="#F5C4B8" circle="rgba(201,72,48,.15)" labelColor="#C94830" valueColor="#7A1C24" compact={isMobile} />
            <KpiTile label="Reach" value={`${reachPct}%`} bg={band.bg} bd={band.border} circle={`${band.fg}22`} labelColor={band.fg} valueColor={band.fg} compact={isMobile} />
          </div>

          {/* ── SUBGROUP VIEW (full report, no active subgroup filter) ── */}
          {!activeSubgroup && availableSubgroups.length > 0 && report.bySubgroup ? (
            <>
              {/* Subgroup overview table */}
              <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ background: '#3D1A78', color: 'white', padding: '12px 18px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Subgroup Overview
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: isMobile ? 'fixed' : 'auto' }}>
                  <thead>
                    <tr>
                      {(isMobile ? ['Subgroup', 'Exp.', 'Here', 'Away', '%'] : ['Subgroup', 'Expected', 'Present', 'Absent', 'Reach']).map((h, index) => (
                        <th key={h} style={{
                          padding: isMobile ? '9px 5px' : '10px 16px', textAlign: h === 'Reach' || h === '%' ? 'right' : 'left',
                          fontSize: isMobile ? 9 : 11, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: isMobile ? '0.02em' : '0.06em',
                          width: isMobile ? (index === 0 ? '36%' : '16%') : undefined,
                          borderBottom: `1px solid ${PANEL_BORDER}`, background: '#FAFAF7',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {availableSubgroups.map((sg, i) => {
                      const sgData = report.bySubgroup[sg]
                      if (!sgData) return null
                      const sgExp = sgData.expected?.length ?? 0
                      const sgPres = sgData.present?.length ?? 0
                      const sgAbs = sgData.absent?.length ?? 0
                      const sgPct = sgExp > 0 ? Math.round((sgPres / sgExp) * 100) : 0
                      const sgBand = reachBand(sgExp > 0 ? sgPres / sgExp : 0)
                      return (
                        <tr key={sg} style={{ background: i % 2 === 0 ? 'transparent' : '#FAFAF7' }}>
                          <td style={{ padding: isMobile ? '10px 5px' : '11px 16px', borderBottom: `0.5px solid ${PANEL_BORDER}`, fontSize: isMobile ? 12 : 13, lineHeight: 1.35, overflowWrap: 'anywhere', fontWeight: 700, color: TEXT }}>{sg}</td>
                          <td style={{ padding: isMobile ? '10px 5px' : '11px 16px', borderBottom: `0.5px solid ${PANEL_BORDER}`, fontSize: isMobile ? 12 : 13, color: '#4A4A4A' }}>{sgExp}</td>
                          <td style={{ padding: isMobile ? '10px 5px' : '11px 16px', borderBottom: `0.5px solid ${PANEL_BORDER}`, fontSize: isMobile ? 12 : 13, color: '#085041', fontWeight: 600 }}>{sgPres}</td>
                          <td style={{ padding: isMobile ? '10px 5px' : '11px 16px', borderBottom: `0.5px solid ${PANEL_BORDER}`, fontSize: isMobile ? 12 : 13, color: sgAbs > 0 ? '#712B13' : '#4A4A4A', fontWeight: sgAbs > 0 ? 600 : 400 }}>{sgAbs}</td>
                          <td style={{ padding: isMobile ? '10px 5px' : '11px 16px', borderBottom: `0.5px solid ${PANEL_BORDER}`, textAlign: 'right' }}>
                            <span style={{
                              display: 'inline-block', minWidth: isMobile ? 0 : 44, textAlign: 'center',
                              borderRadius: 999, padding: isMobile ? '3px 4px' : '3px 10px', fontSize: isMobile ? 9 : 11,
                              color: sgBand.fg, background: sgBand.bg, border: `1px solid ${sgBand.border}`, fontWeight: 700,
                            }}>{sgPct}%</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Per-subgroup detail sections */}
              {availableSubgroups.map((sg) => {
                const sgData = report.bySubgroup[sg]
                if (!sgData) return null
                const sgExp = sgData.expected?.length ?? 0
                const sgPres = sgData.present?.length ?? 0
                const sgAbs = sgData.absent?.length ?? 0
                const sgPct = sgExp > 0 ? Math.round((sgPres / sgExp) * 100) : 0
                const sgBand = reachBand(sgExp > 0 ? sgPres / sgExp : 0)

                return (
                  <div key={sg} style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                    {/* Subgroup header */}
                    <div style={{
                      background: '#3D1A78', color: 'white', padding: '14px 18px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.01em' }}>{sg}</div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                          {sgPres} of {sgExp}
                        </span>
                        <span style={{
                          background: 'rgba(255,255,255,0.15)', borderRadius: 999,
                          padding: '4px 12px', fontSize: 13, fontWeight: 800,
                        }}>
                          {sgPct}%
                        </span>
                      </div>
                    </div>

                    {/* Mini KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: `1px solid ${PANEL_BORDER}` }}>
                      {[
                        { label: 'Expected', value: sgExp, color: '#3D1A78' },
                        { label: 'Present', value: sgPres, color: '#085041' },
                        { label: 'Absent', value: sgAbs, color: '#712B13' },
                      ].map((kpi, i) => (
                        <div key={kpi.label} style={{
                          padding: '12px 16px', textAlign: 'center',
                          borderRight: i < 2 ? `0.5px solid ${PANEL_BORDER}` : 'none',
                          background: '#FAFAF7',
                        }}>
                          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED }}>{kpi.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color, marginTop: 4, lineHeight: 1 }}>{kpi.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Two-column present/absent */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                      {/* Present */}
                      <div style={{ borderRight: `0.5px solid ${PANEL_BORDER}` }}>
                        <div style={{
                          padding: '10px 16px', borderBottom: `1px solid ${PANEL_BORDER}`,
                          background: '#F2FAF6', fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.1em', color: '#085041',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span>Present</span>
                          <span style={{ background: '#085041', color: 'white', borderRadius: 999, padding: '1px 8px', fontSize: 9, fontWeight: 700 }}>{sgPres}</span>
                        </div>
                        <div>
                          {(sgData.present ?? []).length === 0 ? (
                            <div style={{ padding: '16px', fontSize: 12, color: MUTED, fontStyle: 'italic' }}>Full attendance</div>
                          ) : (sgData.present ?? []).map((person, index) => (
                            <div key={(person.name ?? person) + index} style={{
                              padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
                              borderBottom: index < (sgData.present?.length ?? 0) - 1 ? `0.5px solid #F0ECE4` : 'none',
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#2D8653', flexShrink: 0 }} />
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT, flex: 1 }}>{typeof person === 'string' ? person : person.name}</span>
                              {person.leadership_category && (
                                <span style={{ fontSize: 10, color: MUTED }}>{person.leadership_category}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Absent */}
                      <div>
                        <div style={{
                          padding: '10px 16px', borderBottom: `1px solid ${PANEL_BORDER}`,
                          background: '#FEF5F2', fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.1em', color: '#712B13',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span>Absent</span>
                          <span style={{ background: '#712B13', color: 'white', borderRadius: 999, padding: '1px 8px', fontSize: 9, fontWeight: 700 }}>{sgAbs}</span>
                        </div>
                        <div>
                          {(sgData.absent ?? []).length === 0 ? (
                            <div style={{ padding: '16px', fontSize: 12, color: MUTED, fontStyle: 'italic' }}>No absences</div>
                          ) : (sgData.absent ?? []).map((person, index) => (
                            <div key={(person.name ?? person) + index} style={{
                              padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
                              borderBottom: index < (sgData.absent?.length ?? 0) - 1 ? `0.5px solid #F0ECE4` : 'none',
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#C94830', flexShrink: 0 }} />
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT, flex: 1 }}>{typeof person === 'string' ? person : person.name}</span>
                              {person.leadership_category && (
                                <span style={{ fontSize: 10, color: MUTED }}>{person.leadership_category}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* New Leaders section */}
              {unexpectedTotal > 0 && (
                <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{
                    background: '#3D1A78', color: 'white', padding: '12px 18px',
                    fontSize: 13, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>New Leaders</span>
                    <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{unexpectedTotal}</span>
                  </div>
                  <div>
                    {(report.unexpected_names ?? []).map((name, index) => (
                      <div key={name + index} style={{
                        padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: index < (report.unexpected_names?.length ?? 0) - 1 ? `0.5px solid #F0ECE4` : 'none',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: '#E8A020', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* ── SINGLE SUBGROUP or NO SUBGROUP DATA ── */}
              {activeSubgroup && (
                <div style={{ background: PANEL_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 12, padding: '16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{activeSubgroup}</div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: MUTED, flexWrap: 'wrap' }}>
                      <span>Expected {expectedTotal}</span>
                      <span>Present {presentTotal}</span>
                      <span>Absent {absentTotal}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: band.fg, background: band.bg, borderRadius: 12, padding: '8px 12px' }}>
                    {reachPct}%
                  </div>
                </div>
              )}

              <div className="report-list-section">
                <ListTable title="Who Attended" count={presentNames.length} tone={{ bg: '#EEF6F1', fg: '#1B5E3C' }} data={visibleReport?.presentData || presentNames} />
              </div>

              <div className="report-list-section">
                <ListTable title="Who Was Absent" count={absentNames.length} tone={{ bg: '#FEF0ED', fg: '#7A1C24' }} data={visibleReport?.absentData || absentNames} />
              </div>

              {unexpectedTotal > 0 && (
                <div className="report-list-section">
                  <ListTable title="New Leaders" count={unexpectedNames.length} tone={{ bg: '#FFF8EC', fg: '#7A5A00' }} data={visibleReport?.unexpectedData || unexpectedNames} />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer style={{ padding: '32px 28px 28px', textAlign: 'center', background: 'rgba(0,0,0,0.02)', borderTop: '1px solid #EDE8DC' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>
            Report generated on <span style={{ fontWeight: 600, color: TEXT }}>{dateStamp(report?.report_date)}</span>
          </div>
          {report?.id && (
            <div style={{ fontSize: 11, color: '#B4AFA3', letterSpacing: '0.05em', fontFamily: 'monospace' }}>
              {report.id.slice(0, 8).toUpperCase()}
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
