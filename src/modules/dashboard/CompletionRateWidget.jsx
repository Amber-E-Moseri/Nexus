import { useEffect, useState } from 'react'
import { startOfWeek, subWeeks } from 'date-fns'
import { supabase } from '../../lib/supabase'

export default function CompletionRateWidget({ role, userId, departmentId }) {
  const [data, setData] = useState({ completedThisWeek: 0, createdThisWeek: 0, completedLastWeek: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString()
        const lastWeekStart = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1).toISOString()

        // Helper to apply role-based filtering
        async function applyRoleFilter(query) {
          if (role === 'member') return query.eq('assignee_id', userId)
          if (role === 'dept_lead' && departmentId) return query.eq('department_id', departmentId)
          // SCOPING FIX: pastor — should filter to assigned members only
          if (role === 'pastor') {
            const { data: flockRows } = await supabase
              .from('pastor_members')
              .select('member_id')
              .eq('pastor_id', userId)
            const ids = (flockRows ?? []).map(r => r.member_id)
            return ids.length === 0 ? query.eq('assignee_id', 'null-uuid-never-matches') : query.in('assignee_id', ids)
          }
          return query
        }

        const q1 = await applyRoleFilter(
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .in('status', ['done', 'completed'])
            .gte('updated_at', weekStart)
            .eq('is_personal', false),
        )
        const q2 = await applyRoleFilter(
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', weekStart)
            .eq('is_personal', false),
        )
        const q3 = await applyRoleFilter(
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .in('status', ['done', 'completed'])
            .gte('updated_at', lastWeekStart)
            .lt('updated_at', weekStart)
            .eq('is_personal', false),
        )
        const [completedRes, createdRes, lastWeekRes] = await Promise.allSettled([q1, q2, q3])

        if (!active) return
        setData({
          completedThisWeek: completedRes.status === 'fulfilled' ? (completedRes.value.count ?? 0) : 0,
          createdThisWeek: createdRes.status === 'fulfilled' ? (createdRes.value.count ?? 0) : 0,
          completedLastWeek: lastWeekRes.status === 'fulfilled' ? (lastWeekRes.value.count ?? 0) : 0,
        })
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [role, userId, departmentId])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>

  const { completedThisWeek, createdThisWeek, completedLastWeek } = data
  const pct = createdThisWeek > 0 ? Math.round((completedThisWeek / createdThisWeek) * 100) : 0
  const trend = completedThisWeek - completedLastWeek

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: '#4C2A92', lineHeight: 1 }}>{pct}%</span>
        {trend !== 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: trend > 0 ? '#2D8653' : '#C94830' }}>
            {trend > 0 ? '▲' : '▼'} {Math.abs(trend)} vs last week
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: '#9E9488', marginBottom: 12 }}>
        {completedThisWeek} of {createdThisWeek} tasks completed this week
      </div>
      <div style={{ background: '#EDE8DC', borderRadius: 999, height: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: '#4C2A92', borderRadius: 999, transition: 'width .4s' }} />
      </div>
      {completedThisWeek === 0 && (
        <div style={{ fontSize: 12, color: '#9E9488', marginTop: 8 }}>No tasks completed this week yet</div>
      )}
    </div>
  )
}
