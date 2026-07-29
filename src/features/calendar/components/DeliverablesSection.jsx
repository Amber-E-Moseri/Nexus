import { useEffect, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import { supabase } from '../../../lib/supabase'

const STATUS_DOT_BY_CATEGORY = {
  completed: '#2D8653',
  in_progress: '#2563EB',
  review: '#B7791F',
  blocked: '#C94830',
  open: '#7A6F5E',
  backlog: '#7A6F5E',
}

function formatDueDate(value) {
  if (!value) return 'No due date'
  return new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DeliverablesSection({ eventId, refreshKey }) {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventId) return
    setLoading(true)
    supabase
      .from('tasks')
      .select(`
        id,
        title,
        due_date,
        assignee:users!assignee_id(id, name),
        status_definition:task_status_definitions!status_id(
          id, name, color, category
        )
      `)
      .eq('calendar_event_id', eventId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load tasks:', error)
          showToast('Failed to load tasks', { tone: 'error' })
          setTasks([])
        } else {
          setTasks(data ?? [])
        }
        setLoading(false)
      })
  }, [eventId, refreshKey])

  if (loading) {
    return <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>Loading tasks…</div>
  }

  if (tasks.length === 0) {
    return <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>No tasks yet.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
      {tasks.map((task) => {
        const category = task.status_definition?.category ?? 'open'
        const dotColor = STATUS_DOT_BY_CATEGORY[category] ?? task.status_definition?.color ?? '#7A6F5E'

        return (
          <div
            key={task.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 14px',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              background: 'var(--surface-tertiary)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: dotColor, flexShrink: 0 }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.title}
                </div>
              </div>
              <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {task.status_definition?.name ?? 'Open'} · {formatDueDate(task.due_date)} · {task.assignee?.name ?? 'Unassigned'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
