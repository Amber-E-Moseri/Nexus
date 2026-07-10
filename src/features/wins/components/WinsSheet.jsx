import { useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../context/ToastContext'
import { useWeeklyWins } from '../hooks/useWeeklyWins'
import { listCompletedTasksForWeek } from '../lib/wins'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const GREEN = '#3E7C4F'

function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function WinRow({ win, canDelete, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span aria-hidden="true" style={{ fontSize: 13, lineHeight: '18px' }}>🙌</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{win.content}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: MUTED }}>{win.author?.name ?? 'Someone'}</span>
          {win.task?.title && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: GREEN, background: `${GREEN}14`, borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ✓ {win.task.title}
            </span>
          )}
        </div>
      </div>
      {canDelete && (
        <button
          type="button"
          aria-label="Delete win"
          onClick={onDelete}
          style={{ border: 'none', background: 'transparent', color: MUTED, cursor: 'pointer', fontSize: 12, padding: '0 2px', alignSelf: 'flex-start' }}
        >
          ×
        </button>
      )}
    </div>
  )
}

/**
 * Department-shared testimonial sheet of wins for one week.
 * Free-text entries, optionally linked to a task completed that week.
 * Used in the Planner sidebar and as a Dashboard widget (compact).
 */
export default function WinsSheet({ departmentId, weekStart, compact = false }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const userId = profile?.id
  const weekStartISO = toISODate(weekStart)
  const weekEndISO = toISODate(addDays(weekStart, 6))

  const { wins, isLoading, addWin, deleteWin } = useWeeklyWins(departmentId, weekStartISO, userId)

  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkedTaskId, setLinkedTaskId] = useState('')
  const [completedTasks, setCompletedTasks] = useState(null)

  async function openTaskPicker() {
    setLinkOpen((o) => !o)
    if (completedTasks === null) {
      try {
        setCompletedTasks(await listCompletedTasksForWeek(departmentId, weekStartISO, weekEndISO))
      } catch {
        setCompletedTasks([])
      }
    }
  }

  async function submit() {
    const content = draft.trim()
    if (!content || saving) return
    setSaving(true)
    try {
      await addWin({ content, taskId: linkedTaskId || null })
      setDraft('')
      setLinkedTaskId('')
      setLinkOpen(false)
    } catch (err) {
      showToast(err?.message ?? 'Failed to save win', { tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(win) {
    try {
      await deleteWin(win.id)
    } catch (err) {
      showToast(err?.message ?? 'Failed to delete win', { tone: 'error' })
    }
  }

  if (!departmentId) {
    return <div style={{ fontSize: 11.5, color: MUTED }}>Join a department to share wins.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ maxHeight: compact ? 220 : 180, overflowY: 'auto' }}>
        {isLoading && <div style={{ fontSize: 11.5, color: MUTED, padding: '6px 0' }}>Loading…</div>}
        {!isLoading && wins.length === 0 && (
          <div style={{ fontSize: 11.5, color: MUTED, padding: '6px 0' }}>
            No wins recorded yet this week — share a testimony!
          </div>
        )}
        {wins.map((win) => (
          <WinRow key={win.id} win={win} canDelete={win.created_by === userId} onDelete={() => handleDelete(win)} />
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        <textarea
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Share a win or testimony…"
          rows={compact ? 2 : 2}
          style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 9px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = PRIMARY }}
          onBlur={(e) => { e.currentTarget.style.borderColor = BORDER }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <button
            type="button"
            onClick={openTaskPicker}
            style={{ border: 'none', background: 'transparent', color: linkedTaskId ? GREEN : MUTED, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            {linkedTaskId ? '✓ Task linked' : '+ Link a task'}
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={submit}
            disabled={saving || !draft.trim()}
            style={{
              border: 'none',
              background: draft.trim() ? PRIMARY : BORDER,
              color: draft.trim() ? '#fff' : MUTED,
              borderRadius: 7,
              padding: '4px 12px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: draft.trim() ? 'pointer' : 'default',
            }}
          >
            {saving ? 'Saving…' : 'Add win'}
          </button>
        </div>
        {linkOpen && (
          <select
            value={linkedTaskId}
            onChange={(e) => setLinkedTaskId(e.target.value)}
            aria-label="Link a task completed this week"
            style={{ width: '100%', marginTop: 5, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '5px 7px', fontSize: 11.5, fontFamily: 'inherit', color: TEXT, background: '#fff' }}
          >
            <option value="">No linked task</option>
            {(completedTasks ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
            {completedTasks !== null && completedTasks.length === 0 && (
              <option value="" disabled>No tasks completed this week</option>
            )}
          </select>
        )}
      </div>
    </div>
  )
}
