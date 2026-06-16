import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { deleteCalendarEvent, getMonthEvents, getUpcomingEvents } from '../../lib/calendar'
import { hasPermission } from '../../lib/permissions'
import CalendarView from '../../modules/calendar/CalendarView'
import EventModal from '../../modules/calendar/EventModal'

export default function MinistryCalendar() {
  const { effectiveRole, profile } = useAuth()
  const location = useLocation()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [events, setEvents] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [modalDefault, setModalDefault] = useState(null)
  const [canEdit, setCanEdit] = useState(false)

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

  useEffect(() => {
    let active = true
    if (['super_admin', 'dept_lead'].includes(effectiveRole)) {
      setCanEdit(true)
      return () => { active = false }
    }

    hasPermission(profile?.id, 'calendar:write')
      .then((allowed) => { if (active) setCanEdit(allowed) })
      .catch(() => { if (active) setCanEdit(false) })

    return () => { active = false }
  }, [effectiveRole, profile?.id])

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
      </div>

      <CalendarView
        events={events}
        loading={loading}
        year={year}
        month={month}
        upcomingEvents={upcoming}
        highlightedEventId={location.state?.highlightedEventId ?? null}
        onEventClick={setSelectedEvent}
        onDayClick={(day) => {
          if (!canEdit) return
          setModalDefault(day)
          setShowModal(true)
        }}
        onAddEvent={canEdit ? () => setShowModal(true) : undefined}
        onEditEvent={(event) => {
          setSelectedEvent(event)
          setShowModal(true)
        }}
        onDeleteEvent={handleDelete}
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
        readOnly={!canEdit}
      />

      {showModal ? (
        <EventModal
          event={selectedEvent}
          defaultDate={modalDefault}
          canEditOverride={canEdit}
          onSaved={loadCalendar}
          onClose={closeModal}
        />
      ) : null}
    </div>
  )
}
