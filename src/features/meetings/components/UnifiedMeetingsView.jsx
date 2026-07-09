import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useMeetings } from '../MeetingsContext'
import StatsCards from './StatsCards'
import DepartmentFilter from './DepartmentFilter'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import CardGalleryView from '../../../components/meetings/CardGalleryView'
import ViewToggle from '../../../components/meetings/ViewToggle'
import { FONT_HEADING } from '../../../lib/fonts'

const TYPE_CHIP_COLORS = {
  general: '#4C2A92',
  team: '#1B72E8',
  media: '#E8A020',
  department: '#16A34A',
}

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_TONES = {
  scheduled: { bg: 'var(--accent-blue-tint)', text: 'var(--accent-blue-text)' },
  in_progress: { bg: 'var(--accent-yellow-tint)', text: 'var(--accent-yellow-text)' },
  completed: { bg: 'var(--accent-green-tint)', text: 'var(--accent-green-text)' },
  cancelled: { bg: 'var(--accent-red-tint)', text: 'var(--accent-red-text)' },
}

function toneForStatus(status) {
  return STATUS_TONES[status] ?? STATUS_TONES.scheduled
}

function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '?'
}

function getAttendanceSummary(attendance = []) {
  const present = attendance.filter((a) => a.status === 'present' && a.attendee?.name)
  const absentCount = attendance.filter((a) => a.status === 'absent').length
  return { present, absentCount }
}

function AttendanceSummary({ attendance }) {
  const { present, absentCount } = getAttendanceSummary(attendance)
  if (present.length === 0 && absentCount === 0) return null

  const visible = present.slice(0, 3)
  const overflow = present.length - visible.length

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {visible.length > 0 && (
        <div style={{ display: 'flex' }}>
          {visible.map((entry, idx) => (
            <div
              key={entry.attendee?.id ?? idx}
              title={entry.attendee?.name}
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--purple-tint)', color: 'var(--purple-700)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700,
                border: '1.5px solid white',
                marginLeft: idx === 0 ? 0 : -6,
              }}
            >
              {getInitials(entry.attendee?.name)}
            </div>
          ))}
          {overflow > 0 && (
            <div
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--surface-sub)', color: 'var(--ink-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700,
                border: '1.5px solid white',
                marginLeft: -6,
              }}
            >
              +{overflow}
            </div>
          )}
        </div>
      )}
      {absentCount > 0 && (
        <span
          style={{
            fontSize: 10.5, fontWeight: 700,
            color: 'var(--accent-red-text)', background: 'var(--accent-red-tint)',
            borderRadius: 999, padding: '2px 7px',
          }}
        >
          {absentCount} absent
        </span>
      )}
    </div>
  )
}

function groupMeetingsByCategory(meetings) {
  const groups = {}
  meetings.forEach((meeting) => {
    const type = meeting.meeting_type || 'general'
    if (!groups[type]) groups[type] = []
    groups[type].push(meeting)
  })
  return groups
}


export default function UnifiedMeetingsView({
  isSuperAdmin = false,
  departments = [],
  selectedDeptId,
  onDeptChange,
  canManage = false,
  onStartLive,
}) {
  const navigate = useNavigate()
  const { meetings, loading, removeMeeting, hasMore, loadMore, totalCount: totalMeetingCount } = useMeetings()
  const [activeType, setActiveType] = useState('all')
  const [viewMode, setViewMode] = useState('list')
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [hoveredId, setHoveredId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const isMobile = useMediaQuery('(max-width: 640px)')

  // Load KPI stats
  useEffect(() => {
    if (!selectedDeptId) return
    let active = true

    async function loadKpis() {
      setStatsLoading(true)
      try {
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const cutoff = thirtyDaysAgo.toISOString()

        let meetingsQuery = supabase
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', cutoff)

        let actionsQuery = supabase
          .from('tasks')
          .select('id')
          .not('meeting_id', 'is', null)

        let withMinutesQuery = supabase
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .not('minutes', 'is', null)

        if (selectedDeptId !== 'all') {
          meetingsQuery = meetingsQuery.eq('department_id', selectedDeptId)
          actionsQuery = actionsQuery.eq('department_id', selectedDeptId)
          withMinutesQuery = withMinutesQuery.eq('department_id', selectedDeptId)
        }

        const [
          { count: logged30d },
          { data: actionData },
          { count: withMinutes },
          { data: depts },
        ] = await Promise.all([
          meetingsQuery,
          actionsQuery,
          withMinutesQuery,
          supabase.from('departments').select('id'),
        ])

        if (!active) return
        setStats({
          logged30d: logged30d ?? 0,
          actionItems: actionData?.length ?? 0,
          withMinutes: withMinutes ?? 0,
          departments: depts?.length ?? 0,
        })
      } catch (error) {
        console.error('Stats computation error:', error)
      } finally {
        if (active) setStatsLoading(false)
      }
    }

    loadKpis()
    return () => {
      active = false
    }
  }, [selectedDeptId])

  // Filter meetings by department and type
  const filteredByDept = useMemo(() => {
    if (selectedDeptId === 'all') return meetings
    return meetings.filter((m) => m.department_id === selectedDeptId)
  }, [meetings, selectedDeptId])

  const grouped = useMemo(() => groupMeetingsByCategory(filteredByDept), [filteredByDept])
  const allTypes = useMemo(() => Object.keys(grouped).sort(), [grouped])
  const filteredMeetings = useMemo(() => {
    if (activeType === 'all') return filteredByDept
    return grouped[activeType] || []
  }, [grouped, activeType, filteredByDept])

  const handleDelete = async (event, meeting) => {
    event.stopPropagation()
    if (!window.confirm(`Delete "${meeting.title}"? This can't be undone.`)) return
    setDeletingId(meeting.id)
    try {
      await removeMeeting(meeting.id)
    } catch (err) {
      console.error('Failed to delete meeting:', err)
      window.alert('Failed to delete meeting. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: 300, alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner label="Loading meetings" />
      </div>
    )
  }

  const totalCount = filteredMeetings.length

  const TYPE_ICONS = { general: '🗓', team: '👥', media: '🎬', department: '🏛' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-app)' }}>
      {/* Stats Cards Section */}
      {stats && isSuperAdmin && (
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-1)', background: 'var(--surface-card)', flexShrink: 0 }}>
          <StatsCards stats={stats} />
        </div>
      )}

      {/* Filters Section */}
      {isSuperAdmin && (
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-1)', background: 'var(--surface-card)', flexShrink: 0 }}>
          <label style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
            Department
          </label>
          <DepartmentFilter
            departments={departments}
            selected={selectedDeptId}
            onChange={onDeptChange}
            count={filteredByDept.length}
          />
        </div>
      )}

      {/* Filter chips + view toggle */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-1)', background: 'var(--surface-card)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Filter meetings by type">
            <button
              type="button"
              onClick={() => setActiveType('all')}
              aria-pressed={activeType === 'all'}
              style={{
                padding: '5px 14px',
                borderRadius: 999,
                border: activeType === 'all' ? 'none' : '1px solid var(--border-1)',
                background: activeType === 'all' ? 'var(--purple-700)' : 'white',
                color: activeType === 'all' ? 'white' : 'var(--ink-2)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All
            </button>
            {allTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                aria-pressed={activeType === type}
                style={{
                  padding: '5px 14px',
                  borderRadius: 999,
                  border: activeType === type ? 'none' : '1px solid var(--border-1)',
                  background: activeType === type ? 'var(--purple-700)' : 'white',
                  color: activeType === type ? 'white' : 'var(--ink-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          {!isMobile && <ViewToggle view={viewMode} onViewChange={setViewMode} />}
        </div>
        <div style={{ fontFamily: FONT_HEADING, fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {totalCount} meeting{totalCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Meeting grid / list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {viewMode === 'list' ? (
          filteredMeetings.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              No meetings in this category
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredMeetings
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map((meeting) => {
                  const typeColor = TYPE_CHIP_COLORS[meeting.meeting_type] || 'var(--ink-3)'
                  const icon = TYPE_ICONS[meeting.meeting_type] || '🗓'
                  const statusTone = toneForStatus(meeting.status)
                  const isHovered = hoveredId === meeting.id

                  return (
                    <div
                      key={meeting.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/meetings/${meeting.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/meetings/${meeting.id}`) }}
                      onMouseEnter={() => setHoveredId(meeting.id)}
                      onMouseLeave={() => setHoveredId((current) => (current === meeting.id ? null : current))}
                      aria-label={`${meeting.title}, ${new Date(meeting.date).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}`}
                      style={{
                        position: 'relative',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        background: isHovered ? 'var(--purple-tint)' : 'white',
                        border: `1px solid ${isHovered ? 'var(--purple-500)' : 'var(--border-1)'}`,
                        borderRadius: 14,
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.14s',
                        boxShadow: '0 1px 3px rgba(28,22,16,.05)',
                      }}
                    >
                      <div style={{
                        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                        background: `${typeColor}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18,
                      }}>
                        {icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {meeting.title}
                          </span>
                          <span
                            style={{
                              display: 'inline-block', flexShrink: 0, padding: '2px 8px', borderRadius: 999,
                              background: statusTone.bg, color: statusTone.text,
                              fontSize: 10.5, fontWeight: 700,
                            }}
                          >
                            {STATUS_LABELS[meeting.status] ?? STATUS_LABELS.scheduled}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                            background: `${typeColor}20`, color: typeColor,
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {meeting.meeting_type?.charAt(0).toUpperCase() + meeting.meeting_type?.slice(1) || 'General'}
                          </span>
                          <span>
                            {new Date(meeting.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <AttendanceSummary attendance={meeting.attendance} />
                        </div>
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, meeting)}
                          disabled={deletingId === meeting.id}
                          aria-label={`Delete ${meeting.title}`}
                          style={{
                            flexShrink: 0,
                            width: 30, height: 30,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: 8, border: '1px solid var(--border-1)',
                            background: 'white', color: 'var(--accent-red-text)',
                            cursor: deletingId === meeting.id ? 'default' : 'pointer',
                            opacity: isHovered ? 1 : 0,
                            transition: 'opacity .13s',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <span style={{ color: 'var(--ink-3)', fontSize: 16, flexShrink: 0 }}>›</span>
                    </div>
                  )
                })}
            </div>
          )
        ) : (
          <CardGalleryView
            meetings={filteredMeetings.sort((a, b) => new Date(b.date) - new Date(a.date))}
            selectedMeeting={null}
            onSelectMeeting={(m) => navigate(`/meetings/${m.id}`)}
            title=""
            emptyMessage="No meetings in this category"
            showAttendance
          />
        )}

        {hasMore ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
            <button
              type="button"
              onClick={loadMore}
              style={{
                border: '1px solid var(--border)',
                background: 'white',
                color: 'var(--accent)',
                borderRadius: 9,
                padding: '8px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Load older meetings ({meetings.length} of {totalMeetingCount})
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
