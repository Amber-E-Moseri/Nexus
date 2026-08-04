import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

function utilizationColor(percent) {
  if (percent >= 80) return '#C94830'
  if (percent >= 60) return '#C47E0A'
  return '#2D8653'
}

export default function DepartmentUtilizationWidget({ role }) {
  const allowed = ['super_admin', 'regional_secretary'].includes(role)
  const { data: departments = [], isPending, error } = useQuery({
    queryKey: ['department-utilization'],
    enabled: allowed,
    queryFn: async () => {
      const { data, error: queryError } = await supabase.rpc('get_department_utilization')
      if (queryError) throw queryError
      return data ?? []
    },
  })

  if (!allowed) return null
  if (isPending) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading organization utilization...</div>
  if (error) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Utilization data is unavailable.</div>
  if (departments.length === 0) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>No department activity yet.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {departments.map((department) => {
          const color = utilizationColor(department.utilization_percent)
          return (
            <div key={department.department_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 5 }}>
                <span style={{ color: '#2D2A22', fontSize: 12.5, fontWeight: 700 }}>{department.department_name}</span>
                <span style={{ color, fontSize: 12, fontWeight: 700 }}>{department.utilization_percent}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#EDE8DC' }}>
                <div style={{ width: `${department.utilization_percent}%`, height: '100%', background: color }} />
              </div>
              <div style={{ color: '#9E9488', fontSize: 10.5, marginTop: 4 }}>{department.open_tasks} open tasks across {department.active_members} active members</div>
            </div>
          )
        })}
      </div>
      <div style={{ borderTop: '1px solid #EDE8DC', paddingTop: 10 }}>
        <div style={{ color: '#9E9488', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 7 }}>Top users, last 30 days</div>
        {departments.flatMap((department) => (department.top_users ?? []).map((user) => ({ ...user, department: department.department_name }))).sort((a, b) => b.completed_tasks - a.completed_tasks).slice(0, 5).map((user) => (
          <div key={`${user.department}-${user.name}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', fontSize: 12 }}>
            <span style={{ color: '#2D2A22', fontWeight: 600 }}>{user.name} <span style={{ color: '#9E9488', fontWeight: 400 }}>({user.department})</span></span>
            <span style={{ color: '#4C2A92', fontWeight: 700 }}>{user.completed_tasks}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
