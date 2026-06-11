import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { deleteCalendarEvent, getMonthEvents, getUpcomingEvents } from '../../lib/calendar'
import CalendarGrid from '../../modules/calendar/CalendarGrid'
import CalendarEventCard from '../../modules/calendar/CalendarEventCard'
import EventModal from '../../modules/calendar/EventModal'

export default function MinistryCalendar() {
  const { role } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [events, setEvents] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [modalDefault, setModalDefault] = useState(null)

  const canEdit = ['super_admin', 'dept_lead'].includes(role)

  async function loadCalendar() {
    setLoading(true)
    try {
      const [monthEvents, nextUpcoming] = await Promise.all([
        getMonthEvents(year, month),
        getUpcomingEvents(7),
      ])
      setEvents(monthEvents)
      setUpcoming(nextUpcoming)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCalendar()
  }, [year, month])

  const nextThree = useMemo(() => upcoming.slice(0, 3), [upcoming])

  function closeModal() {
    setShowModal(false)
    setSelectedEvent(null)
    setModalDefault(null)
  }

  async function handleDelete(event) {
    await deleteCalendarEvent(event.id)
    setSelectedEvent(null)
    await loadCalendar()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">Ministry Calendar</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">An org-wide view of programs, training, prayer, deadlines, and major ministry events.</p>
        </div>
        {canEdit ? (
          <button type="button" onClick={() => setShowModal(true)} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
            + Add event
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-8 text-sm text-[var(--text-tertiary)] shadow-[var(--card-shadow)]">
          Loading calendar…
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1.8fr_0.9fr]">
          <CalendarGrid
            year={year}
            month={month}
            events={events}
            onEventClick={(event) => setSelectedEvent(event)}
            onDayClick={(day) => {
              if (!canEdit) return
              setModalDefault(day)
              setShowModal(true)
            }}
            canEdit={canEdit}
            onPrevMonth={() => {
              if (month === 0) {
                setMonth(11)
                setYear((value) => value - 1)
              } else {
                setMonth((value) => value - 1)
              }
            }}
            onNextMonth={() => {
              if (month === 11) {
                setMonth(0)
                setYear((value) => value + 1)
              } else {
                setMonth((value) => value + 1)
              }
            }}
            onToday={() => {
              const now = new Date()
              setYear(now.getFullYear())
              setMonth(now.getMonth())
            }}
          />

          <div className="space-y-4">
            <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
              <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
                <CalendarDays size={18} className="text-[var(--accent)]" />
                Upcoming Events
              </div>
              <div className="space-y-3">
                {nextThree.length > 0 ? nextThree.map((event) => (
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
                canEdit={canEdit}
                onEdit={(event) => {
                  setSelectedEvent(event)
                  setShowModal(true)
                }}
                onDelete={handleDelete}
              />
            ) : null}
          </div>
        </div>
      )}

      {showModal ? (
        <EventModal
          event={selectedEvent}
          defaultDate={modalDefault}
          onSaved={loadCalendar}
          onClose={closeModal}
        />
      ) : null}
    </div>
  )
}
