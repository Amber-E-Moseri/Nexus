import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ExternalLink } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { getPersonalReminders, createPersonalReminder, completePersonalReminder } from '../lib/dashboard-queries'
import { supabase } from '../../../lib/supabase'

export default function PersonalRemindersWidget() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [remindAt, setRemindAt] = useState('')
  const [taskId, setTaskId] = useState('')
  const [saving, setSaving] = useState(false)

  const remindersKey = ['personal-reminders', profile?.id]
  const myTasksKey = ['my-tasks', profile?.id]

  // Shared query cache (BLW-05)
  const { data: reminders = [], isPending: loading } = useQuery({
    queryKey: remindersKey,
    enabled: Boolean(profile?.id),
    queryFn: () => getPersonalReminders(profile.id).then((data) => data ?? []),
  })

  // Fetch user's personal tasks (from "My Tasks" list)
  const { data: myTasks = [] } = useQuery({
    queryKey: myTasksKey,
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('is_personal', true)
        .eq('created_by', profile?.id)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    },
  })

  async function handleAdd(e) {
    e.preventDefault()
    if (!note.trim() || !profile?.id) return
    setSaving(true)
    try {
      await createPersonalReminder(
        profile.id,
        note.trim(),
        remindAt ? new Date(remindAt).toISOString() : null,
        taskId || null
      )
      setNote('')
      setRemindAt('')
      setTaskId('')
      queryClient.invalidateQueries({ queryKey: remindersKey })
    } finally {
      setSaving(false)
    }
  }

  function handleReminderClick(reminder) {
    if (reminder.task_id) {
      navigate(`/tasks/${reminder.task_id}`)
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
      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
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
        </div>
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          style={{
            fontSize: 12.5,
            padding: '7px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: '#6B6455',
          }}
        >
          <option value="">Link to My Task (optional)</option>
          {myTasks.map(task => (
            <option key={task.id} value={task.id}>{task.title}</option>
          ))}
        </select>
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
              cursor: r.task_id ? 'pointer' : 'default',
              transition: 'background-color 0.2s',
            }}
            onClick={() => handleReminderClick(r)}
            onMouseEnter={(e) => {
              if (r.task_id) e.currentTarget.style.backgroundColor = '#f9f8f6'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white'
            }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#2D2A22', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {r.note}
                  {r.task_id && <ExternalLink size={12} style={{ color: '#9E9488', flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 11, color: '#9E9488', marginTop: 2, display: 'flex', gap: 8 }}>
                  {r.remind_at && (
                    <span>{new Date(r.remind_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  )}
                  {r.task_title && (
                    <span>📌 {r.task_title}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleComplete(r.id)
                }}
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
