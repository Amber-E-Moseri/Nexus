import { useNavigate } from 'react-router-dom'
import { CalendarDays, ExternalLink, Users } from 'lucide-react'

const DEPT_COLORS = {
  admin:    '#4C2A92',
  media:    '#2D8653',
  ors:      '#E8A020',
  pastors:  '#F06449',
  pfcc:     '#2E86AB',
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-CA', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

// MinutesCard — used by both the timeline and search results.
// snippet: pre-computed plain-text string (max 120 chars).
// canNavigate: creator — clicking navigates to the full meeting page.
// showMeetingLink: super_admin — shows an "Open" button alongside viewer.
// Everyone else: viewer modal opens on click.
// onOpenViewer(meeting) is called when a non-creator, non-readOnly user clicks the card.
// The parent page is responsible for rendering MeetingMinutesViewer.
export default function MinutesCard({ meeting, snippet, onClick, readOnly = false, canNavigate = false, showMeetingLink = false, onOpenViewer }) {
  const navigate = useNavigate()

  function handleClick() {
    if (readOnly) return
    if (onClick) { onClick(meeting); return }
    if (onOpenViewer) {
      onOpenViewer(meeting)
    } else if (canNavigate) {
      navigate(`/meetings/${meeting.id}?tab=minutes`)
    }
  }

  function handleOpenMeeting(e) {
    e.stopPropagation()
    navigate(`/meetings/${meeting.id}?tab=minutes`)
  }

  const deptName = (meeting.department_name || '').toLowerCase()
  const chipColor = Object.entries(DEPT_COLORS).find(([k]) => deptName.includes(k))?.[1] ?? '#7A6F5E'
  const attendees = meeting.attendance ?? []
  const isClickable = !readOnly

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? (e => e.key === 'Enter' && handleClick()) : undefined}
      style={{
        background: 'var(--surface, #FFFFFF)',
        border: '1px solid var(--border, #E9E4D8)',
        borderRadius: 10,
        padding: '14px 16px',
        cursor: isClickable ? 'pointer' : 'default',
        transition: isClickable ? 'box-shadow 0.15s, border-color 0.15s' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onMouseEnter={isClickable ? (e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.09)'
        e.currentTarget.style.borderColor = 'var(--color-primary, #4C2A92)'
      }) : undefined}
      onMouseLeave={isClickable ? (e => {
        e.currentTarget.style.boxShadow = ''
        e.currentTarget.style.borderColor = 'var(--border, #E9E4D8)'
      }) : undefined}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #1C1610)', lineHeight: 1.3 }}>
          {meeting.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {meeting.department_name && (
            <span style={{
              padding: '2px 7px',
              borderRadius: 20,
              fontSize: 10,
              fontWeight: 700,
              color: chipColor,
              background: chipColor + '18',
              letterSpacing: '.03em',
            }}>
              {meeting.department_name}
            </span>
          )}
          {showMeetingLink && (
            <button
              onClick={handleOpenMeeting}
              title="Open full meeting"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1px solid var(--border, #E9E4D8)', borderRadius: 6, background: 'var(--surface, #fff)', color: 'var(--text-secondary, #7A6F5E)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <ExternalLink size={11} />
              Open
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary, #7A6F5E)', fontWeight: 500 }}>
        <CalendarDays size={13} />
        {formatDate(meeting.date)}
      </div>

      {/* Snippet preview */}
      {snippet && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-secondary, #7A6F5E)',
          lineHeight: 1.5,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {snippet}
        </div>
      )}

      {/* Attendee avatars */}
      {attendees.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
          <Users size={13} color="var(--text-secondary, #7A6F5E)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {attendees.slice(0, 5).map((a, i) => {
            const name = a.attendee?.name || a.name || '?'
            const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div
                key={a.user_id || i}
                title={name}
                style={{
                  width: 22, height: 22,
                  borderRadius: '50%',
                  background: 'var(--color-primary, #4C2A92)',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginLeft: i === 0 ? 0 : -5,
                  border: '2px solid var(--surface, #FFFFFF)',
                  zIndex: 5 - i,
                  position: 'relative',
                }}
              >
                {initials}
              </div>
            )
          })}
          {attendees.length > 5 && (
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #7A6F5E)', marginLeft: 4, fontWeight: 500 }}>
              +{attendees.length - 5}
            </span>
          )}
          </div>
        </div>
      )}
    </div>
  )
}
