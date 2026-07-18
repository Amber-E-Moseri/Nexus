import { useEffect, useState } from 'react'
import {
  addChecklistItem,
  createChecklist,
  deleteChecklist,
  deleteChecklistItem,
  getChecklists,
  renameChecklist,
  toggleChecklistItem,
  updateChecklistItemTitle,
} from '../lib/checklists'
import TaskChecklist from './TaskChecklist'

export default function TaskChecklists({ taskId }) {
  const [checklists, setChecklists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [focusChecklistId, setFocusChecklistId] = useState(null)

  useEffect(() => {
    if (!taskId) return undefined
    let active = true

    setLoading(true)
    setError('')
    getChecklists(taskId)
      .then((rows) => {
        if (active) setChecklists(rows)
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Failed to load checklists.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [taskId])

  async function handleCreateChecklist() {
    try {
      const created = await createChecklist(taskId, 'Checklist')
      setChecklists((current) => [...current, created])
      setFocusChecklistId(created.id)
      setError('')
    } catch (err) {
      setError(err.message ?? 'Failed to create checklist.')
    }
  }

  async function handleRenameChecklist(id, title) {
    try {
      const updated = await renameChecklist(id, title)
      setChecklists((current) =>
        current.map((checklist) => (checklist.id === id ? { ...checklist, ...updated } : checklist)),
      )
    } catch (err) {
      setError(err.message ?? 'Failed to rename checklist.')
    } finally {
      setFocusChecklistId((current) => (current === id ? null : current))
    }
  }

  async function handleDeleteChecklist(id) {
    const previous = checklists
    setChecklists((current) => current.filter((checklist) => checklist.id !== id))
    try {
      await deleteChecklist(id)
    } catch (err) {
      setChecklists(previous)
      setError(err.message ?? 'Failed to delete checklist.')
    }
  }

  async function handleAddItem(checklistId, title) {
    try {
      const created = await addChecklistItem(checklistId, title)
      setChecklists((current) =>
        current.map((checklist) => (
          checklist.id === checklistId
            ? { ...checklist, items: [...(checklist.items ?? []), created] }
            : checklist
        )),
      )
    } catch (err) {
      setError(err.message ?? 'Failed to add checklist item.')
    }
  }

  async function handleToggleItem(itemId, isChecked) {
    const previous = checklists
    setChecklists((current) =>
      current.map((checklist) => ({
        ...checklist,
        items: (checklist.items ?? []).map((item) => (
          item.id === itemId ? { ...item, is_checked: isChecked } : item
        )),
      })),
    )
    try {
      await toggleChecklistItem(itemId, isChecked)
    } catch (err) {
      setChecklists(previous)
      setError(err.message ?? 'Failed to update checklist item.')
    }
  }

  async function handleUpdateItemTitle(itemId, title) {
    try {
      const updated = await updateChecklistItemTitle(itemId, title)
      setChecklists((current) =>
        current.map((checklist) => ({
          ...checklist,
          items: (checklist.items ?? []).map((item) => (
            item.id === itemId ? { ...item, ...updated } : item
          )),
        })),
      )
    } catch (err) {
      setError(err.message ?? 'Failed to rename checklist item.')
    }
  }

  async function handleDeleteItem(itemId) {
    const previous = checklists
    setChecklists((current) =>
      current.map((checklist) => ({
        ...checklist,
        items: (checklist.items ?? []).filter((item) => item.id !== itemId),
      })),
    )
    try {
      await deleteChecklistItem(itemId)
    } catch (err) {
      setChecklists(previous)
      setError(err.message ?? 'Failed to delete checklist item.')
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 10,
        background: 'var(--surface-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Checklists
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Lightweight checkboxes inside this task.
          </div>
        </div>
        <button
          type="button"
          onClick={() => { void handleCreateChecklist() }}
          style={{
            border: '1px solid var(--border)',
            background: '#FFFFFF',
            color: 'var(--text-primary)',
            borderRadius: 8,
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          + Add checklist
        </button>
      </div>

      {error ? (
        <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--coral-dark)' }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading checklists...</div>
      ) : checklists.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          No checklists yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {checklists.map((checklist) => (
            <TaskChecklist
              key={checklist.id}
              checklist={checklist}
              autoFocusTitle={focusChecklistId === checklist.id}
              onRename={handleRenameChecklist}
              onDelete={handleDeleteChecklist}
              onAddItem={handleAddItem}
              onToggleItem={handleToggleItem}
              onUpdateItemTitle={handleUpdateItemTitle}
              onDeleteItem={handleDeleteItem}
            />
          ))}
        </div>
      )}
    </div>
  )
}
