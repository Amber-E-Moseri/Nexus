import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import CalendarGrid from './CalendarGrid'
import CalendarEventCard from './CalendarEventCard'
import { FONT_HEADING } from '../lib/fonts'

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
  onDateReschedule,
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
    if (!readOnly) {
      onEditEvent?.(event)
    }
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

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
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
          onDateReschedule={readOnly ? undefined : onDateReschedule}
        />

        <div className="space-y-4">
          <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
            <div
              className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"
              style={{ fontFamily: FONT_HEADING, letterSpacing: '-0.01em' }}
            >
              <CalendarDays size={18} className="text-[var(--accent)]" />
              Upcoming Events
            </div>
            <div className="space-y-3">
              {nextUpcoming.length > 0 ? nextUpcoming.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.06, ease: [0.22, 0.61, 0.36, 1] }}
                >
                  <CalendarEventCard event={event} canEdit={false} />
                </motion.div>
              )) : (
                <div className="rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--surface-tertiary)] p-6 text-sm text-[var(--text-tertiary)]">
                  No upcoming events in the next 30 days.
                </div>
              )}
            </div>
          </div>

          <AnimatePresence>
            {selectedEvent ? (
              <motion.div
                key={selectedEvent.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <CalendarEventCard
                  event={selectedEvent}
                  canEdit={!readOnly}
                  onEdit={(event) => {
                    handleSelectEvent(event)
                    onEditEvent?.(event)
                  }}
                  onDelete={onDeleteEvent}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
