import { useEffect, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import { supabase } from '../../../lib/supabase'
import { createTask } from '../../tasks/lib/tasks'

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

export default function DeliverablesSection({ eventId, departmentId }) {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function loadTasks() {
    if (!eventId) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          due_date,
          created_by,
          assignee:users!assignee_id(id, name),
          status_definition:task_status_definitions!status_id(
            id, name, color, category
          )
        `)
        .eq('calendar_event_id', eventId)
        .is('deleted_at', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setTasks(data ?? [])
    } catch (err) {
      console.error('Failed to load deliverables:', err)
      showToast('Failed to load deliverables', { tone: 'error' })
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [eventId])

  async function handleAddDeliverable(event) {
    event.preventDefault()

    if (!title.trim()) {
      showToast('Deliverable title is required', { tone: 'error' })
      return
    }

    if (!departmentId) {
      showToast('This event needs a department before deliverables can be added.', { tone: 'error' })
      return
    }

    setSaving(true)
    try {
      await createTask({
        title: title.trim(),
        due_date: dueDate || null,
        department_id: departmentId,
        calendar_event_id: eventId,
        task_type: 'space',
        is_personal: false,
        source: 'manual',
      })

      setTitle('')
      setDueDate('')
      await loadTasks()
      showToast('Deliverable added', { tone: 'success' })
    } catch (err) {
      console.error('Failed to create deliverable:', err)
      showToast('Failed to create deliverable', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Deliverables</h3>
        <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Programs-team-only event tasks. Manage full workflow in the task workspace.
        </p>
      </div>

      <form onSubmit={handleAddDeliverable} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 180px auto', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add deliverable title"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '13px',
            boxSizing: 'border-box',
          }}
        />
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '13px',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '10px 14px',
            border: 'none',
            borderRadius: '8px',
            background: 'var(--accent)',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Adding...' : 'Add'}
        </button>
      </form>

      {loading ? (
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Loading deliverables...</div>
      ) : tasks.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No deliverables yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{task.title}</div>
                  </div>
                  <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {task.status_definition?.name ?? 'Open'} · {formatDueDate(task.due_date)} · {task.assignee?.name ?? 'Unassigned'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
