import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getMonthEvents, getPendingApprovals, approveEvent, rejectEvent } from '../../lib/calendar'
import { hasPermission } from '../../lib/permissions'
import CalendarView from '../../modules/calendar/CalendarView'
import EventSubmitModal from '../../modules/calendar/EventSubmitModal'
import EventDetailModal from '../../modules/calendar/EventDetailModal'
import SubmissionsPanel from '../../modules/calendar/SubmissionsPanel'

const STATUS_FILTERS = [
  { value: 'all', label: 'All Events' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export default function CalendarPage() {
  const { effectiveRole, profile } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [events, setEvents] = useState([])
  const [filteredEvents, setFilteredEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [canApprove, setCanApprove] = useState(false)
  const [departments, setDepartments] = useState([])
  const [refreshSubmissions, setRefreshSubmissions] = useState(0)

  // Load calendar events
  async function loadCalendar() {
    setLoading(true)
    try {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59)
      const data = await getMonthEvents(year, month)
      setEvents(data || [])
      setRefreshSubmissions((prev) => prev + 1)
    } catch (err) {
      console.error('Failed to load calendar:', err)
    } finally {
      setLoading(false)
    }
  }

  // Check if user can approve
  useEffect(() => {
    let active = true
    if (['super_admin'].includes(effectiveRole)) {
      if (active) setCanApprove(true)
      return () => { active = false }
    }

    hasPermission(profile?.id, 'calendar:write')
      .then((allowed) => { if (active) setCanApprove(allowed) })
      .catch(() => { if (active) setCanApprove(false) })

    return () => { active = false }
  }, [effectiveRole, profile?.id])

  // Load calendar on mount and when year/month change
  useEffect(() => {
    loadCalendar()
  }, [year, month])

  // Filter events by status
  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredEvents(events)
    } else {
      setFilteredEvents(events.filter((e) => e.status === statusFilter))
    }
  }, [events, statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
            Calendar Management
          </h1>
          <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            View and manage org-wide calendar events and submissions.
          </p>
        </div>
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
            fontSize: '14px',
            whiteSpace: 'nowrap'
          }}
        >
          + Submit Event
        </button>
      </div>

      {canApprove && (
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '12px',
          borderRadius: '12px',
          backgroundColor: 'var(--surface-tertiary)',
          flexWrap: 'wrap'
        }}>
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: statusFilter === filter.value ? 'var(--accent)' : 'transparent',
                color: statusFilter === filter.value ? 'white' : 'var(--text-secondary)',
                fontSize: '14px',
                fontWeight: statusFilter === filter.value ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '24px', alignItems: 'start' }}>
        <CalendarView
          events={filteredEvents}
          loading={loading}
          year={year}
          month={month}
          upcomingEvents={[]}
          onEventClick={(event) => {
            setSelectedEvent(event)
            setShowDetailModal(true)
          }}
          onDayClick={undefined}
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
          readOnly={!canApprove}
        />

        {canApprove && (
          <SubmissionsPanel
            onEventClick={(event) => {
              setSelectedEvent(event)
              setShowDetailModal(true)
            }}
            refreshTrigger={refreshSubmissions}
          />
        )}
      </div>

      {selectedEvent && showDetailModal && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => {
            setShowDetailModal(false)
            setSelectedEvent(null)
          }}
          onApproved={loadCalendar}
          canApprove={canApprove}
        />
      )}

      {showSubmitModal && (
        <EventSubmitModal
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={loadCalendar}
          departments={departments}
        />
      )}
    </div>
  )
}
