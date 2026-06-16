import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import CalendarGrid from './CalendarGrid'
import CalendarEventCard from './CalendarEventCard'

function sortByStartDate(events = []) {
  return [...events].sort((left, right) => new Date(left.start_date) - new Date(right.start_date))
}

export default function CalendarView({
  events = [],
  loading = false,
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  onEventClick,
  onDayClick,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  highlightedEventId = null,
  upcomingEvents,
  readOnly = false,
}) {
  const [selectedEvent, setSelectedEvent] = useState(null)

  const nextUpcoming = useMemo(() => {
    if (Array.isArray(upcomingEvents) && upcomingEvents.length > 0) {
      return sortByStartDate(upcomingEvents).slice(0, 3)
    }

    const now = new Date()
    return sortByStartDate(events)
      .filter((event) => new Date(event.start_date) >= now)
      .slice(0, 3)
  }, [events, upcomingEvents])

  useEffect(() => {
    if (!highlightedEventId) return
    const highlighted = events.find((event) => event.id === highlightedEventId)
    if (highlighted) {
      setSelectedEvent(highlighted)
      onEventClick?.(highlighted)
    }
  }, [events, highlightedEventId, onEventClick])

  useEffect(() => {
    if (!selectedEvent) return
    const nextSelected = events.find((event) => event.id === selectedEvent.id)
    setSelectedEvent(nextSelected ?? null)
  }, [events, selectedEvent])

  function handleSelectEvent(event) {
    setSelectedEvent(event)
    onEventClick?.(event)
  }

  return loading ? (
    <div className="rounded-[24px] border border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">
      Loading calendar...
    </div>
  ) : (
    <div className="space-y-5">
      {onAddEvent ? (
        <div className="flex justify-end">
          <button type="button" onClick={onAddEvent} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
            + Add Event
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.8fr_0.9fr]">
        <CalendarGrid
          year={year}
          month={month}
          events={events}
          onEventClick={handleSelectEvent}
          onDayClick={readOnly ? undefined : onDayClick}
          canEdit={!readOnly}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
          onToday={onToday}
        />

        <div className="space-y-4">
          <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
            <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
              <CalendarDays size={18} className="text-[var(--accent)]" />
              Upcoming Events
            </div>
            <div className="space-y-3">
              {nextUpcoming.length > 0 ? nextUpcoming.map((event) => (
                <CalendarEventCard key={event.id} event={event} canEdit={false} />
              )) : (
                <div className="rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--surface-tertiary)] p-6 text-sm text-[var(--text-tertiary)]">
                  No upcoming events in the next 30 days.
                </div>
              )}
            </div>
          </div>

          {selectedEvent ? (
            <CalendarEventCard
              event={selectedEvent}
              canEdit={!readOnly}
              onEdit={(event) => {
                handleSelectEvent(event)
                onEditEvent?.(event)
              }}
              onDelete={onDeleteEvent}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
