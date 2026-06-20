import { useState } from 'react'
import { createTask, deleteTask, updateTask } from '../lib/tasks'
import { STATUS_CATEGORIES, getCategoryStatusId, isTaskCompleted } from '../../../lib/taskStatuses'

export default function SubtaskList({
  parentTaskId,
  subtasks = [],
  departmentId,
  sprintId,
  taskType = 'space',
  createdBy,
  onSubtasksChange,
}) {
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setSaving(true)
    try {
      const defaultStatusId = await getCategoryStatusId({
        departmentId: sprintId ? null : departmentId,
        category: STATUS_CATEGORIES.OPEN,
      })
      const created = await createTask({
        title,
        parent_task_id: parentTaskId,
        department_id: departmentId ?? null,
        sprint_id: sprintId ?? null,
        is_personal: false,
        task_type: sprintId ? 'sprint' : taskType,
        statusId: defaultStatusId,
        statusCategory: STATUS_CATEGORIES.OPEN,
        priority: 'medium',
        source: 'manual',
        created_by: createdBy ?? null,
      })
      onSubtasksChange([...subtasks, created])
      setNewTitle('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(subtask) {
    const targetCategory = isTaskCompleted(subtask) ? STATUS_CATEGORIES.OPEN : STATUS_CATEGORIES.COMPLETED
    const nextStatusId = await getCategoryStatusId({
      departmentId: sprintId ? null : departmentId,
      category: targetCategory,
    })
    const updated = await updateTask(subtask.id, {
      statusId: nextStatusId,
      statusCategory: targetCategory,
    })
    onSubtasksChange(subtasks.map((s) => (s.id === subtask.id ? updated : s)))
  }

  async function handleDelete(subtaskId) {
    await deleteTask(subtaskId)
    onSubtasksChange(subtasks.filter((s) => s.id !== subtaskId))
  }

  const doneCount = subtasks.filter((subtask) => isTaskCompleted(subtask)).length

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Subtasks
        </span>
        {subtasks.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {doneCount}/{subtasks.length} done
          </span>
        )}
      </div>

      {/* Progress bar */}
      {subtasks.length > 0 && (
        <div
          style={{
            height: 3, borderRadius: 2,
            background: 'var(--border)', marginBottom: 8, overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%', borderRadius: 2,
              background: 'var(--accent)',
              width: `${(doneCount / subtasks.length) * 100}%`,
              transition: 'width 0.3s',
            }}
          />
        </div>
      )}

      {/* Subtask rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {subtasks.map((subtask) => (
          <div
            key={subtask.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 8px', borderRadius: 6,
              background: 'var(--surface-secondary)',
            }}
          >
            <input
              type="checkbox"
              checked={isTaskCompleted(subtask)}
              onChange={() => handleToggle(subtask)}
              style={{ flexShrink: 0, accentColor: 'var(--accent)', width: 14, height: 14 }}
            />
            <span
              style={{
                flex: 1, fontSize: 13, color: 'var(--text-primary)',
                textDecoration: isTaskCompleted(subtask) ? 'line-through' : 'none',
                opacity: isTaskCompleted(subtask) ? 0.5 : 1,
              }}
            >
              {subtask.title}
            </span>
            <button
              type="button"
              onClick={() => handleDelete(subtask.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-tertiary)', padding: '0 2px', fontSize: 14, lineHeight: 1,
              }}
              aria-label="Delete subtask"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Add subtask input */}
      {adding ? (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Subtask title…"
            style={{
              flex: 1, fontSize: 13, padding: '5px 8px',
              border: '1px solid var(--accent)',
              borderRadius: 6, outline: 'none',
              background: 'white', color: 'var(--text-primary)',
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false) }}
          />
          <button
            type="submit"
            disabled={saving || !newTitle.trim()}
            style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 500,
              background: 'var(--accent)', color: 'white',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              opacity: saving || !newTitle.trim() ? 0.6 : 1,
            }}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            style={{
              padding: '5px 8px', fontSize: 12,
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            fontSize: 12, color: 'var(--text-tertiary)',
            background: 'none', border: '1px dashed var(--border)',
            borderRadius: 6, cursor: 'pointer',
            padding: '5px 10px', width: '100%',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.borderColor = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-tertiary)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          + Add subtask
        </button>
      )}
    </div>
  )
}
