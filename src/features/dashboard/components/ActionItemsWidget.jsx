import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { getUserActionItems } from '../lib/dashboard-queries'
import { updateTask } from '../../../features/tasks'

const STATUS_COLORS = {
  completed: { bg: '#EBF7F1', text: '#2D8653', label: '✓ Done' },
  overdue: { bg: '#FEF0ED', text: '#C94830', label: '⚠ Overdue' },
  due_soon: { bg: '#FEF8E7', text: '#C47E0A', label: '! Due Soon' },
  on_track: { bg: '#F2EEE6', text: '#7A6F5E', label: 'On Track' },
}

// Derive a display status from the RPC fields (task_status + overdue flag + due date).
function deriveStatusKey(item) {
  const status = (item.status ?? '').toLowerCase()
  if (status === 'done' || status === 'completed') return 'completed'
  if (item.is_overdue) return 'overdue'
  if (item.due_date) {
    const due = new Date(item.due_date)
    const soon = new Date()
    soon.setDate(soon.getDate() + 3)
    if (due <= soon) return 'due_soon'
  }
  return 'on_track'
}

export default function ActionItemsWidget() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)

  function reload() {
    setLoading(true)
    getUserActionItems()
      .then(data => setItems(data ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleStatusChange(taskId, newStatus) {
    setUpdating(taskId)
    try {
      await updateTask(taskId, { statusCategory: newStatus === 'completed' ? 'completed' : 'open' })
      reload()
    } catch (error) {
      console.error('Failed to update task status:', error)
    } finally {
      setUpdating(null)
    }
  }

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (items.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No action items</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const colors = STATUS_COLORS[deriveStatusKey(item)] || STATUS_COLORS.on_track
        const dueStr = item.due_date ? new Date(item.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'
        const isUpdating = updating === item.task_id

        return (
          <div key={item.task_id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'white',
            transition: 'background 0.15s',
            opacity: isUpdating ? 0.6 : 1,
          }}>
            <div style={{
              width: 3,
              height: 24,
              borderRadius: 2,
              background: colors.text,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#2D2A22',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.task_title}
              </div>
              {(item.assigner_name || item.meeting_title) && (
                <div style={{
                  fontSize: 11,
                  color: '#9E9488',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.assigner_name ? `from ${item.assigner_name}` : ''}
                  {item.assigner_name && item.meeting_title ? ' · ' : ''}
                  {item.meeting_title ? `📋 ${item.meeting_title}` : ''}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <select
                value={deriveStatusKey(item) === 'completed' ? 'completed' : 'open'}
                onChange={(e) => handleStatusChange(item.task_id, e.target.value)}
                disabled={isUpdating}
                title="Change status"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: colors.bg,
                  color: colors.text,
                  border: 'none',
                  cursor: isUpdating ? 'not-allowed' : 'pointer',
                  appearance: 'none',
                  paddingRight: 18,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='6' viewBox='0 0 8 6'%3E%3Cpath fill='${encodeURIComponent(colors.text)}' d='M0 0l4 6 4-6z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 2px center',
                  whiteSpace: 'nowrap',
                }}
              >
                <option value="open">Open</option>
                <option value="completed">Done</option>
              </select>
              <span style={{ fontSize: 11, color: '#9E9488', minWidth: 45, textAlign: 'right' }}>
                {dueStr}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
