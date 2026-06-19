import { useState, useMemo } from 'react'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useMeetings } from './MeetingsContext'
import MeetingRecordTabs from './MeetingRecordTabs'

const TYPE_CHIP_COLORS = {
  general: '#4C2A92',
  team: '#1B72E8',
  media: '#E8A020',
  department: '#16A34A',
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

export default function MeetingsList({ onAddMeeting, onTasksAdded, canManage = false, onStartLive }) {
  const { meetings, loading, error } = useMeetings()
  const [selectedMeetingId, setSelectedMeetingId] = useState(null)
  const [activeType, setActiveType] = useState('all')

  const selectedMeeting = useMemo(
    () => meetings?.find((m) => m.id === selectedMeetingId) ?? null,
    [meetings, selectedMeetingId]
  )

  const grouped = useMemo(() => groupMeetingsByCategory(meetings || []), [meetings])
  const allTypes = useMemo(() => Object.keys(grouped).sort(), [grouped])
  const filteredMeetings = useMemo(() => {
    if (activeType === 'all') return meetings || []
    return grouped[activeType] || []
  }, [grouped, activeType, meetings])

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: 220, alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner label="Loading meetings" />
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          border: '1px solid var(--coral)',
          borderRadius: 12,
          background: 'var(--coral-light)',
          padding: '16px 18px',
          color: 'var(--coral-dark)',
          fontSize: 13,
        }}
      >
        Failed to load meetings: {error}
      </div>
    )
  }

  if (meetings.length === 0) {
    return (
      <div
        style={{
          border: '1px dashed var(--border)',
          borderRadius: 20,
          background: 'white',
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            margin: '0 auto 14px',
            display: 'flex',
            height: 56,
            width: 56,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 18,
            background: 'var(--accent-light)',
            fontSize: 24,
          }}
        >
          🗓
        </div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          No meetings logged yet
        </h3>
        <p style={{ margin: '8px auto 0', maxWidth: 520, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          Keep running Meeting OS as the live meeting workspace, then log the finished meeting here to keep summaries,
          attendance, and action items tied to the department.
        </p>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          {import.meta.env.VITE_MEETING_OS_URL ? (
            <a
              href={import.meta.env.VITE_MEETING_OS_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '9px 16px',
                borderRadius: 10,
                background: 'var(--accent)',
                color: 'white',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Open Meeting OS ↗
            </a>
          ) : null}
          {canManage && onAddMeeting ? (
            <button
              type="button"
              onClick={onAddMeeting}
              style={{
                padding: '9px 16px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'white',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Log first meeting
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const totalCount = filteredMeetings.length

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>
      {/* Left sidebar with meetings list */}
      <div
        style={{
          flex: '0 0 340px',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          padding: '16px 0',
          background: 'white',
        }}
      >
        {/* Category filter buttons */}
        <div style={{ paddingLeft: 16, paddingRight: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setActiveType('all')}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: activeType === 'all' ? 'none' : '1px solid var(--border)',
                background: activeType === 'all' ? 'var(--accent)' : 'white',
                color: activeType === 'all' ? 'white' : 'var(--text-primary)',
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
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: activeType === type ? 'none' : '1px solid var(--border)',
                  background: activeType === type ? 'var(--accent)' : 'white',
                  color: activeType === type ? 'white' : 'var(--text-primary)',
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
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {totalCount} meeting{totalCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Meeting list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {filteredMeetings.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No meetings in this category
            </div>
          ) : (
            filteredMeetings
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((meeting) => {
                const isSelected = selectedMeetingId === meeting.id
                return (
                  <button
                    key={meeting.id}
                    type="button"
                    onClick={() => setSelectedMeetingId(meeting.id)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: isSelected ? '#F3E8FF' : 'transparent',
                      border: isSelected ? '2px solid var(--accent)' : 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#FAFAF9'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {meeting.title}
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: TYPE_CHIP_COLORS[meeting.meeting_type] || '#E5E5E4',
                          color: 'white',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {meeting.meeting_type?.charAt(0).toUpperCase() + meeting.meeting_type?.slice(1) || 'General'}
                      </span>
                      <span>
                        {new Date(meeting.date).toLocaleDateString('en-CA', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </button>
                )
              })
          )}
        </div>
      </div>

      {/* Right panel with meeting details */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedMeeting ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--border)', padding: '16px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedMeeting.title}
                </h2>
                <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {new Date(selectedMeeting.date).toLocaleDateString('en-CA', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                  {' • '}
                  {selectedMeeting.meeting_type || 'General'}
                </div>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => onStartLive?.(selectedMeeting)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    paddingLeft: '12px',
                    paddingRight: '12px',
                    paddingTop: '8px',
                    paddingBottom: '8px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#DC2626',
                    }}
                  />
                  Start live
                </button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
              <MeetingRecordTabs meeting={selectedMeeting} />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
            Pick a meeting on the left, work the record on the right
          </div>
        )}
      </div>
    </div>
  )
}
