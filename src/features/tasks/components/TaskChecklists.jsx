import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
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
  const [collapsed, setCollapsed] = useState(false)

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

  const allItems = checklists.flatMap((checklist) => checklist.items ?? [])
  const totalCount = allItems.length
  const openCount = allItems.filter((item) => !item.is_checked).length
  const doneCount = totalCount - openCount
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  const progressColor = progressPercent >= 100 ? '#2D8653' : progressPercent > 0 ? '#C47E0A' : 'transparent'

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          Checklists
          {totalCount > 0 ? (
            <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--text-tertiary)' }}>
              {openCount} open
            </span>
          ) : null}
        </button>
        {totalCount > 0 ? (
          <span aria-hidden="true" style={{ flex: '0 1 56px', minWidth: 44, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${progressPercent}%`, background: progressColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
          </span>
        ) : null}
      </div>

      {!collapsed ? (
        <>
          {error ? (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--coral-dark)' }}>
              {error}
            </div>
          ) : null}

          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading checklists...</div>
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
              <button
                type="button"
                onClick={() => { void handleCreateChecklist() }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  background: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: '4px 0',
                  textAlign: 'left',
                }}
              >
                <span style={{ color: '#C8BFAF', fontSize: 14 }}>+</span>
                Add checklist
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
