import { useState } from 'react'
import { PRIORITIES } from '../../lib/constants'

const PRIORITY_LABELS = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Normal',
  low: 'Low',
}

const PRIORITY_PILL_STYLES = {
  urgent: { background: 'var(--prio-urgent-bg)', color: 'var(--prio-urgent-text)' },
  high: { background: 'var(--prio-high-bg)', color: 'var(--prio-high-text)' },
  medium: { background: 'var(--prio-medium-bg)', color: 'var(--prio-medium-text)' },
  low: { background: 'var(--prio-low-bg)', color: 'var(--prio-low-text)' },
}

export default function InlineTaskComposer({
  departments = [],
  defaultDepartmentId = '',
  listId = null,
  onSubmit,
  onCancel,
  compact = false,
  teamMembers = [],
  statuses = [],
}) {
  const [title, setTitle] = useState('')
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId ?? departments[0]?.id ?? '')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [statusId, setStatusId] = useState(statuses.find(s => s.category === 'open')?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [subtasks, setSubtasks] = useState([])
  const [newSubtask, setNewSubtask] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    if (!title.trim()) {
      setError('Task title is required.')
      return
    }

    if (!departmentId) {
      setError('Select a department.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await onSubmit({
        title: title.trim(),
        departmentId,
        priority,
        dueDate: dueDate || null,
        listId,
        assigneeId: assigneeId || undefined,
        statusId: statusId || undefined,
        subtasks: subtasks.filter(s => s.trim()),
      })
    } catch (submitError) {
      setError(submitError.message ?? 'Failed to create task.')
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginTop: 8,
        padding: compact ? 12 : 14,
        border: '1px solid rgba(91,52,199,0.18)',
        borderRadius: 14,
        background: '#FFFFFF',
        boxShadow: '0 8px 24px rgba(28,22,16,0.06)',
      }}
    >
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        placeholder="Task title"
        style={{
          width: '100%',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: compact ? '9px 11px' : '10px 12px',
          fontSize: 13,
          color: 'var(--text-primary)',
          background: '#FFFFFF',
        }}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr 1fr' : '1fr',
          gap: 10,
          marginTop: 10,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A8E7A' }}>
            Department
          </span>
          <select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '9px 11px',
              fontSize: 13,
              color: 'var(--text-primary)',
              background: '#FFFFFF',
            }}
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A8E7A' }}>
            Due date
          </span>
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '9px 11px',
              fontSize: 13,
              color: 'var(--text-primary)',
              background: '#FFFFFF',
            }}
          />
        </label>
      </div>

      {!compact && teamMembers.length > 0 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A8E7A' }}>
            Assign to
          </span>
          <select
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '9px 11px',
              fontSize: 13,
              color: assigneeId ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: '#FFFFFF',
            }}
          >
            <option value="">Unassigned</option>
            {teamMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name ?? member.email}
              </option>
            ))}
          </select>
        </label>
      )}


      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A8E7A', marginBottom: 8 }}>
          Priority
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRIORITIES.map((option) => {
            const active = priority === option.value
            const styles = PRIORITY_PILL_STYLES[option.value]

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setPriority(option.value)}
                style={{
                  border: active ? '1px solid transparent' : '1px solid var(--border)',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: active ? styles.background : '#FFFFFF',
                  color: active ? styles.color : 'var(--text-secondary)',
                }}
              >
                {PRIORITY_LABELS[option.value] ?? option.label}
              </button>
            )
          })}
        </div>
      </div>

      {!compact && statuses.length > 0 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A8E7A' }}>
            Status
          </span>
          <select
            value={statusId}
            onChange={(event) => setStatusId(event.target.value)}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '9px 11px',
              fontSize: 13,
              color: 'var(--text-primary)',
              background: '#FFFFFF',
            }}
          >
            {statuses.filter(s => s.name !== 'Not Started').map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!compact && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A8E7A', marginBottom: 8 }}>
            Subtasks
          </div>
          {subtasks.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {subtasks.map((subtask, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px',
                    marginBottom: 6,
                    background: '#F5F3F0',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                    {subtask}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSubtasks(subtasks.filter((_, i) => i !== index))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: '0 4px',
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={newSubtask}
              onChange={(event) => setNewSubtask(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && newSubtask.trim()) {
                  event.preventDefault()
                  setSubtasks([...subtasks, newSubtask.trim()])
                  setNewSubtask('')
                }
              }}
              placeholder="Add a subtask"
              style={{
                flex: 1,
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12,
                color: 'var(--text-primary)',
                background: '#FFFFFF',
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (newSubtask.trim()) {
                  setSubtasks([...subtasks, newSubtask.trim()])
                  setNewSubtask('')
                }
              }}
              style={{
                border: '1px solid var(--border)',
                background: '#FFFFFF',
                color: 'var(--accent)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add
            </button>
          </div>
        </div>
      )}

      {error ? <div style={{ marginTop: 10, fontSize: 12, color: 'var(--coral-dark)' }}>{error}</div> : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            border: '1px solid var(--border)',
            background: '#FFFFFF',
            color: 'var(--text-secondary)',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            border: 'none',
            background: 'var(--accent)',
            color: '#FFFFFF',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save task'}
        </button>
      </div>
    </form>
  )
}
