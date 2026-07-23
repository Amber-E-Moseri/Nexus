import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Download, Settings, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import { deleteCalendarEvent, getMonthEvents, getUpcomingEvents, getPendingEvents, getEventTypes, getOrCreateSubscription, getMinistryCalendarSources, syncCalendarSource } from '../../features/calendar'
import { getVisibleCategoriesForDept } from '../../features/calendar/hooks/useCategoryVisibility'
import { getHiddenSourceIdsForDept } from '../../features/calendar/lib/calendar'
import { supabase } from '../../lib/supabase'
import { hasPermission } from '../../lib/permissions'
import { useToast } from '../../context/ToastContext'
import CalendarView from '../../features/calendar/components/CalendarView'
import EventModal from '../../features/calendar/components/EventModal'
import EventSubmitModal from '../../features/calendar/components/EventSubmitModal'
import CalendarSidebar from '../../features/calendar/components/CalendarSidebar'
import SubscribeButton from '../../features/calendar/components/SubscribeButton'
import { FONT_BODY, FONT_HEADING } from '../../features/calendar/lib/fonts'

function useIsProgramsMember(profile) {
  const [isProgramsMember, setIsProgramsMember] = useState(false)
  useEffect(() => {
    if (!profile?.department_id) return
    supabase.from('departments').select('id').eq('is_programs', true).maybeSingle()
      .then(({ data }) => setIsProgramsMember(!!data && profile.department_id === data.id))
  }, [profile?.department_id])
  return isProgramsMember
}

export default function MinistryCalendar() {
  const { effectiveRole, profile } = useAuth()
  const isProgramsMember = useIsProgramsMember(profile)
  const { showToast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
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
  const [eventTypes, setEventTypes] = useState([])
  const [eventTypeColors, setEventTypeColors] = useState({})
  const [selectedEventTypes, setSelectedEventTypes] = useState(new Set())
  const [hiddenCategories, setHiddenCategories] = useState(null) // null = no restrictions
  const [hiddenSourceIds, setHiddenSourceIds] = useState(new Set())
  const [syncing, setSyncing] = useState(false)

  // Single-tenant deployment: departments has no organization_id column.
  // Return the well-known default UUID (same constant used by useCategoryVisibility).
  function resolveOrgId() {
    if (profile?.org_id) return Promise.resolve(profile.org_id)
    return Promise.resolve('00000000-0000-0000-0000-000000000000')
  }

  async function loadDeptVisibility() {
    // Super admins see everything — skip filter.
    if (effectiveRole === 'super_admin') {
      setHiddenCategories(null)
      setHiddenSourceIds(new Set())
      return
    }
    try {
      const [orgId, hiddenSources] = await Promise.all([
        resolveOrgId(),
        getHiddenSourceIdsForDept(profile?.department_id ?? null),
      ])
      const hidden = await getVisibleCategoriesForDept(orgId, profile?.department_id ?? null)
      setHiddenCategories(hidden)
      setHiddenSourceIds(hiddenSources)
    } catch (err) {
      console.error('Failed to load dept visibility:', err)
      setHiddenCategories(null)
      setHiddenSourceIds(new Set())
    }
  }

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
      const pending = await getPendingEvents()
      setPendingCount(pending.length)
    } catch (err) {
      console.error('Failed to load pending events:', err)
    }
  }

  async function loadEventTypes() {
    try {
      const types = await getEventTypes()
      const typeNames = types.map((t) => typeof t === 'string' ? t : t.name)
      const colors = {}
      types.forEach((t) => {
        if (typeof t !== 'string' && t.color) colors[t.name] = t.color
      })
      setEventTypes(typeNames)
      setEventTypeColors(colors)
      setSelectedEventTypes(new Set(typeNames))
    } catch (err) {
      console.error('Failed to load event types:', err)
    }
  }

  useEffect(() => {
    loadEventTypes()
  }, [])

  useEffect(() => {
    if (profile?.id) loadDeptVisibility()
  }, [effectiveRole, profile?.id, profile?.department_id])

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

  function handleOpenEvent(event) {
    if (!event) return
    setSelectedEvent(event)
    if (canEdit) {
      setModalDefault(null)
      setShowModal(true)
    }
  }

  async function handleDelete(event) {
    await deleteCalendarEvent(event.id)
    setSelectedEvent(null)
    await loadCalendar()
  }

  function goPrevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  function goNextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  async function handleSyncAllSources() {
    setSyncing(true)
    try {
      const sources = await getMinistryCalendarSources()
      let syncCount = 0
      for (const source of sources) {
        try {
          await syncCalendarSource(source.id)
          syncCount++
        } catch (err) {
          console.error(`Failed to sync ${source.display_name}:`, err)
        }
      }
      showToast(`Synced ${syncCount} calendar source${syncCount !== 1 ? 's' : ''}`, { tone: 'success' })
      await loadCalendar()
    } catch (err) {
      showToast('Failed to sync calendars', { tone: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  const filteredEvents = events.filter((e) => {
    if (e.source_id && hiddenSourceIds.has(e.source_id)) return false
    if (!selectedEventTypes.has(e.event_type)) return false
    if (hiddenCategories && hiddenCategories.has(e.event_type)) return false
    return true
  })

  function generateICS() {
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//BLW CAN NEXUS//EN\n'

    filteredEvents.forEach((event) => {
      if (event.status === 'approved') {
        const startDate = new Date(event.start_date)
        const endDate = new Date(event.end_date)

        const formatDatetime = (date) => {
          const year = date.getUTCFullYear()
          const month = String(date.getUTCMonth() + 1).padStart(2, '0')
          const day = String(date.getUTCDate()).padStart(2, '0')
          const hours = String(date.getUTCHours()).padStart(2, '0')
          const minutes = String(date.getUTCMinutes()).padStart(2, '0')
          const seconds = String(date.getUTCSeconds()).padStart(2, '0')
          return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
        }

        ics += 'BEGIN:VEVENT\n'
        ics += `UID:${event.id}@blwcannexus.org\n`
        ics += `SUMMARY:${event.title.replace(/"/g, '\\"')}\n`
        ics += `DTSTART:${formatDatetime(startDate)}\n`
        ics += `DTEND:${formatDatetime(endDate)}\n`
        if (event.description) {
          ics += `DESCRIPTION:${event.description.replace(/"/g, '\\"').replace(/\n/g, '\\n')}\n`
        }
        if (event.location) {
          ics += `LOCATION:${event.location}\n`
        }
        ics += 'END:VEVENT\n'
      }
    })

    ics += 'END:VCALENDAR'
    return ics
  }

  function downloadICS() {
    const ics = generateICS()
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'blwcannexus-calendar.ics'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('Calendar downloaded', { tone: 'success' })
  }

  async function copySubscribeLink() {
    try {
      if (!profile?.id) throw new Error('User not authenticated')
      const subscription = await getOrCreateSubscription(
        profile.id,
        'all',
        null,
      )
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-ical?token=${subscription.token}`
      await navigator.clipboard.writeText(url)
      showToast('Subscribe link copied — paste into Google Calendar or Apple Calendar', { tone: 'success' })
    } catch (err) {
      console.error('Failed to copy subscribe link:', err)
      showToast('Could not copy subscribe link', { tone: 'error' })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: FONT_BODY }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: FONT_HEADING, fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Ministry Calendar
          </h1>
          <p style={{ marginTop: '6px', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
            An org-wide view of programs, training, prayer, deadlines, and major ministry events.
          </p>
        </div>
        {(effectiveRole === 'super_admin' || effectiveRole === 'regional_secretary' || isProgramsMember) && (
          <motion.button
            type="button"
            onClick={() => navigate('/calendar/settings')}
            title="Calendar Settings"
            whileHover={{ backgroundColor: '#F9F7F3', rotate: 22 }}
            whileTap={{ scale: 0.92 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              padding: 0,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'white',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <Settings size={18} />
          </motion.button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : sidebarCollapsed ? '40px 1fr' : '240px 1fr', gap: '20px', alignItems: 'start', transition: 'grid-template-columns 0.15s' }}>
        {!isMobile && <CalendarSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          year={year}
          month={month}
          onPrevMonth={goPrevMonth}
          onNextMonth={goNextMonth}
          events={filteredEvents}
          eventTypes={hiddenCategories ? eventTypes.filter((t) => !hiddenCategories.has(t)) : eventTypes}
          eventTypeColors={eventTypeColors}
          selectedEventTypes={selectedEventTypes}
          onToggleType={(type, checked) => {
            const newSet = new Set(selectedEventTypes)
            if (checked) {
              newSet.add(type)
            } else {
              newSet.delete(type)
            }
            setSelectedEventTypes(newSet)
          }}
          onShare={copySubscribeLink}
          onDownload={downloadICS}
          onOpenSettings={(effectiveRole === 'super_admin' || effectiveRole === 'regional_secretary' || isProgramsMember) ? () => navigate('/calendar/settings') : undefined}
        />}

        {/* Main Calendar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', flexWrap: 'wrap', position: 'relative' }}>
            <motion.button
              onClick={() => setShowSubmitModal(true)}
              whileHover={{ backgroundColor: '#3A1F75' }}
              whileTap={{ scale: 0.97 }}
              style={{
                padding: '9px 16px',
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13.5px',
                fontFamily: FONT_BODY
              }}
            >
              + Add Event
            </motion.button>

            <SubscribeButton
              userId={profile?.id}
              deptOnly={false}
              departmentId={null}
            />

            <motion.button
              onClick={downloadICS}
              whileHover={{ backgroundColor: '#F2EEE6' }}
              whileTap={{ scale: 0.97 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '9px 14px',
                backgroundColor: 'var(--surface-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13.5px',
                fontFamily: FONT_BODY
              }}
            >
              <Download size={14} style={{ color: 'var(--text-secondary)' }} />
              Export
            </motion.button>

            {(effectiveRole === 'super_admin' || effectiveRole === 'regional_secretary' || isProgramsMember) && (
              <motion.button
                onClick={handleSyncAllSources}
                disabled={syncing}
                whileHover={!syncing ? { backgroundColor: '#F2EEE6' } : {}}
                whileTap={!syncing ? { scale: 0.97 } : {}}
                title="Sync all Google Calendar sources (pull new events, push approved events)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '9px 14px',
                  backgroundColor: 'var(--surface-secondary)',
                  color: syncing ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '13.5px',
                  fontFamily: FONT_BODY,
                  opacity: syncing ? 0.6 : 1,
                }}
              >
                <RefreshCw size={14} style={{ color: syncing ? 'var(--text-tertiary)' : 'var(--text-secondary)', animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                {syncing ? 'Syncing...' : 'Sync'}
              </motion.button>
            )}

            {canApprove && pendingCount > 0 && (
              <motion.button
                onClick={() => window.location.href = '/calendar/review'}
                whileHover={{ backgroundColor: '#FDE8B8' }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '9px 14px',
                  backgroundColor: '#FEF3C7',
                  color: '#92400E',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13.5px',
                  fontFamily: FONT_BODY,
                  whiteSpace: 'nowrap'
                }}
              >
                Pending review ({pendingCount})
              </motion.button>
            )}
          </div>

          <CalendarView
            events={filteredEvents}
            loading={loading}
            year={year}
            month={month}
            upcomingEvents={upcoming.filter((e) => {
              if (e.source_id && hiddenSourceIds.has(e.source_id)) return false
              if (!selectedEventTypes.has(e.event_type)) return false
              if (hiddenCategories && hiddenCategories.has(e.event_type)) return false
              return true
            })}
            highlightedEventId={location.state?.highlightedEventId ?? null}
            onEventClick={handleOpenEvent}
            onDayClick={(day) => {
              if (!canEdit) return
              setModalDefault(day)
              setShowModal(true)
            }}
            onAddEvent={undefined}
            onEditEvent={(event) => {
              handleOpenEvent(event)
            }}
            onDeleteEvent={handleDelete}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
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
