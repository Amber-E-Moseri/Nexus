import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function Avatar({ name }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', background: '#EDE8F8',
      color: '#4C2A92', fontSize: 11, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  )
}

export default function OverdueByMemberWidget({ role, userId, departmentId }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const today = new Date().toISOString().slice(0, 10)
        let query = supabase
          .from('tasks')
          .select('id, assignee_id, assignee:users!assignee_id(id, name), due_date, status')
          .lt('due_date', today)
          .not('status', 'in', '("done","completed","cancelled")')
          .not('assignee_id', 'is', null)
          .eq('is_personal', false)
          .is('parent_task_id', null)

        if (role === 'dept_lead' && departmentId) {
          query = query.eq('department_id', departmentId)
        } else if (role === 'pastor') {
          const { data: flockRows } = await supabase
            .from('pastor_members')
            .select('member_id')
            .eq('pastor_id', userId)
          const ids = (flockRows ?? []).map(r => r.member_id)
          if (ids.length === 0) { if (active) { setMembers([]); setLoading(false) } return }
          query = query.in('assignee_id', ids)
        }

        const { data } = await query
        if (!active) return

        const map = {}
        for (const task of (data ?? [])) {
          const id = task.assignee_id
          const name = task.assignee?.name ?? 'Unknown'
          if (!map[id]) map[id] = { id, name, tasks: [] }
          map[id].tasks.push(task)
        }
        setMembers(Object.values(map).sort((a, b) => b.tasks.length - a.tasks.length))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [role, userId, departmentId])

  // SCOPING FIX: member — overdue by member is org-wide data, not visible to members
  if (role === 'member') {
    return <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>Overdue data is for admins only</div>
  }

  const MAX = 8
  const visible = members.slice(0, MAX)
  const extra = members.length - MAX

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488', padding: '12px 0' }}>Loading…</div>
  if (members.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No overdue tasks 🎉</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {visible.map(member => (
        <div key={member.id}>
          <button
            type="button"
            onClick={() => setExpanded(expanded === member.id ? null : member.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left',
            }}
          >
            <Avatar name={member.name} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#2D2A22' }}>{member.name}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999,
              background: '#FEF0ED', color: '#C94830',
            }}>
              {member.tasks.length}
            </span>
          </button>
          {expanded === member.id && (
            <div style={{ marginLeft: 36, marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {member.tasks.map(task => (
                <div key={task.id} style={{ fontSize: 11.5, color: '#6B6560', padding: '2px 0' }}>
                  • {task.due_date} — {task.title ?? '(untitled)'}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div style={{ fontSize: 11.5, color: '#9E9488', paddingTop: 4 }}>+ {extra} more members</div>
      )}
    </div>
  )
}
