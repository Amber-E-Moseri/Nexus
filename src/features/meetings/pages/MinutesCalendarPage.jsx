import { useState, useEffect, useCallback } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CalendarGrid from '../../calendar/components/CalendarGrid'
import { getMeetingsWithMinutes } from '../lib/meetings'

export default function MinutesCalendarPage({ departmentId, meetingType, readOnly = false }) {
  const navigate = useNavigate()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (nextYear, nextMonth, scope, nextMeetingType) => {
    setLoading(true)
    try {
      const result = await getMeetingsWithMinutes(scope, { month: nextMonth, year: nextYear, pageSize: 200, meetingType: nextMeetingType })
      setEvents(result.meetings.map((meeting) => ({ id: meeting.id, start_date: meeting.date, event_type: 'meeting', title: meeting.title })))
    } catch (error) {
      console.warn('Minutes calendar load error:', error)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(year, month, departmentId, meetingType) }, [year, month, departmentId, meetingType, load])
  function prevMonth() { if (month === 0) { setYear((value) => value - 1); setMonth(11) } else setMonth((value) => value - 1) }
  function nextMonth() { if (month === 11) { setYear((value) => value + 1); setMonth(0) } else setMonth((value) => value + 1) }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()) }

  return (
    <div style={{ position: 'relative' }}>
      {loading && <LoaderCircle size={16} style={{ position: 'absolute', top: 8, right: 8, color: '#7A6F5E', zIndex: 1 }} />}
      <CalendarGrid
        year={year}
        month={month}
        events={events}
        onEventClick={readOnly ? () => {} : (event) => navigate(`/meetings/${event.id}?tab=minutes`)}
        onDayClick={() => {}}
        canEdit={false}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
        onToday={goToday}
      />
    </div>
  )
}
