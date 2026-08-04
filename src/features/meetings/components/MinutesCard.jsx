import { useNavigate } from 'react-router-dom'
import { CalendarDays, Users } from 'lucide-react'

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
// snippet is a pre-computed plain-text string (max 120 chars); callers
// derive it from meeting.notes_text so no tree-walking happens here.
export default function MinutesCard({ meeting, snippet, onClick, readOnly = false }) {
  const navigate = useNavigate()

  function handleClick() {
    if (readOnly) return
    if (onClick) {
      onClick(meeting)
    } else {
      navigate(`/meetings/${meeting.id}?tab=minutes`)
    }
  }

  const deptName = (meeting.department_name || '').toLowerCase()
  const chipColor = Object.entries(DEPT_COLORS).find(([k]) => deptName.includes(k))?.[1] ?? '#7A6F5E'
  const attendees = meeting.attendance ?? []

  return (
    <div
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onClick={readOnly ? undefined : handleClick}
      onKeyDown={readOnly ? undefined : (e => e.key === 'Enter' && handleClick())}
      style={{
        background: 'var(--surface, #FFFFFF)',
        border: '1px solid var(--border, #E9E4D8)',
        borderRadius: 10,
        padding: '14px 16px',
        cursor: readOnly ? 'default' : 'pointer',
        transition: readOnly ? undefined : 'box-shadow 0.15s, border-color 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onMouseEnter={readOnly ? undefined : (e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.09)'
        e.currentTarget.style.borderColor = 'var(--color-primary, #4C2A92)'
      })}
      onMouseLeave={readOnly ? undefined : (e => {
        e.currentTarget.style.boxShadow = ''
        e.currentTarget.style.borderColor = 'var(--border, #E9E4D8)'
      })}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #1C1610)', lineHeight: 1.3 }}>
          {meeting.title}
        </div>
        {meeting.department_name && (
          <span style={{
            flexShrink: 0,
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
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary, #7A6F5E)', fontWeight: 500 }}>
        <CalendarDays size={13} />
        {formatDate(meeting.date)}
      </div>

      {/* Snippet */}
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
