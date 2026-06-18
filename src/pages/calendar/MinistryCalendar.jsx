import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { deleteCalendarEvent, getMonthEvents, getUpcomingEvents, getPendingApprovals } from '../../lib/calendar'
import { hasPermission } from '../../lib/permissions'
import CalendarView from '../../modules/calendar/CalendarView'
import EventModal from '../../modules/calendar/EventModal'
import { EVENT_COLORS } from '../../modules/calendar/CalendarEventCard'
import EventSubmitModal from '../../modules/calendar/EventSubmitModal'

const EVENT_TYPES = ['conference', 'program', 'training', 'prayer', 'graduation', 'event', 'deadline']

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
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [modalDefault, setModalDefault] = useState(null)
  const [canEdit, setCanEdit] = useState(false)
  const [canApprove, setCanApprove] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [selectedEventTypes, setSelectedEventTypes] = useState(new Set(EVENT_TYPES))
  const [deptOnly, setDeptOnly] = useState(false)

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

  async function loadPendingCount() {
    if (!canApprove) return
    try {
      const pending = await getPendingApprovals()
      setPendingCount(pending.length)
    } catch (err) {
      console.error('Failed to load pending approvals:', err)
    }
  }

  useEffect(() => {
    loadCalendar()
  }, [year, month])

  useEffect(() => {
    let active = true
    if (['super_admin', 'dept_lead'].includes(effectiveRole)) {
      if (active) setCanEdit(true)
      if (active) setCanApprove(true)
      return () => { active = false }
    }

    hasPermission(profile?.id, 'calendar:write')
      .then((allowed) => {
        if (active) {
          setCanEdit(allowed)
          setCanApprove(allowed)
        }
      })
      .catch(() => {
        if (active) {
          setCanEdit(false)
          setCanApprove(false)
        }
      })

    return () => { active = false }
  }, [effectiveRole, profile?.id])

  useEffect(() => {
    loadPendingCount()
  }, [canApprove])

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

  const filteredEvents = events.filter((e) => {
    if (!selectedEventTypes.has(e.event_type)) return false
    if (deptOnly && !e.department_id) return false
    return true
  })

  const miniCalendarStart = new Date(year, month, 1)
  const miniCalendarEnd = new Date(year, month + 1, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
          Ministry Calendar
        </h1>
        <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          An org-wide view of programs, training, prayer, deadlines, and major ministry events.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Mini Month Navigator */}
          <div style={{
            borderRadius: '12px',
            border: '1px solid var(--border)',
            backgroundColor: 'white',
            padding: '16px',
            boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <button
                onClick={() => {
                  if (month === 0) {
                    setMonth(11)
                    setYear(year - 1)
                  } else {
                    setMonth(month - 1)
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '4px',
                  color: 'var(--text-primary)'
                }}
              >
                ←
              </button>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {miniCalendarStart.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
              </div>
              <button
                onClick={() => {
                  if (month === 11) {
                    setMonth(0)
                    setYear(year + 1)
                  } else {
                    setMonth(month + 1)
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '4px',
                  color: 'var(--text-primary)'
                }}
              >
                →
              </button>
            </div>
          </div>

          {/* Event Type Filters */}
          <div style={{
            borderRadius: '12px',
            border: '1px solid var(--border)',
            backgroundColor: 'white',
            padding: '16px',
            boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '12px', textTransform: 'uppercase' }}>
              Event Types
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {EVENT_TYPES.map((type) => (
                <label
                  key={type}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: 'var(--text-primary)'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedEventTypes.has(type)}
                    onChange={(e) => {
                      const newSet = new Set(selectedEventTypes)
                      if (e.target.checked) {
                        newSet.add(type)
                      } else {
                        newSet.delete(type)
                      }
                      setSelectedEventTypes(newSet)
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: EVENT_COLORS[type],
                      flexShrink: 0
                    }}
                  />
                  <span style={{ textTransform: 'capitalize', flex: 1 }}>{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Department Filter */}
          <div style={{
            borderRadius: '12px',
            border: '1px solid var(--border)',
            backgroundColor: 'white',
            padding: '16px',
            boxShadow: 'var(--card-shadow)'
          }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                fontSize: '14px',
                color: 'var(--text-primary)'
              }}
            >
              <input
                type="checkbox"
                checked={deptOnly}
                onChange={(e) => setDeptOnly(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>My department only</span>
            </label>
          </div>
        </div>

        {/* Main Calendar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setShowSubmitModal(true)}
              style={{
                padding: '10px 16px',
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px'
              }}
            >
              + Add Event
            </button>
            {canApprove && pendingCount > 0 && (
              <button
                onClick={() => window.location.href = '/calendar-management'}
                style={{
                  padding: '10px 16px',
                  backgroundColor: '#FEF3C7',
                  color: '#92400E',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                  whiteSpace: 'nowrap'
                }}
              >
                Pending review ({pendingCount})
              </button>
            )}
          </div>

          <CalendarView
            events={filteredEvents}
            loading={loading}
            year={year}
            month={month}
            upcomingEvents={upcoming.filter((e) => selectedEventTypes.has(e.event_type) && (!deptOnly || e.department_id))}
            highlightedEventId={location.state?.highlightedEventId ?? null}
            onEventClick={setSelectedEvent}
            onDayClick={(day) => {
              if (!canEdit) return
              setModalDefault(day)
              setShowModal(true)
            }}
            onAddEvent={undefined}
            onEditEvent={(event) => {
              setSelectedEvent(event)
              setShowModal(true)
            }}
            onDeleteEvent={handleDelete}
            onPrevMonth={() => {
              if (month === 0) {
                setMonth(11)
                setYear(year - 1)
              } else {
                setMonth(month - 1)
              }
            }}
            onNextMonth={() => {
              if (month === 11) {
                setMonth(0)
                setYear(year + 1)
              } else {
                setMonth(month + 1)
              }
            }}
            onToday={() => {
              const now = new Date()
              setYear(now.getFullYear())
              setMonth(now.getMonth())
            }}
            readOnly={!canEdit}
          />
        </div>
      </div>

      {showModal ? (
        <EventModal
          event={selectedEvent}
          defaultDate={modalDefault}
          canEditOverride={canEdit}
          onSaved={loadCalendar}
          onClose={closeModal}
        />
      ) : null}

      {showSubmitModal ? (
        <EventSubmitModal
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={() => {
            loadCalendar()
            loadPendingCount()
          }}
          departments={[]}
        />
      ) : null}
    </div>
  )
}
