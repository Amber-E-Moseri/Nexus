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
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error: queryError } = await supabase.rpc('get_department_utilization')
      if (queryError) throw queryError
      return data ?? []
    },
  })

  if (!allowed) return null
  if (isPending) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading organization utilization…</div>
  if (error) return (
    <div style={{ fontSize: 12.5, color: '#9E9488' }}>
      Utilization data is unavailable.
      {import.meta.env.DEV && <div style={{ fontSize: 11, marginTop: 4, color: '#C94830' }}>{error.message}</div>}
    </div>
  )
  if (departments.length === 0) return <div style={{ fontSize: 12.5, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No department activity yet.</div>

  const allTopUsers = departments
    .flatMap((d) => (d.top_users ?? []).map((u) => ({ ...u, department: d.department_name })))
    .sort((a, b) => b.completed_tasks - a.completed_tasks)
    .slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Department bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {departments.map((dept) => {
          const color = utilizationColor(dept.utilization_percent)
          const dueStr = dept.due_date
            ? new Date(dept.due_date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
            : null
          void dueStr
          return (
            <div key={dept.department_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2D2A22' }}>{dept.department_name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color }}>
                  {dept.utilization_percent}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#EDE8DC' }}>
                <div style={{
                  width: `${dept.utilization_percent}%`,
                  height: '100%',
                  background: color,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 10.5, color: '#9E9488' }}>
                  {dept.open_tasks} open · {dept.active_members} members
                  {dept.active_members > 0 && ` · ${dept.avg_tasks_per_member} avg`}
                </span>
                {dept.completed_this_week > 0 && (
                  <span style={{ fontSize: 10.5, color: '#2D8653', fontWeight: 600 }}>
                    +{dept.completed_this_week} this week
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Top contributors */}
      {allTopUsers.length > 0 && (
        <div style={{ borderTop: '1px solid #EDE8DC', paddingTop: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#9E9488', marginBottom: 7 }}>
            Top contributors, last 30 days
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {allTopUsers.map((user, i) => (
              <div key={`${user.department}-${user.name}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 12 }}>
                <span style={{ color: '#2D2A22' }}>
                  <span style={{ color: '#9E9488', fontWeight: 400, marginRight: 4 }}>{i + 1}.</span>
                  <span style={{ fontWeight: 600 }}>{user.name}</span>
                  <span style={{ color: '#9E9488', fontWeight: 400 }}> ({user.department})</span>
                </span>
                <span style={{ color: '#4C2A92', fontWeight: 700, fontSize: 11 }}>
                  {user.completed_tasks} done
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
