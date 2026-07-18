import { useEffect, useRef, useState } from 'react'

export default function TaskChecklist({
  checklist,
  autoFocusTitle = false,
  onRename,
  onDelete,
  onAddItem,
  onToggleItem,
  onUpdateItemTitle,
  onDeleteItem,
}) {
  const [titleDraft, setTitleDraft] = useState(checklist.title ?? 'Checklist')
  const [editingTitle, setEditingTitle] = useState(autoFocusTitle)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [editingItemId, setEditingItemId] = useState(null)
  const [editingItemTitle, setEditingItemTitle] = useState('')
  const titleInputRef = useRef(null)

  useEffect(() => {
    setTitleDraft(checklist.title ?? 'Checklist')
  }, [checklist.title])

  useEffect(() => {
    if (autoFocusTitle) {
      setEditingTitle(true)
    }
  }, [autoFocusTitle])

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingTitle])

  const items = checklist.items ?? []
  const checkedCount = items.filter((item) => item.is_checked).length
  const totalCount = items.length
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0

  async function handleTitleCommit() {
    const nextTitle = titleDraft.trim() || 'Checklist'
    setEditingTitle(false)
    setTitleDraft(nextTitle)
    if (nextTitle !== checklist.title) {
      await onRename(checklist.id, nextTitle)
    }
  }

  async function handleAddItem(event) {
    event?.preventDefault?.()
    const nextTitle = newItemTitle.trim()
    if (!nextTitle) return
    setNewItemTitle('')
    await onAddItem(checklist.id, nextTitle)
  }

  async function handleItemTitleCommit(itemId) {
    const nextTitle = editingItemTitle.trim() || 'Untitled item'
    setEditingItemId(null)
    if (nextTitle) {
      await onUpdateItemTitle(itemId, nextTitle)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 14,
        borderRadius: 12,
        border: '1px solid #E8E0D2',
        background: '#FFFFFF',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => { void handleTitleCommit() }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleTitleCommit()
                }
                if (event.key === 'Escape') {
                  setTitleDraft(checklist.title ?? 'Checklist')
                  setEditingTitle(false)
                }
              }}
              style={{
                width: '100%',
                border: '1px solid var(--accent)',
                borderRadius: 8,
                padding: '7px 10px',
                fontSize: 14,
                fontWeight: 700,
                outline: 'none',
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              style={{
                padding: 0,
                border: 'none',
                background: 'transparent',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {checklist.title || 'Checklist'}
            </button>
          )}
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
            {checkedCount}/{totalCount}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDelete(checklist.id)}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#9E9488',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 4,
          }}
          aria-label="Delete checklist"
        >
          ×
        </button>
      </div>

      <div style={{ height: 6, background: '#F2EEE6', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            width: `${progressPercent}%`,
            height: '100%',
            background: progressPercent === 100 ? '#2D8653' : '#4C2A92',
            transition: 'width 0.2s ease',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
            }}
          >
            <input
              type="checkbox"
              checked={item.is_checked}
              onChange={(event) => onToggleItem(item.id, event.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
            />
            {editingItemId === item.id ? (
              <input
                value={editingItemTitle}
                onChange={(event) => setEditingItemTitle(event.target.value)}
                onBlur={() => { void handleItemTitleCommit(item.id) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleItemTitleCommit(item.id)
                  }
                  if (event.key === 'Escape') {
                    setEditingItemId(null)
                    setEditingItemTitle('')
                  }
                }}
                style={{
                  flex: 1,
                  border: '1px solid var(--accent)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  fontSize: 13,
                  outline: 'none',
                }}
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingItemId(item.id)
                  setEditingItemTitle(item.title)
                }}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  textAlign: 'left',
                  fontSize: 13,
                  color: item.is_checked ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  cursor: 'pointer',
                  textDecoration: item.is_checked ? 'line-through' : 'none',
                }}
              >
                {item.title}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDeleteItem(item.id)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#B0A696',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 2,
              }}
              aria-label="Delete checklist item"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={(event) => { void handleAddItem(event) }} style={{ display: 'flex', gap: 8 }}>
        <input
          value={newItemTitle}
          onChange={(event) => setNewItemTitle(event.target.value)}
          placeholder="Add item"
          style={{
            flex: 1,
            border: '1px solid #D9D1C4',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            border: '1px solid var(--border)',
            background: '#FCFAF6',
            color: 'var(--text-secondary)',
            borderRadius: 8,
            padding: '8px 10px',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Add
        </button>
      </form>
    </div>
  )
}
