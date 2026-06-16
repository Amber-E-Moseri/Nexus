import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { useMeetings } from './MeetingsContext'
import MeetingCard from './MeetingCard'

export default function MeetingsList({ onAddMeeting, onTasksAdded, canManage = false }) {
  const { meetings, loading, error } = useMeetings()

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {meetings.map((meeting) => (
        <MeetingCard key={meeting.id} meeting={meeting} canManage={canManage} onTasksAdded={onTasksAdded} />
      ))}
    </div>
  )
}
