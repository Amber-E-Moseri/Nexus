import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { NavLink } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

function formatMeetingDate(dateStr) {
  const d = parseISO(dateStr)
  return format(d, 'EEE MMM d')
}

export default function UpcomingMeetingsWidget({ role, userId, departmentId }) {
  // Shared query cache (BLW-05)
  const { data: meetings = [], isPending: loading } = useQuery({
    queryKey: ['upcoming-meetings', role, departmentId ?? null],
    queryFn: async () => {
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
      return data ?? []
    },
  })

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
          <NavLink key={meeting.id} to={`/meetings/${meeting.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', borderRadius: 8, padding: '6px 8px', margin: '-6px -8px', transition: 'background .15s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#F5F2EC'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
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
          </NavLink>
        )
      })}
      <NavLink to="/meetings" style={{ fontSize: 12, color: '#4C2A92', fontWeight: 600, textDecoration: 'none', marginTop: 2 }}>
        View all meetings →
      </NavLink>
    </div>
  )
}
