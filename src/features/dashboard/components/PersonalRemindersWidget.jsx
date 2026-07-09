import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { getPersonalReminders, createPersonalReminder, completePersonalReminder } from '../lib/dashboard-queries'

export default function PersonalRemindersWidget() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [remindAt, setRemindAt] = useState('')
  const [saving, setSaving] = useState(false)

  const remindersKey = ['personal-reminders', profile?.id]

  // Shared query cache (BLW-05)
  const { data: reminders = [], isPending: loading } = useQuery({
    queryKey: remindersKey,
    enabled: Boolean(profile?.id),
    queryFn: () => getPersonalReminders(profile.id).then((data) => data ?? []),
  })

  async function handleAdd(e) {
    e.preventDefault()
    if (!note.trim() || !profile?.id) return
    setSaving(true)
    try {
      await createPersonalReminder(profile.id, note.trim(), remindAt ? new Date(remindAt).toISOString() : null)
      setNote('')
      setRemindAt('')
      queryClient.invalidateQueries({ queryKey: remindersKey })
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete(id) {
    // Optimistic remove; refetch restores truth on failure
    queryClient.setQueryData(remindersKey, (prev = []) => prev.filter((r) => r.id !== id))
    try {
      await completePersonalReminder(id)
    } catch {
      queryClient.invalidateQueries({ queryKey: remindersKey })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Quick note to self…"
          style={{
            flex: 1,
            fontSize: 12.5,
            padding: '7px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        />
        <input
          type="datetime-local"
          value={remindAt}
          onChange={(e) => setRemindAt(e.target.value)}
          style={{
            fontSize: 12,
            padding: '7px 8px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: '#6B6455',
          }}
        />
        <button
          type="submit"
          disabled={saving || !note.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            border: 'none',
            borderRadius: 6,
            background: 'var(--purple-700, #4C2A92)',
            color: 'white',
            cursor: saving || !note.trim() ? 'default' : 'pointer',
            opacity: saving || !note.trim() ? 0.5 : 1,
          }}
        >
          <Plus size={16} />
        </button>
      </form>

      {loading ? (
        <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
      ) : reminders.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9E9488', padding: '12px 0', textAlign: 'center' }}>No reminders</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reminders.map(r => (
            <div key={r.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'white',
            }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.note}
                </div>
                {r.remind_at && (
                  <div style={{ fontSize: 11, color: '#9E9488', marginTop: 2 }}>
                    {new Date(r.remind_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleComplete(r.id)}
                title="Mark done"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  background: 'white',
                  color: '#2D8653',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Done
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
