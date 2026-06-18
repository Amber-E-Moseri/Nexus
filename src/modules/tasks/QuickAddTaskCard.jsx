import { useRef, useState } from 'react'

/**
 * Lightweight inline task composer for the board, matching the ClickUp redesign:
 * a white card pinned to the top of a column with a single textarea.
 * Enter creates the task (and keeps the composer open for rapid entry),
 * Escape or blurring while empty closes it.
 */
export default function QuickAddTaskCard({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)

  async function submit({ keepOpen = true } = {}) {
    const trimmed = title.trim()
    if (!trimmed || saving) return

    setSaving(true)
    try {
      await onSubmit(trimmed)
      setTitle('')
      if (keepOpen) textareaRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  function handleBlur() {
    // Commit on blur if there's content (don't refocus); cancel if empty.
    if (title.trim()) submit({ keepOpen: false })
    else onCancel()
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #6B4BBE',
        borderRadius: 10,
        padding: '9px 10px',
        boxShadow: '0 0 0 3px rgba(76,42,146,.09)',
      }}
    >
      <textarea
        ref={textareaRef}
        autoFocus
        value={title}
        rows={2}
        placeholder="Task name, then Enter…"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontFamily: 'inherit',
          fontSize: 13,
          color: '#1C1610',
          background: 'transparent',
        }}
      />
    </div>
  )
}
