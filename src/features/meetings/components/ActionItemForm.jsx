import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { createActionItem } from '../lib/minutes'
import { createTasksFromActionItems } from '../lib/meetings'
import { linkActionItemToTask } from '../lib/actionItemsBridge'
import { getDeptMembers } from '../../tasks/lib/tasks'
import AssigneeSelector from '../../tasks/components/AssigneeSelector'

export default function ActionItemForm({ segmentId, meetingId, departmentId, onActionCreated }) {
  const { profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [assigneeIds, setAssigneeIds] = useState([])
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [members, setMembers] = useState([])

  useEffect(() => {
    if (!isOpen || !departmentId) return
    let cancelled = false
    getDeptMembers(departmentId)
      .then((rows) => { if (!cancelled) setMembers(rows) })
      .catch((err) => console.error('Failed to load members for assignment:', err))
    return () => { cancelled = true }
  }, [isOpen, departmentId])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!description.trim()) {
      return
    }

    setSaving(true)
    setError(null)

    const assignedTo = assigneeIds[0] ?? null

    try {
      // 1. Create the action item record (drives the minutes UI + status sync)
      const actionItem = await createActionItem(
        segmentId,
        description.trim(),
        assignedTo,
        dueDate || null
      )

      // 2. Create the linked task in the assignee's space so it shows up in
      //    their My Tasks / department board (createTasksFromActionItems sets
      //    department_id, meeting_id, source: 'meeting' and a valid status_id).
      const [task] = await createTasksFromActionItems(
        meetingId,
        departmentId,
        [{
          title: description.trim(),
          assigneeId: assignedTo,
          dueDate: dueDate || null,
          priority,
        }],
        profile?.id ?? null
      )

      // 3. Link the action item back to the task for two-way status sync.
      if (task?.id) {
        await linkActionItemToTask(actionItem.id, task.id)
      }

      // Reset form
      setDescription('')
      setAssigneeIds([])
      setDueDate('')
      setPriority('medium')
      setIsOpen(false)

      // Refresh parent
      onActionCreated()
    } catch (err) {
      console.error('Failed to create action item:', err)
      setError(err.message || 'Failed to save action item. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          style={{
            padding: '8px 12px',
            fontSize: 12,
            border: '1px solid #E5DDD0',
            borderRadius: 6,
            background: 'white',
            color: '#4C2A92',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          + Add Action Item
        </button>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs to be done?"
            style={{
              padding: '8px 10px',
              fontSize: 12,
              border: '1px solid #E5DDD0',
              borderRadius: 6,
              fontFamily: 'inherit',
            }}
            autoFocus
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                padding: '8px 10px',
                fontSize: 12,
                border: '1px solid #E5DDD0',
                borderRadius: 6,
                fontFamily: 'inherit',
              }}
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              aria-label="Priority"
              style={{
                padding: '8px 10px',
                fontSize: 12,
                border: '1px solid #E5DDD0',
                borderRadius: 6,
                fontFamily: 'inherit',
                background: 'white',
                color: '#0C0E18',
              }}
            >
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <AssigneeSelector
            members={members}
            selectedIds={assigneeIds}
            onSelectionChange={setAssigneeIds}
            isMultiSelect={false}
          />

          {error && (
            <p style={{ margin: 0, fontSize: 11, color: '#C94830' }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={saving || !description.trim()}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 12,
                border: 'none',
                borderRadius: 6,
                background: '#4C2A92',
                color: 'white',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
                fontWeight: 500,
              }}
            >
              {saving ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setDescription('')
                setAssigneeIds([])
                setDueDate('')
                setError(null)
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 12,
                border: '1px solid #E5DDD0',
                borderRadius: 6,
                background: 'white',
                color: '#0C0E18',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
