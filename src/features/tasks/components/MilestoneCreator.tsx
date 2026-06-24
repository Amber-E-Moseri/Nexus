import { useState } from 'react'
import { Calendar, X } from 'lucide-react'
import { saveMilestone } from '../hooks/useMyTasks'
import { useToast } from '../../../context/ToastContext'
import MilestoneTemplateManager from './MilestoneTemplateManager'

interface MilestoneCreatorProps {
  task: {
    id: string
    title: string
    due_date?: string
  }
  userId: string
  currentMilestone?: {
    id: string
    milestone_date: string
    label?: string
  } | null
  onSave?: (milestone: any) => void
  readOnly?: boolean
}

export default function MilestoneCreator({
  task,
  userId,
  currentMilestone,
  onSave,
  readOnly = false,
}: MilestoneCreatorProps) {
  const { showToast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [milestoneDate, setMilestoneDate] = useState(currentMilestone?.milestone_date || '')
  const [label, setLabel] = useState(currentMilestone?.label || 'Target')
  const [saving, setSaving] = useState(false)

  const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('en-CA') : null
  const displayMilestone = currentMilestone?.milestone_date
    ? new Date(currentMilestone.milestone_date).toLocaleDateString('en-CA')
    : null

  async function handleSave() {
    if (!milestoneDate.trim()) {
      showToast('Milestone date is required', { tone: 'error' })
      return
    }

    setSaving(true)
    try {
      const saved = await saveMilestone(task.id, userId, milestoneDate, label)
      showToast('Milestone saved', { tone: 'success' })
      onSave?.(saved)
      setIsEditing(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save milestone', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await saveMilestone(task.id, userId, null) // null = delete
      showToast('Milestone removed', { tone: 'success' })
      onSave?.(null)
      setMilestoneDate('')
      setLabel('Target')
      setIsEditing(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove milestone', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (readOnly) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
        <div style={{ marginBottom: 4, fontWeight: 500 }}>
          Due: <span style={{ color: 'var(--text-primary)' }}>{dueDate || 'No date'}</span>
        </div>
        {displayMilestone && (
          <div>
            Personal target: <span style={{ color: 'var(--accent)' }}>{displayMilestone}</span>
          </div>
        )}
      </div>
    )
  }

  if (!isEditing) {
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
              Due: <span style={{ color: 'var(--text-primary)' }}>{dueDate || 'No date'}</span>
            </div>
            {displayMilestone && (
              <div style={{ color: 'var(--text-secondary)' }}>
                Target: <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{displayMilestone}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setMilestoneDate(currentMilestone?.milestone_date || '')
              setLabel(currentMilestone?.label || 'Target')
              setIsEditing(true)
            }}
            style={{
              marginLeft: 'auto',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {displayMilestone ? 'Edit' : 'Set'}
          </button>
        </div>
      </div>
    )
  }

  function applyTemplate(template: any) {
    if (task.due_date) {
      const dueDate = new Date(task.due_date)
      const milestoneDate = new Date(dueDate)
      milestoneDate.setDate(milestoneDate.getDate() + template.offset_days)
      const isoDate = milestoneDate.toISOString().split('T')[0]
      setMilestoneDate(isoDate)
      setLabel(template.name)
    }
  }

  return (
    <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-secondary)', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          Personal Target Date
        </label>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
        >
          <X size={16} color="var(--text-tertiary)" />
        </button>
      </div>

      <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <MilestoneTemplateManager
          userId={userId}
          onTemplateSelected={applyTemplate}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input
          type="date"
          value={milestoneDate}
          onChange={(e) => setMilestoneDate(e.target.value)}
          style={{
            padding: '8px 10px',
            fontSize: 13,
            border: '1px solid var(--border)',
            borderRadius: 6,
            outline: 'none',
          }}
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g., Target, Start, Review"
          style={{
            padding: '8px 10px',
            fontSize: 13,
            border: '1px solid var(--border)',
            borderRadius: 6,
            outline: 'none',
          }}
        />
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        Due: {dueDate || 'No date set by department'}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 500,
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {currentMilestone && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            style={{
              padding: '7px 12px',
              fontSize: 12,
              fontWeight: 500,
              background: 'var(--coral-light)',
              color: 'var(--coral-dark)',
              border: 'none',
              borderRadius: 6,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          style={{
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 500,
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
