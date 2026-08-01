import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import { useDndSensors } from '../../../dnd'
import { CalendarEventChip, EVENT_COLORS } from './CalendarEventCard'
import CalendarDraggableEvent from './CalendarDraggableEvent'
import DayEventsPopover from './DayEventsPopover'

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

// Date-only strings (e.g. "2026-07-28" from task due_date) are parsed by JS
// as UTC midnight, which is the PREVIOUS day in UTC-offset timezones (Canada).
// Datetime strings from ministry calendar events already carry timezone info
// and parse correctly. This helper forces date-only strings to local time so
// chips land on the correct grid cell.
function parseEventDate(dateStr) {
  if (!dateStr) return new Date(NaN)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(dateStr)
}

function eventsForDay(events, day) {
  return events.filter((event) => sameDay(parseEventDate(event.start_date), day))
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
  onDateReschedule,
}) {
  const sensors = useDndSensors()
  const [expandedDay, setExpandedDay] = useState(null)
  const gridStart = startOfGrid(year, month)
  const today = new Date()
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })

  function handleDragEnd({ active, over }) {
    if (!over || !canEdit) return

    const event = active.data?.data?.event
    if (!event) return

    const overDateStr = String(over.id)
    if (!overDateStr.startsWith('day-')) return

    const timestamp = parseInt(overDateStr.slice(4), 10)
    const newDate = new Date(timestamp)

    if (isNaN(newDate.getTime())) return

    onDateReschedule?.(event.id, newDate)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="rounded-[24px] border border-[var(--border)] bg-white p-2 sm:p-5 shadow-[var(--card-shadow)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xl font-semibold text-[var(--text-primary)]">
            {new Date(year, month, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Jump to today" onClick={onToday} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
              Today
            </button>
            <button type="button" aria-label="Previous month" onClick={onPrevMonth} className="rounded-xl border border-[var(--border)] bg-white p-2 text-[var(--text-secondary)]">
              <ChevronLeft size={16} />
            </button>
            <button type="button" aria-label="Next month" onClick={onNextMonth} className="rounded-xl border border-[var(--border)] bg-white p-2 text-[var(--text-secondary)]">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 md:gap-2">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="px-1 py-2 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              {weekday}
            </div>
          ))}

          {days.map((day) => {
            const dayEvents = eventsForDay(events, day)
            const inMonth = day.getMonth() === month
            const isToday = sameDay(day, today)
            const hiddenCount = Math.max(0, dayEvents.length - 3)
            const dayId = `day-${day.getTime()}`

            return (
              <div
                key={day.toISOString()}
                id={dayId}
                className="group min-h-[80px] sm:min-h-[110px] md:min-h-[160px] overflow-hidden rounded-[6px] sm:rounded-[12px] md:rounded-[18px] border border-[var(--border)] p-1 sm:p-2 md:p-3 transition-colors hover:border-[var(--border-hover,var(--border))]"
                style={{ background: inMonth ? 'white' : 'var(--surface-tertiary)' }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium"
                    style={{
                      color: isToday ? 'white' : inMonth ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      background: isToday ? 'var(--accent)' : 'transparent',
                      fontWeight: isToday ? 700 : undefined,
                    }}
                  >
                    {day.getDate()}
                  </div>
                  {canEdit && !isToday && inMonth && dayEvents.length === 0 && (
                    <button
                      type="button"
                      onClick={() => onDayClick?.(day)}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-xs text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 hover:bg-[var(--surface-secondary)]"
                      title="Add event"
                    >
                      +
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  {dayEvents.slice(0, 3).map((event) => canEdit && event.id ? (
                    <CalendarDraggableEvent
                      key={event.id}
                      event={event}
                      onClick={onEventClick}
                    />
                  ) : (
                    <CalendarEventChip key={event.id} event={event} onClick={onEventClick} />
                  ))}
                  {hiddenCount > 0 ? (
                    <button type="button" onClick={() => setExpandedDay(day)} className="mt-1 text-xs font-bold text-[var(--accent)] opacity-80 hover:opacity-100">
                      +{hiddenCount} more
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <DragOverlay>
        {/* No overlay needed for calendar events */}
      </DragOverlay>

      <DayEventsPopover
        date={expandedDay}
        events={expandedDay ? eventsForDay(events, expandedDay) : []}
        onClose={() => setExpandedDay(null)}
        onEventClick={onEventClick}
      />
    </DndContext>
  )
}
