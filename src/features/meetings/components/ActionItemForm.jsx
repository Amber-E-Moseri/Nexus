import { useState } from 'react'
import { createActionItem } from '../lib/minutes'
import { createTaskFromActionItem } from '../lib/actionItemsBridge'

export default function ActionItemForm({ segmentId, meetingId, onActionCreated }) {
  const [isOpen, setIsOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [users, setUsers] = useState([])

  const handleOpenForm = async () => {
    if (!isOpen) {
      // Load users for assignment (simplified - in real app fetch from API)
      setIsOpen(true)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!description.trim()) {
      return
    }

    try {
      setSaving(true)
      const actionItem = await createActionItem(
        segmentId,
        description,
        assignedTo || null,
        dueDate || null
      )

      // Create linked task (fire and forget - don't block action item creation)
      try {
        await createTaskFromActionItem(actionItem, meetingId)
      } catch (taskErr) {
        console.warn('Failed to create linked task, but action item saved:', taskErr)
      }

      // Reset form
      setDescription('')
      setAssignedTo('')
      setDueDate('')
      setIsOpen(false)

      // Refresh parent
      onActionCreated()
    } catch (err) {
      console.error('Failed to create action item:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {!isOpen ? (
        <button
          type="button"
          onClick={handleOpenForm}
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
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Assign to (name or email)"
              style={{
                padding: '8px 10px',
                fontSize: 12,
                border: '1px solid #E5DDD0',
                borderRadius: 6,
                fontFamily: 'inherit',
              }}
            />
          </div>

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
                setAssignedTo('')
                setDueDate('')
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
