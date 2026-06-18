import { useEffect, useState } from 'react'
import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { NavLink } from 'react-router-dom'
import { getUpcomingEvents } from '../../lib/calendar'
import { EVENT_COLORS } from '../../modules/calendar/CalendarEventCard'

function dateLabel(dateStr) {
  const d = parseISO(dateStr)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  return format(d, 'MMM d')
}

export default function UpcomingEventsWidget() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const data = await getUpcomingEvents(5)
        if (active) {
          const filtered = (data ?? []).filter((e) => e.status === 'approved')
          setEvents(filtered)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (events.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No upcoming events</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {events.map(evt => {
        const color = EVENT_COLORS[evt.event_type] || EVENT_COLORS.event
        return (
          <div key={evt.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: '#F0EDE6', color: '#6B6560', flexShrink: 0, minWidth: 52, textAlign: 'center',
            }}>
              {dateLabel(evt.start_date)}
            </div>
            <div style={{
              width: '3px',
              height: '16px',
              backgroundColor: color,
              borderRadius: '2px',
              flexShrink: 0
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {evt.title}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'var(--surface-tertiary)', color: 'var(--text-secondary)', flexShrink: 0, textTransform: 'capitalize' }}>
              {evt.event_type ?? 'event'}
            </span>
          </div>
        )
      })}
      <NavLink to="/calendar" style={{ fontSize: 12, color: '#4C2A92', fontWeight: 600, textDecoration: 'none', marginTop: 2 }}>
        View all →
      </NavLink>
    </div>
  )
}
