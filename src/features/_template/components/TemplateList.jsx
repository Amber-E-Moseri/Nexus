// RENAME: TemplateList → YourFeatureList
// Reusable component — receives data via props or uses the hook directly.
// Keep this component focused on rendering; business logic stays in the hook.

import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { useTemplate } from '../hooks/useTemplate'

const PRIMARY = '#4C2A92'
const BORDER  = '#EDE8DC'
const TEXT    = '#2D2A22'
const MUTED   = '#9E9488'
const BG      = '#FAFAF8'

export default function TemplateList() {
  const { items, isLoading, error, create, remove } = useTemplate()
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    if (!input.trim()) return
    setSaving(true)
    try {
      await create({ title: input.trim() })
      setInput('')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: MUTED }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: '#c0392b', fontSize: 13 }}>
        Failed to load: {error.message}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Add form */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add item…"
          style={{
            flex: 1, padding: '8px 12px', fontSize: 14, border: `1px solid ${BORDER}`,
            borderRadius: 8, outline: 'none', color: TEXT, background: '#fff',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = PRIMARY }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = BORDER }}
        />
        <button
          type="submit"
          disabled={saving || !input.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', background: PRIMARY, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          <Plus size={15} />
          Add
        </button>
      </form>

      {/* List */}
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: MUTED, textAlign: 'center', padding: 24 }}>
          Nothing here yet.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: '#fff', border: `1px solid ${BORDER}`,
                borderRadius: 8, fontSize: 14, color: TEXT,
              }}
            >
              <span>{item.title}</span>
              <button
                onClick={() => remove(item.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: MUTED, padding: '2px 6px',
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
