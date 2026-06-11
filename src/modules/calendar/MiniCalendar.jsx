import { Link } from 'react-router-dom'
import { EVENT_COLORS } from './CalendarEventCard'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function startOfGrid(year, month) {
  const first = new Date(year, month, 1)
  const day = (first.getDay() + 6) % 7
  first.setDate(first.getDate() - day)
  return first
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function MiniCalendar({ year, month, events, title = 'Calendar', linkTo = '/calendar' }) {
  const gridStart = startOfGrid(year, month)
  const today = new Date()
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })

  return (
    <div className="rounded-[20px] border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-[var(--text-primary)]">{title}</div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {new Date(year, month, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
          </div>
        </div>
        <Link to={linkTo} className="text-sm text-[var(--accent)]">
          View full calendar →
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1 text-center text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">
            {day}
          </div>
        ))}

        {days.map((day) => {
          const dayEvents = events.filter((event) => sameDay(new Date(event.start_date), day))
          const inMonth = day.getMonth() === month
          const isToday = sameDay(day, today)

          return (
            <div
              key={day.toISOString()}
              className="min-h-[52px] rounded-xl border border-[var(--border)] p-1.5"
              style={{ background: inMonth ? 'white' : 'var(--surface-tertiary)' }}
            >
              <div
                className="mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px]"
                style={{
                  color: inMonth ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: isToday ? '2px solid var(--accent)' : '2px solid transparent',
                  background: isToday ? 'var(--accent-light)' : 'transparent',
                }}
              >
                {day.getDate()}
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                {dayEvents.slice(0, 4).map((event) => (
                  <span
                    key={event.id}
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: EVENT_COLORS[event.event_type] ?? EVENT_COLORS.event }}
                    title={event.title}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
