import { useEffect, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { followTask, getTaskFollowers, unfollowTask } from '../lib/followers'
import { useToast } from '../../../context/ToastContext'

export default function WatchersPopover({ taskId, pending = [], onPendingChange, canRemove = true }) {
  const { user: currentUser } = useAuth()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [watchers, setWatchers] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!taskId) return
    getTaskFollowers(taskId).then(setWatchers).catch(() => {})
  }, [taskId])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('users')
        .select('id, name')
        .ilike('name', `%${query.trim()}%`)
        .limit(8)
      setResults(data ?? [])
      setSearching(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (!panelRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const currentWatchers = taskId
    ? watchers.map((f) => f.user).filter(Boolean)
    : pending
  const currentIds = new Set(currentWatchers.map((u) => u.id))

  async function addWatcher(user) {
    if (currentIds.has(user.id)) return
    if (taskId) {
      try {
        await followTask(taskId, user.id, currentUser?.id)
        setWatchers((prev) => [...prev, { user_id: user.id, user }])
      } catch {
        showToast('Could not add watcher. You may not have permission.', { tone: 'error' })
        return
      }
    } else {
      onPendingChange?.([...pending, user])
    }
    setQuery('')
    setResults([])
  }

  async function removeWatcher(userId) {
    if (taskId) {
      try {
        await unfollowTask(taskId, userId)
        setWatchers((prev) => prev.filter((f) => f.user_id !== userId))
      } catch {
        showToast('Could not remove watcher. You may not have permission.', { tone: 'error' })
      }
    } else {
      onPendingChange?.(pending.filter((u) => u.id !== userId))
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Manage watchers"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          borderRadius: 999,
          border: '1px solid var(--border-1)',
          background: open ? '#EDE8F8' : 'white',
          color: open ? '#4C2A92' : 'var(--ink-2)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
          transition: 'background .12s, color .12s',
        }}
      >
        <Eye size={13} />
        {currentWatchers.length > 0 ? currentWatchers.length : 'Watch'}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 268,
            background: 'white',
            border: '1px solid var(--border-1)',
            borderRadius: 12,
            boxShadow: '0 8px 28px rgba(14,14,30,.13)',
            zIndex: 200,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)', marginBottom: 10 }}>
            Watchers
          </div>

          {currentWatchers.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {currentWatchers.map((user) => (
                <span
                  key={user.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: '#EDE8F8',
                    color: '#4C2A92',
                    borderRadius: 999,
                    padding: '3px 6px 3px 10px',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {user.name}
                  {(canRemove || user.id === currentUser?.id) && (
                    <button
                      type="button"
                      onClick={() => removeWatcher(user.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9B8EC4',
                        padding: '0 2px',
                        fontSize: 14,
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={`Remove ${user.name}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            style={{
              width: '100%',
              padding: '7px 10px',
              border: '1px solid var(--border-1)',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
              color: 'var(--ink-1)',
            }}
          />

          {results.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {results.map((user) => {
                const already = currentIds.has(user.id)
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => addWatcher(user)}
                    disabled={already}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 8px',
                      borderRadius: 8,
                      border: 'none',
                      background: already ? '#F7F5FC' : 'white',
                      cursor: already ? 'default' : 'pointer',
                      textAlign: 'left',
                      fontSize: 13,
                      color: already ? 'var(--ink-3)' : 'var(--ink-1)',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => { if (!already) e.currentTarget.style.background = '#EDE8F8' }}
                    onMouseLeave={(e) => { if (!already) e.currentTarget.style.background = 'white' }}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: '#4C2A92', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {user.name?.[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.name}
                    </span>
                    {already && (
                      <span style={{ fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>watching</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {searching && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>Searching…</div>
          )}
          {!searching && query.trim() && results.length === 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>No people found.</div>
          )}
          {!query.trim() && currentWatchers.length === 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
              No watchers yet. Search to add people — even those outside this space.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
