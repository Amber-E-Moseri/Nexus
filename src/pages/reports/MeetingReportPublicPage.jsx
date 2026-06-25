import { useEffect, useMemo, useState, useRef } from 'react'
import { CalendarRange, Filter, Link2, Printer, Users } from 'lucide-react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
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
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, padding: '20px 18px', background: bg, border: `1px solid ${bd}`, transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ position: 'absolute', right: -20, bottom: -28, width: 80, height: 80, borderRadius: 999, background: circle, opacity: 0.6 }} />
      <div style={{ position: 'relative', fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: labelColor, marginBottom: 8 }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 32, fontWeight: 800, color: valueColor, lineHeight: 1 }}>{value}</div>
      {detail ? <div style={{ position: 'relative', marginTop: 8, fontSize: 13, color: labelColor, fontWeight: 600 }}>{detail}</div> : null}
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

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [activeSubgroup, setActiveSubgroup] = useState('')
  const isInitialMount = useRef(true)
  const isSharedLink = !!share_token

  // Read activeSubgroup from URL params on mount
  useEffect(() => {
    const subgroupFromUrl = searchParams.get('subgroup') || ''
    console.log('Reading subgroup from URL:', subgroupFromUrl)
    if (subgroupFromUrl !== activeSubgroup) {
      setActiveSubgroup(subgroupFromUrl)
    }
    isInitialMount.current = false
  }, [])

  // Lock activeSubgroup to subgroup_filter on shared links
  useEffect(() => {
    if (isSharedLink && report?.subgroup_filter) {
      console.log('Shared link detected - locking to subgroup_filter:', report.subgroup_filter)
      setActiveSubgroup(report.subgroup_filter)
    }
  }, [report, isSharedLink])

  // Sync activeSubgroup with URL query parameter using browser history API
  useEffect(() => {
    console.log('useEffect fired. isInitialMount:', isInitialMount.current, 'activeSubgroup:', activeSubgroup)
    if (isInitialMount.current) {
      console.log('Skipping - still on initial mount')
      return
    }

    console.log('✓ activeSubgroup changed to:', activeSubgroup)

    if (activeSubgroup) {
      const newUrl = `${window.location.pathname}?subgroup=${encodeURIComponent(activeSubgroup)}`
      console.log('✓ Updating URL to:', newUrl)
      window.history.replaceState(null, '', newUrl)
    } else {
      console.log('✓ Clearing URL params')
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
        console.error('Report lookup error:', error)
        console.error('Data:', data)
        console.log('Looking for share_token:', share_token)
        setReport(null)
        setNotFound(true)
        setLoading(false)
        return
      }

      console.log('Report found:', data)
      console.log('Meeting data:', meetingData)

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
    <div className="public-report-page" style={{ minHeight: '100vh', background: PAGE_BG }}>
      <style>{PRINT_STYLES_FULL}</style>

      <header className="public-report-header" style={{ background: HEADER_GRADIENT, padding: '40px 28px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 32, fontWeight: 800, color: '#FFFFFF', margin: 0, marginBottom: 12, letterSpacing: '-0.01em' }}>{meetingTitle}</h1>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{meetingDate ? dateStamp(meetingDate) : '-'}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                const url = window.location.href
                console.log('Copy button clicked, URL:', url)
                setShowLinkModal(true)
              }}
              className="public-report-actions"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,0.12)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 10,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(255,255,255,0.18)'; e.target.style.borderColor = 'rgba(255,255,255,0.35)' }}
              onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.borderColor = 'rgba(255,255,255,0.25)' }}
            >
              <Link2 size={16} />
              Share
            </button>
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

          {/* Subgroup Navigation Tabs - Hidden on shared links */}
          {!isSharedLink && availableSubgroups.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setActiveSubgroup('')}
                style={{
                  border: activeSubgroup ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.4)',
                  background: activeSubgroup ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.12)',
                  color: activeSubgroup ? '#B8D4FF' : '#FFFFFF',
                  borderRadius: 999,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                All Subgroups
              </button>
              {availableSubgroups.map((subgroup) => (
                <button
                  key={subgroup}
                  type="button"
                  onClick={() => setActiveSubgroup(subgroup)}
                  style={{
                    border: activeSubgroup === subgroup ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.2)',
                    background: activeSubgroup === subgroup ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                    color: activeSubgroup === subgroup ? '#FFFFFF' : '#B8D4FF',
                    borderRadius: 999,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {subgroup}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main style={{ padding: '40px 28px' }}>
        <div className="public-report-shell" style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="report-kpi-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
            <KpiTile label="Expected" value={expectedTotal} bg="#F4F1EA" bd="#EDE8DC" circle="rgba(76,42,146,.12)" labelColor="#9E9488" valueColor="#2D2A22" />
            <KpiTile label="Attended" value={presentTotal} detail={`${attendancePct}%`} bg="#EEF6F1" bd="#C3E0CC" circle="rgba(45,134,83,.15)" labelColor="#2D8653" valueColor="#1B5E3C" />
            <KpiTile label="Absent" value={absentTotal} bg="#FEF0ED" bd="#F5C4B8" circle="rgba(201,72,48,.15)" labelColor="#C94830" valueColor="#7A1C24" />
            <KpiTile label="Attendance %" value={`${attendancePct}%`} bg="#FFF4CC" bd="#EDD88A" circle="rgba(232,160,32,.15)" labelColor="#7A5A00" valueColor="#7A5A00" />
            <KpiTile label="Unexpected" value={unexpectedTotal} bg="#FFF8EC" bd="#EDD88A" circle="rgba(232,160,32,.15)" labelColor="#E8A020" valueColor="#7A5A00" />
          </div>

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
              <ListTable title="Unexpected Attendees" count={unexpectedNames.length} tone={{ bg: '#FFF8EC', fg: '#7A5A00' }} data={visibleReport?.unexpectedData || unexpectedNames} />
            </div>
          )}
        </div>
      </main>

      {showLinkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '32px', maxWidth: 520, boxShadow: '0 25px 80px rgba(0,0,0,0.15), 0 10px 32px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.05)' }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1C1C1C', letterSpacing: '-0.01em' }}>Share Report</h2>
              <p style={{ margin: '8px 0 0 0', fontSize: 14, color: '#8B8680', lineHeight: 1.5 }}>Anyone with this link can view the report</p>
            </div>

            {/* Link Display */}
            <div style={{ background: '#F9F8F6', border: '1px solid #E8DFD5', borderRadius: 12, padding: '16px 14px', marginBottom: 24, cursor: 'text' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#A89A8E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Report Link</div>
              <div style={{ fontSize: 13, fontFamily: 'Monaco, monospace', color: '#2C2C2A', lineHeight: 1.6, wordBreak: 'break-all', userSelect: 'all', background: '#FFFFFF', padding: '12px', borderRadius: 8, border: '1px solid #EDE8DC', fontWeight: 500 }}>
                {window.location.href}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                style={{
                  padding: '11px 20px',
                  borderRadius: 10,
                  border: '1px solid #DDD7C8',
                  background: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#2C2C2A',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                }}
                onMouseEnter={(e) => { e.target.style.background = '#F9F8F6'; e.target.style.borderColor = '#C8BFB3' }}
                onMouseLeave={(e) => { e.target.style.background = '#FFFFFF'; e.target.style.borderColor = '#DDD7C8' }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = window.location.href
                  console.log('Copy button clicked, URL:', text)

                  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    console.log('Attempting Clipboard API...')
                    navigator.clipboard.writeText(text)
                      .then(() => {
                        console.log('✓ Clipboard API succeeded')
                        setCopiedLink(true)
                        setTimeout(() => setCopiedLink(false), 2000)
                        setTimeout(() => setShowLinkModal(false), 800)
                      })
                      .catch(err => {
                        console.error('✗ Clipboard API failed:', err)
                        fallbackCopy(text)
                      })
                  } else {
                    console.log('Clipboard API not available, using fallback')
                    fallbackCopy(text)
                  }

                  function fallbackCopy(str) {
                    try {
                      console.log('Attempting execCommand fallback...')
                      const el = document.createElement('textarea')
                      el.value = str
                      el.style.position = 'absolute'
                      el.style.left = '-9999px'
                      el.style.opacity = '0'
                      document.body.appendChild(el)
                      el.select()
                      el.setSelectionRange(0, 99999)
                      const result = document.execCommand('copy')
                      document.body.removeChild(el)
                      console.log('execCommand result:', result)
                      if (result) {
                        console.log('✓ Fallback copy succeeded')
                        setCopiedLink(true)
                        setTimeout(() => setCopiedLink(false), 2000)
                        setTimeout(() => setShowLinkModal(false), 800)
                      } else {
                        throw new Error('execCommand returned false')
                      }
                    } catch (fallbackErr) {
                      console.error('✗ Fallback copy failed:', fallbackErr)
                      alert('Copy failed. Please select the link above and use Ctrl+C (or Cmd+C on Mac) to copy.')
                    }
                  }
                }}
                style={{
                  padding: '11px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: copiedLink ? '#E8DFC8' : '#4C2A92',
                  color: copiedLink ? '#7A5A00' : 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  boxShadow: copiedLink ? '0 1px 2px rgba(122,90,0,0.1)' : '0 4px 12px rgba(76,42,146,0.25)'
                }}
                onMouseEnter={(e) => { if (!copiedLink) { e.target.style.background = '#5D3BA3'; e.target.style.boxShadow = '0 6px 16px rgba(76,42,146,0.35)' } }}
                onMouseLeave={(e) => { if (!copiedLink) { e.target.style.background = '#4C2A92'; e.target.style.boxShadow = '0 4px 12px rgba(76,42,146,0.25)' } }}
              >
                {copiedLink ? '✓ Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
        </div>
      )}

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
