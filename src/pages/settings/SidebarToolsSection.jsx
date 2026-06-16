import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: 5,
}

const INPUT = {
  width: '100%',
  padding: '8px 11px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 13,
  color: 'var(--text-primary)',
  background: '#fff',
  outline: 'none',
}

function ToolRow({ tool, onToggle, onDelete }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-light)',
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: 'var(--accent-light)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {tool.icon_emoji || '⊞'}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tool.name}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tool.launch_url}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={Boolean(tool.show_in_sidebar)}
          onChange={() => onToggle(tool)}
          style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        Sidebar
      </label>

      <button
        type="button"
        onClick={() => onDelete(tool.id)}
        style={{
          flexShrink: 0,
          border: '1px solid var(--border)',
          background: 'transparent',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 11.5,
          color: 'var(--coral-dark)',
          cursor: 'pointer',
        }}
      >
        Remove
      </button>
    </div>
  )
}

export default function SidebarToolsSection() {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [emoji, setEmoji] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('external_integrations')
      .select('id, name, launch_url, icon_emoji, show_in_sidebar, sort_order')
      .order('sort_order')
    setTools(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!name.trim() || !url.trim()) {
      setError('Name and URL are required.')
      return
    }
    setError('')
    setAdding(true)

    const maxOrder = tools.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0)
    const { error: insertError } = await supabase.from('external_integrations').insert({
      name: name.trim(),
      type: 'custom',
      launch_url: url.trim(),
      icon_emoji: emoji.trim() || null,
      visible_to: 'all',
      enabled: true,
      show_in_sidebar: true,
      sort_order: maxOrder + 1,
    })

    setAdding(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setName('')
    setUrl('')
    setEmoji('')
    await load()
  }

  async function handleToggle(tool) {
    const next = !tool.show_in_sidebar
    setTools((prev) => prev.map((t) => t.id === tool.id ? { ...t, show_in_sidebar: next } : t))
    await supabase.from('external_integrations').update({ show_in_sidebar: next }).eq('id', tool.id)
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this tool?')) return
    const { error: deleteError } = await supabase.from('external_integrations').delete().eq('id', id)
    if (deleteError) { window.alert(deleteError.message); return }
    setTools((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: 'var(--card-shadow)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '13px 16px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>Sidebar Tools</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            Tools marked with Sidebar appear in the left navigation for all users.
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>Loading…</div>
      ) : tools.length === 0 ? (
        <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>No tools added yet.</div>
      ) : (
        <div>
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <div
        style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-secondary)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          Add Tool
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8 }}>
          <label>
            <span style={LABEL}>Name</span>
            <input
              style={INPUT}
              placeholder="e.g. Canva"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span style={LABEL}>URL</span>
            <input
              style={INPUT}
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            <span style={LABEL}>Emoji</span>
            <input
              style={INPUT}
              placeholder="🔗"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--coral-dark)' }}>{error}</div>
        )}

        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          style={{
            marginTop: 10,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '7px 16px',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: adding ? 'not-allowed' : 'pointer',
            opacity: adding ? 0.6 : 1,
          }}
        >
          {adding ? 'Adding…' : '+ Add to Sidebar'}
        </button>
      </div>
    </div>
  )
}
