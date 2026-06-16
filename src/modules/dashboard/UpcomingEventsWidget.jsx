import { useEffect, useState } from 'react'
import { format, isToday, isTomorrow, parseISO } from 'date-fns'
import { NavLink } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const EVENT_TYPE_COLORS = {
  conference:  { bg: '#EDE8F8', text: '#4C2A92' },
  program:     { bg: '#EBF7F1', text: '#2D8653' },
  training:    { bg: '#FFF8EC', text: '#D17A1C' },
  prayer:      { bg: '#FEF8E7', text: '#B87D0E' },
  graduation:  { bg: '#EBF7F1', text: '#2D8653' },
  event:       { bg: '#F4F1EA', text: '#6B6560' },
  deadline:    { bg: '#FEF0ED', text: '#C94830' },
}

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
        const { data } = await supabase
          .from('calendar_events')
          .select('id, title, start_date, end_date, event_type, all_day')
          .gte('start_date', new Date().toISOString())
          .order('start_date', { ascending: true })
          .limit(5)
        if (active) setEvents(data ?? [])
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
        const col = EVENT_TYPE_COLORS[evt.event_type] ?? EVENT_TYPE_COLORS.event
        return (
          <div key={evt.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: '#F0EDE6', color: '#6B6560', flexShrink: 0, minWidth: 52, textAlign: 'center',
            }}>
              {dateLabel(evt.start_date)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {evt.title}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: col.bg, color: col.text, flexShrink: 0 }}>
              {evt.event_type ?? 'event'}
            </span>
          </div>
        )
      })}
      <NavLink to="/calendar" style={{ fontSize: 12, color: '#4C2A92', fontWeight: 600, textDecoration: 'none', marginTop: 2 }}>
        View calendar →
      </NavLink>
    </div>
  )
}
