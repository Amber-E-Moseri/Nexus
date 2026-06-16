import { useEffect, useState } from 'react'
import { differenceInDays } from 'date-fns'
import { NavLink } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_COLORS = {
  planning: { bg: '#EDE8F8', text: '#4C2A92' },
  active:   { bg: '#EBF7F1', text: '#2D8653' },
  review:   { bg: '#FFF8EC', text: '#D17A1C' },
}

export default function SprintProgressWidget({ userId }) {
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const { data: memberRows } = await supabase
          .from('sprint_members')
          .select('sprint:sprints(id, name, status, start_date, end_date)')
          .eq('user_id', userId)

        const rawSprints = (memberRows ?? [])
          .map(r => r.sprint)
          .filter(s => s && ['planning', 'active', 'review'].includes(s.status))
          .slice(0, 3)

        const withProgress = await Promise.all(
          rawSprints.map(async (sprint) => {
            const { data: tasks } = await supabase
              .from('tasks')
              .select('id, status_definition:task_status_definitions!status_id(category)')
              .eq('sprint_id', sprint.id)
              .eq('is_personal', false)

            const total = tasks?.length ?? 0
            const completed = tasks?.filter(t => t.status_definition?.category === 'completed').length ?? 0
            return { ...sprint, total, completed }
          }),
        )

        if (active) setSprints(withProgress)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [userId])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (sprints.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No active sprints</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sprints.map(sprint => {
        const pct = sprint.total > 0 ? Math.round((sprint.completed / sprint.total) * 100) : 0
        const daysLeft = sprint.end_date ? differenceInDays(new Date(sprint.end_date), new Date()) : null
        const col = STATUS_COLORS[sprint.status] ?? STATUS_COLORS.active

        return (
          <div key={sprint.id} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #EDE8DC', background: '#FAFAF7' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#2D2A22' }}>{sprint.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: col.bg, color: col.text }}>
                {sprint.status}
              </span>
            </div>
            <div style={{ background: '#EDE8DC', borderRadius: 999, height: 6, overflow: 'hidden', marginBottom: 5 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#4C2A92', borderRadius: 999, transition: 'width .3s' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#6B6560' }}>{sprint.completed}/{sprint.total} tasks</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#4C2A92' }}>{pct}%</span>
              {daysLeft !== null && (
                <span style={{ fontSize: 11, color: daysLeft < 3 ? '#C94830' : '#9E9488' }}>
                  {daysLeft < 0 ? 'Ended' : `${daysLeft}d left`}
                </span>
              )}
            </div>
          </div>
        )
      })}
      <NavLink to="/sprints" style={{ fontSize: 12, color: '#4C2A92', fontWeight: 600, textDecoration: 'none' }}>
        View all sprints →
      </NavLink>
    </div>
  )
}
