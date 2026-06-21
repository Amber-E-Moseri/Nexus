import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../context/ToastContext'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (err) {
    console.warn('Clipboard API failed, falling back to textarea method:', err)
  }

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

function formatReportDate(dateStr) {
  try {
    const d = parseISO(dateStr)
    return format(d, 'MMM d, yyyy')
  } catch {
    return dateStr
  }
}

function MeetingReportRow({ report, onViewDetails, onShareLink }) {
  const attended = report.attended_count ?? 0
  const absent = report.absent_count ?? 0
  const expected = report.expected_count ?? 0
  const rate = expected > 0 ? Math.round((attended / expected) * 100) : 0

  return (
    <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 12, marginBottom: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
          {report.label || 'Meeting Report'}
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
          {formatReportDate(report.report_date)}
        </div>
      </div>

      <div style={{ fontSize: 12, color: TEXT, marginBottom: 10, lineHeight: 1.5 }}>
        <div>Attended: <span style={{ fontWeight: 600 }}>{attended}</span> | Absent: <span style={{ fontWeight: 600 }}>{absent}</span> | Rate: <span style={{ fontWeight: 600, color: rate >= 75 ? '#2D8653' : rate >= 50 ? '#E8A020' : '#C94830' }}>{rate}%</span></div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => onViewDetails(report)}
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${PRIMARY}`,
            background: PRIMARY,
            color: 'white',
            cursor: 'pointer',
          }}
        >
          View Details
        </button>
        <button
          type="button"
          onClick={() => onShareLink(report)}
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${BORDER}`,
            background: 'white',
            color: PRIMARY,
            cursor: 'pointer',
          }}
        >
          Share Link
        </button>
      </div>
    </div>
  )
}

function SubgroupSection({ subgroupName, reports, onViewDetails, onShareLink }) {
  if (reports.length === 0) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${PRIMARY}` }}>
          {subgroupName}
        </div>
        <div style={{ fontSize: 12, color: MUTED, padding: '16px 0', textAlign: 'center' }}>
          No meeting reports yet
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${PRIMARY}` }}>
        {subgroupName}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {reports.map((report) => (
          <MeetingReportRow key={report.id} report={report} onViewDetails={onViewDetails} onShareLink={onShareLink} />
        ))}
      </div>
    </div>
  )
}

export default function PastorMeetingStatsWidget() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [subgroupsData, setSubgroupsData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false)
      return
    }

    let active = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        // 1. Get all subgroups where current user is a pastor
        const { data: assignments, error: assignmentError } = await supabase
          .from('pastor_subgroup_assignments')
          .select('subgroups(id, name)')
          .eq('user_id', profile.id)
          .eq('status', 'active')

        if (assignmentError) throw assignmentError
        if (!active) return

        const subgroups = (assignments ?? []).map((a) => a.subgroups).filter(Boolean)

        if (subgroups.length === 0) {
          if (active) {
            setSubgroupsData([])
            setLoading(false)
          }
          return
        }

        // 2. For each subgroup, fetch last 3 meeting reports
        const subgroupNames = subgroups.map((sg) => sg.name)

        const { data: reports, error: reportsError } = await supabase
          .from('meeting_attendance_reports')
          .select('id, label, report_date, attended_count, absent_count, expected_count, reach_pct, subgroup_filter, share_token')
          .order('report_date', { ascending: false })

        if (reportsError) throw reportsError
        if (!active) return

        // 3. Filter and organize by subgroup (client-side filtering)
        const groupedBySubgroup = Object.fromEntries(
          subgroupNames.map((name) => [
            name,
            (reports ?? [])
              .filter((report) => {
                if (!report.subgroup_filter) return false
                // subgroup_filter is comma-separated, e.g. "Subgroup A, Subgroup B"
                const filterNames = report.subgroup_filter
                  .split(',')
                  .map((s) => s.trim())
                return filterNames.includes(name)
              })
              .slice(0, 3), // Last 3 per subgroup
          ]),
        )

        if (active) {
          setSubgroupsData(
            subgroupNames.map((name) => ({
              name,
              reports: groupedBySubgroup[name] ?? [],
            })),
          )
          setLoading(false)
        }
      } catch (err) {
        console.error('Failed to load pastor meeting stats:', err)
        if (active) {
          setError(err.message || 'Failed to load meeting reports')
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [profile?.id])

  const handleViewDetails = (report) => {
    if (report.share_token) {
      navigate(`/reports/${report.share_token}`)
    } else {
      showToast('Report link not available', { tone: 'error' })
    }
  }

  const handleShareLink = async (report) => {
    if (!report.share_token) {
      showToast('Report link not available', { tone: 'error' })
      return
    }

    const shareUrl = `${window.location.origin}/reports/${report.share_token}`
    const success = await copyToClipboard(shareUrl)

    if (success) {
      showToast('Link copied to clipboard', { tone: 'success', duration: 2000 })
    } else {
      showToast('Failed to copy link', { tone: 'error' })
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', color: MUTED, fontSize: 13 }}>
        <div>Loading meeting reports…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '16px', background: '#FEF0ED', border: `1px solid #F3D0C8`, borderRadius: 10, color: '#C94830', fontSize: 13 }}>
        {error}
      </div>
    )
  }

  if (subgroupsData.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
        No subgroups assigned
      </div>
    )
  }

  return (
    <div style={{ padding: '16px' }}>
      {subgroupsData.map((group) => (
        <SubgroupSection
          key={group.name}
          subgroupName={group.name}
          reports={group.reports}
          onViewDetails={handleViewDetails}
          onShareLink={handleShareLink}
        />
      ))}
    </div>
  )
}
