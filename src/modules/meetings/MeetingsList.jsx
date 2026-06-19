import { useState, useMemo } from 'react'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useMeetings } from './MeetingsContext'
import MeetingRecordTabs from './MeetingRecordTabs'

export default function MeetingsList({ onAddMeeting, onTasksAdded, canManage = false }) {
  const { meetings, loading, error } = useMeetings()
  const [selectedMeetingId, setSelectedMeetingId] = useState(null)

  const selectedMeeting = useMemo(
    () => meetings?.find((m) => m.id === selectedMeetingId) ?? null,
    [meetings, selectedMeetingId]
  )

  const meetingsByWeek = useMemo(() => {
    if (!meetings || meetings.length === 0) return {}

    const now = new Date()
    const thisWeekStart = new Date(now)
    thisWeekStart.setDate(now.getDate() - now.getDay())
    thisWeekStart.setHours(0, 0, 0, 0)

    const grouped = {}
    meetings.forEach((meeting) => {
      const meetingDate = new Date(meeting.date)
      meetingDate.setHours(0, 0, 0, 0)

      let period = 'Earlier'
      if (meetingDate >= thisWeekStart) {
        period = 'THIS WEEK'
      }

      if (!grouped[period]) {
        grouped[period] = []
      }
      grouped[period].push(meeting)
    })

    return grouped
  }, [meetings])

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

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', minHeight: 500 }}>
      {/* Left sidebar with meetings list */}
      <div
        style={{
          flex: '0 0 350px',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          paddingRight: 16,
        }}
      >
        {Object.entries(meetingsByWeek).map(([period, periodMeetings]) => (
          <div key={period} style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                marginBottom: 12,
                paddingLeft: 8,
              }}
            >
              {period}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {periodMeetings.map((meeting) => {
                const formattedDate = new Date(meeting.date).toLocaleDateString('en-CA', {
                  month: 'short',
                  day: 'numeric',
                })
                const isSelected = selectedMeetingId === meeting.id

                return (
                  <button
                    key={meeting.id}
                    type="button"
                    onClick={() => setSelectedMeetingId(meeting.id)}
                    style={{
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: 12,
                      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--accent-light)' : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: 4,
                      }}
                    >
                      {meeting.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {formattedDate}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Right panel with meeting details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedMeeting ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ marginBottom: 16, paddingRight: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    height: 40,
                    width: 40,
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    background: 'var(--surface-secondary)',
                    fontSize: 18,
                  }}
                >
                  🎙
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedMeeting.title}
                  </h2>
                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>
                      {new Date(selectedMeeting.date).toLocaleDateString('en-CA', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    {selectedMeeting.attendance?.filter((e) => e.status === 'present').length > 0 && (
                      <>
                        <span>•</span>
                        <span>
                          {selectedMeeting.attendance.filter((e) => e.status === 'present').length} attendees
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {selectedMeeting.drive_url && (
                  <a
                    href={selectedMeeting.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flexShrink: 0,
                      padding: '6px 12px',
                      borderRadius: 8,
                      background: 'var(--surface-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Export PDF
                  </a>
                )}
              </div>
            </div>

            <MeetingRecordTabs meeting={selectedMeeting} />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
            Pick a meeting on the left, work the record on the right — agenda, attendance, minutes and action items in one place.
          </div>
        )}
      </div>
    </div>
  )
}
