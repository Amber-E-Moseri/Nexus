import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import CalendarGrid from '../../calendar/components/CalendarGrid'
import { getMeetingsWithMinutes } from '../lib/meetings'

export default function MinutesCalendarPage({ departmentId }) {
  const navigate = useNavigate()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (y, m, deptId) => {
    setLoading(true)
    try {
      const result = await getMeetingsWithMinutes(deptId, { month: m, year: y, pageSize: 200 })
      setEvents(
        result.meetings.map(mtg => ({
          id: mtg.id,
          start_date: mtg.date,
          event_type: 'meeting',
          title: mtg.title,
        }))
      )
    } catch (e) {
      console.warn('MinutesCalendarPage load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(year, month, departmentId)
  }, [year, month, departmentId, load])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  return (
    <div style={{ position: 'relative' }}>
      {loading && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          fontSize: 11, color: 'var(--text-secondary, #7A6F5E)', padding: 4,
        }}>
          Loading…
        </div>
      )}
      <CalendarGrid
        year={year}
        month={month}
        events={events}
        onEventClick={event => navigate(`/meetings/${event.id}?tab=minutes`)}
        onDayClick={() => {}}
        canEdit={false}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        onToday={goToday}
      />
    </div>
  )
}
