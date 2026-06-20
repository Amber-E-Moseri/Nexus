import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { NavLink } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

function formatMeetingDate(dateStr) {
  const d = parseISO(dateStr)
  return format(d, 'EEE MMM d')
}

export default function UpcomingMeetingsWidget({ role, userId, departmentId }) {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const now = new Date().toISOString()
        let query = supabase
          .from('meetings')
          .select('id, title, department_id, date, departments!inner(id, name, color)')
          .gt('date', now)
          .order('date', { ascending: true })
          .limit(5)

        // SCOPING FIX: dept_lead — filter to own department
        if (role === 'dept_lead' && departmentId) {
          query = query.eq('department_id', departmentId)
        }
        // member and pastor: show all upcoming meetings (meetings are visible to all authenticated users)

        const { data } = await query
        if (active) setMeetings(data ?? [])
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [role, userId, departmentId])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (meetings.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No upcoming meetings scheduled.</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {meetings.map((meeting) => {
        const dept = meeting.departments
        const deptColor = dept?.color ? `#${dept.color}` : '#4C2A92'
        return (
          <div key={meeting.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: '#F0EDE6', color: '#6B6560', flexShrink: 0, minWidth: 65, textAlign: 'center',
            }}>
              {formatMeetingDate(meeting.date)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meeting.title}
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              background: `${deptColor}20`, color: deptColor, flexShrink: 0, textTransform: 'capitalize'
            }}>
              {dept?.name ?? 'Unknown'}
            </span>
          </div>
        )
      })}
      <NavLink to="/meetings" style={{ fontSize: 12, color: '#4C2A92', fontWeight: 600, textDecoration: 'none', marginTop: 2 }}>
        View all meetings →
      </NavLink>
    </div>
  )
}
