import { useState, useMemo } from 'react'
import { useMeetings } from './MeetingsContext'
import MeetingRecordTabs from './MeetingRecordTabs'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

const TYPE_CHIP_COLORS = {
  general: '#4C2A92',
  team: '#1B72E8',
  media: '#E8A020',
  department: '#16A34A',
}

function groupMeetingsByWeek(meetings) {
  const now = new Date()
  const startOfThisWeek = new Date(now)
  startOfThisWeek.setDate(now.getDate() - now.getDay())
  startOfThisWeek.setHours(0, 0, 0, 0)

  const startOfLastWeek = new Date(startOfThisWeek)
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7)

  const thisWeek = []
  const lastWeek = []
  const older = []

  meetings.forEach((meeting) => {
    const meetingDate = new Date(meeting.date)
    meetingDate.setHours(0, 0, 0, 0)

    if (meetingDate >= startOfThisWeek) {
      thisWeek.push(meeting)
    } else if (meetingDate >= startOfLastWeek) {
      lastWeek.push(meeting)
    } else {
      older.push(meeting)
    }
  })

  return { thisWeek, lastWeek, older }
}

function MeetingListItem({ meeting, isActive, onSelect, actionCount = 0 }) {
  const meetingDate = new Date(meeting.date)
  const formattedDate = meetingDate.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <button
      type="button"
      onClick={() => onSelect(meeting)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: isActive ? '#F3E8FF' : 'transparent',
        border: isActive ? '2px solid #4C2A92' : 'none',
        borderLeft: isActive ? 'none' : '2px solid transparent',
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = '#FAFAF9'
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meeting.title}
        </div>
        <div
          style={{
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#7E7D78',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              paddingX: '6px',
              borderRadius: 4,
              background: TYPE_CHIP_COLORS[meeting.meeting_type] || '#E5E5E4',
              color: 'white',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 6px',
            }}
          >
            {meeting.meeting_type ? meeting.meeting_type.charAt(0).toUpperCase() + meeting.meeting_type.slice(1) : 'General'}
          </span>
          <span>{formattedDate}</span>
        </div>
      </div>
      {actionCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 24,
            height: 24,
            borderRadius: 6,
            background: '#FED7AA',
            fontSize: 11,
            fontWeight: 700,
            color: '#92400E',
          }}
        >
          {actionCount}
        </div>
      )}
    </button>
  )
}

export default function MeetingsWorkspace({ onStartLive, canManage }) {
  const navigate = useNavigate()
  const { meetings, loading } = useMeetings()
  const [selectedMeeting, setSelectedMeeting] = useState(null)

  const grouped = useMemo(() => groupMeetingsByWeek(meetings), [meetings])

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: 300, alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner label="Loading meetings" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', overflow: 'hidden' }}>
      {/* Left pane - meeting list */}
      <div
        style={{
          flex: '0 0 320px',
          overflowY: 'auto',
          borderRight: '1px solid var(--border)',
          paddingRight: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.thisWeek.length > 0 && (
            <div>
              <div
                style={{
                  paddingLeft: 14,
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#9E9488',
                }}
              >
                This week
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grouped.thisWeek.map((meeting) => (
                  <MeetingListItem
                    key={meeting.id}
                    meeting={meeting}
                    isActive={selectedMeeting?.id === meeting.id}
                    onSelect={setSelectedMeeting}
                    actionCount={0}
                  />
                ))}
              </div>
            </div>
          )}

          {grouped.lastWeek.length > 0 && (
            <div>
              <div
                style={{
                  paddingLeft: 14,
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#9E9488',
                }}
              >
                Last week
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grouped.lastWeek.map((meeting) => (
                  <MeetingListItem
                    key={meeting.id}
                    meeting={meeting}
                    isActive={selectedMeeting?.id === meeting.id}
                    onSelect={setSelectedMeeting}
                    actionCount={0}
                  />
                ))}
              </div>
            </div>
          )}

          {grouped.older.length > 0 && (
            <div>
              <div
                style={{
                  paddingLeft: 14,
                  marginBottom: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#9E9488',
                }}
              >
                Older
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grouped.older.map((meeting) => (
                  <MeetingListItem
                    key={meeting.id}
                    meeting={meeting}
                    isActive={selectedMeeting?.id === meeting.id}
                    onSelect={setSelectedMeeting}
                    actionCount={0}
                  />
                ))}
              </div>
            </div>
          )}

          {meetings.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9E9488', fontSize: 13 }}>
              No meetings yet
            </div>
          )}
        </div>
      </div>

      {/* Right pane - meeting record */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedMeeting ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1C1C1C' }}>
                  {selectedMeeting.title}
                </h2>
                <div style={{ marginTop: 4, fontSize: 13, color: '#7E7D78' }}>
                  {new Date(selectedMeeting.date).toLocaleDateString('en-CA', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                  {' • '}
                  {selectedMeeting.meeting_type}
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
                    paddingX: '12px',
                    paddingY: '8px',
                    borderRadius: 8,
                    border: '1px solid #E5E5E4',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#1C1C1C',
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
            <div style={{ flex: 1, overflowY: 'auto', marginTop: 12 }}>
              <MeetingRecordTabs meeting={selectedMeeting} />
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#9E9488',
              fontSize: 14,
            }}
          >
            Pick a meeting on the left, work the record on the right.
          </div>
        )}
      </div>
    </div>
  )
}
