import { useState } from 'react'

// Lightweight, controlled agenda-item editor — add/edit/remove/reorder a
// list of { segment, notes, duration }. No Supabase calls in here; the
// parent owns persistence timing (pre-save for Schedule/Log meeting,
// immediate autosave for an already-saved meeting in MeetingDetailView).
// Deliberately not the full drag-reorder AgendaItemDndContext used by the
// standalone /meetings/wizard flow — this covers the "just give me a real
// agenda from any entry point" ask without that larger UI lift.
export default function MeetingAgendaEditor({ items = [], onChange, disabled, style }) {
  const [newTitle, setNewTitle] = useState('')

  function addItem() {
    if (!newTitle.trim()) return
    onChange([...items, { segment: newTitle.trim(), notes: '', duration: 15 }])
    setNewTitle('')
  }

  function updateItem(index, patch) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function removeItem(index) {
    onChange(items.filter((_, i) => i !== index))
  }

  function moveItem(index, direction) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }
  const inputStyle = { flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent' }
  const iconBtnStyle = { border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: '2px 4px' }

  return (
    <div style={style}>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {items.map((item, i) => (
            <div key={i} style={rowStyle}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', width: 16, textAlign: 'center' }}>{i + 1}</span>
              <input
                value={item.segment}
                onChange={(e) => updateItem(i, { segment: e.target.value })}
                disabled={disabled}
                style={inputStyle}
                placeholder="Agenda item"
              />
              <input
                type="number"
                min={5}
                step={5}
                value={item.duration ?? 15}
                onChange={(e) => updateItem(i, { duration: parseInt(e.target.value, 10) || 0 })}
                disabled={disabled}
                style={{ width: 48, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 4px', fontSize: 12, fontFamily: 'inherit' }}
                aria-label="Minutes"
              />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>min</span>
              {!disabled && (
                <>
                  <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0} style={{ ...iconBtnStyle, opacity: i === 0 ? 0.3 : 1 }} aria-label="Move up">▲</button>
                  <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} style={{ ...iconBtnStyle, opacity: i === items.length - 1 ? 0.3 : 1 }} aria-label="Move down">▼</button>
                  <button type="button" onClick={() => removeItem(i)} style={iconBtnStyle} aria-label="Remove">×</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {!disabled && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
            placeholder="Add agenda item"
            style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <button
            type="button"
            onClick={addItem}
            style={{ border: '1px solid var(--border)', background: '#fff', color: 'var(--accent)', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            + Add
          </button>
        </div>
      )}
    </div>
  )
}
