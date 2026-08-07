import { useState } from 'react'
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react'

const PRIORITY_COLORS = {
  high:   { bg: '#FEF2F2', border: '#FCA5A5', dot: '#DC2626', label: 'High' },
  medium: { bg: '#FFFBEB', border: '#FCD34D', dot: '#D97706', label: 'Medium' },
  low:    { bg: '#F0FDF4', border: '#86EFAC', dot: '#16A34A', label: 'Low' },
}

export default function ExtractionReview({ proposals, onCreateTask, onSaveDecision, saving }) {
  const [acceptedTasks, setAcceptedTasks] = useState(() =>
    new Set(proposals.proposed_tasks.map((_, i) => i))
  )
  const [acceptedDecisions, setAcceptedDecisions] = useState(() =>
    new Set(proposals.proposed_decisions.map((_, i) => i))
  )
  const [editedTasks, setEditedTasks] = useState(() =>
    proposals.proposed_tasks.map((t) => ({ ...t }))
  )
  const [savedTasks, setSavedTasks] = useState(new Set())
  const [savedDecisions, setSavedDecisions] = useState(new Set())
  const [error, setError] = useState(null)

  function toggleTask(i) {
    setAcceptedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  function toggleDecision(i) {
    setAcceptedDecisions((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  function updateTask(i, field, value) {
    setEditedTasks((prev) => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: value }
      return updated
    })
  }

  async function handleCreateTask(i) {
    if (saving) return
    setError(null)
    try {
      await onCreateTask(editedTasks[i])
      setSavedTasks((prev) => new Set([...prev, i]))
    } catch (err) {
      setError(err?.message || 'Failed to create task.')
    }
  }

  async function handleSaveDecision(i) {
    if (saving) return
    setError(null)
    try {
      await onSaveDecision(proposals.proposed_decisions[i])
      setSavedDecisions((prev) => new Set([...prev, i]))
    } catch (err) {
      setError(err?.message || 'Failed to save decision.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 12 }}>
      {error && (
        <div style={{
          padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5',
          borderRadius: 6, fontSize: 12, color: '#991B1B', display: 'flex', gap: 6,
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {/* Proposed Tasks */}
      {editedTasks.length > 0 && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Proposed Tasks ({editedTasks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {editedTasks.map((task, i) => {
              const accepted = acceptedTasks.has(i)
              const done = savedTasks.has(i)
              const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
              return (
                <div
                  key={i}
                  style={{
                    background: done ? '#F0FDF4' : accepted ? pc.bg : 'var(--surface-secondary)',
                    border: `1px solid ${done ? '#86EFAC' : accepted ? pc.border : 'var(--border-light)'}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    opacity: done ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: accepted && !done ? 8 : 0 }}>
                    <button
                      type="button"
                      onClick={() => !done && toggleTask(i)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: done ? 'default' : 'pointer', color: done ? '#16A34A' : accepted ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }}
                    >
                      {done ? <CheckCircle2 size={15} /> : accepted ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      {accepted && !done ? (
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => updateTask(i, 'title', e.target.value)}
                          style={{
                            width: '100%', padding: '4px 6px', fontSize: 13, fontWeight: 600,
                            border: '1px solid var(--border-light)', borderRadius: 5,
                            fontFamily: 'inherit', background: 'white',
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 600, color: done ? '#15803D' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>
                          {task.title}
                        </span>
                      )}
                      {task.context && (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{task.context}</div>
                      )}
                    </div>
                  </div>

                  {accepted && !done && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 23 }}>
                      <input
                        type="text"
                        value={task.owner_name || ''}
                        onChange={(e) => updateTask(i, 'owner_name', e.target.value)}
                        placeholder="Owner"
                        style={{ flex: '1 1 100px', padding: '4px 8px', fontSize: 12, border: '1px solid var(--border-light)', borderRadius: 5, fontFamily: 'inherit', background: 'white' }}
                      />
                      <input
                        type="date"
                        value={task.due_date || ''}
                        onChange={(e) => updateTask(i, 'due_date', e.target.value)}
                        style={{ flex: '0 1 130px', padding: '4px 8px', fontSize: 12, border: '1px solid var(--border-light)', borderRadius: 5, background: 'white' }}
                      />
                      <select
                        value={task.priority}
                        onChange={(e) => updateTask(i, 'priority', e.target.value)}
                        style={{ flex: '0 1 100px', padding: '4px 8px', fontSize: 12, border: '1px solid var(--border-light)', borderRadius: 5, background: 'white' }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleCreateTask(i)}
                        disabled={saving || !task.title.trim()}
                        style={{
                          padding: '4px 12px', fontSize: 12, fontWeight: 600,
                          border: 'none', borderRadius: 5, cursor: saving || !task.title.trim() ? 'not-allowed' : 'pointer',
                          background: 'var(--accent)', color: '#fff', opacity: saving || !task.title.trim() ? 0.5 : 1,
                        }}
                      >
                        Add Task
                      </button>
                    </div>
                  )}

                  {done && (
                    <div style={{ marginLeft: 23, fontSize: 11, color: '#15803D', fontWeight: 600 }}>
                      Task created
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Proposed Decisions */}
      {proposals.proposed_decisions.length > 0 && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Decisions ({proposals.proposed_decisions.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {proposals.proposed_decisions.map((decision, i) => {
              const accepted = acceptedDecisions.has(i)
              const done = savedDecisions.has(i)
              return (
                <div
                  key={i}
                  style={{
                    background: done ? '#F0FDF4' : accepted ? '#F5F0FF' : 'var(--surface-secondary)',
                    border: `1px solid ${done ? '#86EFAC' : accepted ? '#C4B5FD' : 'var(--border-light)'}`,
                    borderRadius: 7,
                    padding: '8px 10px',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    opacity: done ? 0.7 : 1,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => !done && toggleDecision(i)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: done ? 'default' : 'pointer', color: done ? '#16A34A' : accepted ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }}
                  >
                    {done || accepted ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: done ? '#15803D' : 'var(--text-primary)', fontWeight: 500, textDecoration: done ? 'line-through' : 'none' }}>
                      {decision.text}
                    </div>
                    {decision.context && (
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{decision.context}</div>
                    )}
                    {done && (
                      <div style={{ fontSize: 11, color: '#15803D', fontWeight: 600, marginTop: 2 }}>Saved</div>
                    )}
                  </div>
                  {accepted && !done && (
                    <button
                      type="button"
                      onClick={() => handleSaveDecision(i)}
                      disabled={saving}
                      style={{
                        padding: '3px 10px', fontSize: 11, fontWeight: 600,
                        border: '1px solid var(--accent)', borderRadius: 5, cursor: saving ? 'not-allowed' : 'pointer',
                        background: 'transparent', color: 'var(--accent)', flexShrink: 0, opacity: saving ? 0.5 : 1,
                      }}
                    >
                      Save
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Open Questions */}
      {proposals.open_questions.length > 0 && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Open Questions ({proposals.open_questions.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {proposals.open_questions.map((q, i) => (
              <div key={i} style={{
                padding: '7px 10px', background: 'var(--surface-secondary)',
                border: '1px solid var(--border-light)', borderRadius: 6,
                fontSize: 12, color: 'var(--text-secondary)',
                display: 'flex', gap: 6, alignItems: 'flex-start',
              }}>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>?</span>
                {q}
              </div>
            ))}
          </div>
        </section>
      )}

      {editedTasks.length === 0 && proposals.proposed_decisions.length === 0 && proposals.open_questions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: 'var(--text-tertiary)' }}>
          No items extracted — the meeting may not have enough notes yet.
        </div>
      )}
    </div>
  )
}
