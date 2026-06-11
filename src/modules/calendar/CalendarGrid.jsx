import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CalendarEventChip, EVENT_COLORS } from './CalendarEventCard'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function startOfGrid(year, month) {
  const first = new Date(year, month, 1)
  const day = (first.getDay() + 6) % 7
  first.setDate(first.getDate() - day)
  return first
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function eventsForDay(events, day) {
  return events.filter((event) => sameDay(new Date(event.start_date), day))
}

export default function CalendarGrid({
  year,
  month,
  events,
  onEventClick,
  onDayClick,
  canEdit,
  onPrevMonth,
  onNextMonth,
  onToday,
}) {
  const gridStart = startOfGrid(year, month)
  const today = new Date()
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })

  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xl font-semibold text-[var(--text-primary)]">
          {new Date(year, month, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onToday} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
            Today
          </button>
          <button type="button" onClick={onPrevMonth} className="rounded-xl border border-[var(--border)] bg-white p-2 text-[var(--text-secondary)]">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={onNextMonth} className="rounded-xl border border-[var(--border)] bg-white p-2 text-[var(--text-secondary)]">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="px-2 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {weekday}
          </div>
        ))}

        {days.map((day) => {
          const dayEvents = eventsForDay(events, day)
          const inMonth = day.getMonth() === month
          const isToday = sameDay(day, today)
          const hiddenCount = Math.max(0, dayEvents.length - 3)

          return (
            <div
              key={day.toISOString()}
              className="min-h-[132px] rounded-[18px] border border-[var(--border)] p-2"
              style={{ background: inMonth ? 'white' : 'var(--surface-tertiary)' }}
            >
              <div className="mb-2 flex items-center justify-between">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                  style={{
                    color: inMonth ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    border: isToday ? '2px solid var(--accent)' : '2px solid transparent',
                    background: isToday ? 'var(--accent-light)' : 'transparent',
                  }}
                >
                  {day.getDate()}
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => onDayClick?.(day)}
                    className="text-xs text-[var(--accent)]"
                  >
                    + Add
                  </button>
                ) : null}
              </div>

              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <CalendarEventChip key={event.id} event={event} onClick={onEventClick} />
                ))}
                {hiddenCount > 0 ? (
                  <button type="button" onClick={() => onDayClick?.(day)} className="text-xs text-[var(--text-tertiary)]">
                    +{hiddenCount} more
                  </button>
                ) : null}
                {dayEvents.length === 0 ? (
                  <div className="pt-1 text-[10px] text-[var(--text-placeholder)]">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: EVENT_COLORS.event }}
                    />{' '}
                    No events
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
