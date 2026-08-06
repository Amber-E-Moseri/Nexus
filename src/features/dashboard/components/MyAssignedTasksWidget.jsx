import { useEffect, useState } from 'react'
import { isToday, isBefore, parseISO, startOfDay, format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

function dueDateStyle(dateStr) {
  if (!dateStr) return { label: null, color: 'var(--ink-3)' }
  const d = startOfDay(parseISO(`${dateStr}T00:00:00`))
  const today = startOfDay(new Date())
  if (isBefore(d, today)) return { label: format(d, 'MMM d'), color: 'var(--accent-red)' }
  if (isToday(d)) return { label: 'Today', color: 'var(--accent-orange)' }
  return { label: format(d, 'MMM d'), color: 'var(--ink-3)' }
}

export default function MyAssignedTasksWidget({ userId }) {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let active = true

    async function load() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('tasks')
          .select('id, title, due_date, status_definition:task_status_definitions!status_id(category, color, name)')
          .eq('assignee_id', userId)
          .eq('is_personal', false)
          .is('parent_task_id', null)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(12)

        if (!active) return
        const open = (data ?? []).filter(
          (t) => t.status_definition?.category !== 'completed' && t.status_definition?.category !== 'cancelled',
        )
        setTasks(open)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [userId])

  if (loading) return <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Loading…</div>
  if (tasks.length === 0) return (
    <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '16px 0', textAlign: 'center' }}>
      No open tasks assigned to you.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {tasks.map((task) => {
        const due = dueDateStyle(task.due_date)
        const statusColor = task.status_definition?.color ?? '#C8BFB2'
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => navigate(`/my-tasks?task=${task.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '7px 8px',
              background: 'transparent',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background .1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-sub)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColor,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {task.title}
            </span>
            {due.label && (
              <span style={{ fontSize: 11, fontWeight: 600, color: due.color, flexShrink: 0 }}>
                {due.label}
              </span>
            )}
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => navigate('/my-tasks')}
        style={{ marginTop: 6, fontSize: 12, color: 'var(--purple-700)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 8px' }}
      >
        View all →
      </button>
    </div>
  )
}
