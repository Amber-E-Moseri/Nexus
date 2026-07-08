import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, FLOCK } from '../../lib/flockSupabase'

const MANUAL_KEY = 'ct-manual-todos'

/* ── Local (offline) todo persistence, ported from drafts/todos.js ── */
function getManualTodos() {
  try {
    const raw = localStorage.getItem(MANUAL_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function setManualTodos(list) {
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(list || []))
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function isoFromAny(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function todoKey(personId, text, done, dueDate) {
  return [String(personId || ''), String(text || '').trim().toLowerCase(), done ? '1' : '0', isoFromAny(dueDate)].join('|')
}

function dedupeTodos(items) {
  const keep = {}
  ;(items || []).forEach((t) => {
    const key = todoKey(t.personId, t.text, !!t.done, t.dueDateIso || t.dueDate)
    const existing = keep[key]
    if (!existing || (existing.localOnly && !t.localOnly)) keep[key] = t
  })
  return Object.keys(keep).map((k) => keep[k])
}

function mergeManual(serverTodos) {
  return dedupeTodos((serverTodos || []).concat(getManualTodos()))
}

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^\w\s'-]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Parse "@Name rest of todo" → { personId, personName, text, mentioned }. */
function resolveMention(people, rawText) {
  const text = String(rawText || '').trim()
  if (!text) return { personId: 'manual', personName: 'My Tasks', text, mentioned: false, mentionRaw: '' }
  const m = text.match(/@([^\s,;:!?()[\]{}]+)/)
  if (!m) return { personId: 'manual', personName: 'My Tasks', text, mentioned: false, mentionRaw: '' }

  const mention = String(m[1] || '').trim()
  const norm = normalizeName(mention)
  let clean = text.replace(m[0], '').replace(/\s{2,}/g, ' ').trim().replace(/^[,;:\-–—\s]+/, '').trim()
  if (!norm) return { personId: 'manual', personName: 'My Tasks', text, mentioned: true, mentionRaw: '' }

  const candidates = (people || []).map((p) => {
    const full = normalizeName(p.name || '')
    const first = full.split(/\s+/)[0] || ''
    if (!full) return null
    let score = -1
    if (norm === full) score = 100
    else if (norm === first) score = 95
    else if (full.indexOf(norm + ' ') === 0) score = 90
    else if (full.indexOf(norm) === 0) score = 85
    else if (full.indexOf(norm) >= 0) score = 70
    return score >= 0 ? { person: p, score, fullLen: full.length } : null
  }).filter(Boolean)

  candidates.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.fullLen - a.fullLen))
  if (candidates.length) {
    const chosen = candidates[0].person
    return { personId: String(chosen.id), personName: chosen.name || 'My Tasks', text: clean || text, mentioned: true, mentionRaw: mention }
  }
  return { personId: 'manual', personName: 'My Tasks', text: clean || text, mentioned: true, mentionRaw: mention }
}

function dueLabel(t) {
  const iso = isoFromAny(t.dueDateIso || t.dueDate)
  if (!iso) return 'No Due Date'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function dueStamp(t) {
  const iso = isoFromAny(t.dueDateIso || t.dueDate)
  return iso ? new Date(iso + 'T00:00:00').getTime() : Number.MAX_SAFE_INTEGER
}

const btn = (bg, extra = {}) => ({
  padding: '8px 12px',
  background: bg,
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: FLOCK.fontBody,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  ...extra,
})
const inputStyle = {
  padding: '9px 12px',
  border: `1px solid ${FLOCK.border}`,
  borderRadius: '8px',
  fontSize: '13px',
  fontFamily: FLOCK.fontBody,
  color: FLOCK.text,
  outline: 'none',
  boxSizing: 'border-box',
}

export default function FlockTodosPanel() {
  const [todos, setTodos] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('open')
  const [sort, setSort] = useState('person')
  const [toast, setToast] = useState(null)

  const [addText, setAddText] = useState('')
  const [addDue, setAddDue] = useState('')
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editBusy, setEditBusy] = useState(false)
  const editRef = useRef({})

  const flashToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2600)
  }

  const loadTodos = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await callFlockAPI('getTodos')
      setTodos(mergeManual(res && res.todos ? res.todos : []))
    } catch (e) {
      const merged = mergeManual([])
      setTodos(merged)
      if (!merged.length) setError(e.message || 'Could not load to-dos.')
    } finally {
      setLoading(false)
    }
  }

  const loadPeople = async () => {
    try {
      const list = await callFlockAPI('people')
      setPeople(Array.isArray(list) ? list : [])
    } catch {
      setPeople([])
    }
  }

  useEffect(() => {
    loadTodos()
    loadPeople()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const assigneeOptions = useMemo(() => {
    const opts = [{ id: 'manual', name: 'My Tasks' }]
    const seen = { manual: true }
    people.forEach((p) => {
      const id = String((p && p.id) || '')
      if (!id || seen[id]) return
      seen[id] = true
      opts.push({ id, name: String((p && p.name) || id) })
    })
    return opts
  }, [people])

  const resolveAssigneeName = (personId, fallback) => {
    const id = String(personId || 'manual')
    if (id === 'manual') return 'My Tasks'
    const found = people.find((p) => String((p && p.id) || '') === id)
    return found ? String(found.name || found.id || 'My Tasks') : String(fallback || 'My Tasks')
  }

  /* ── Add ── */
  const handleAdd = async () => {
    const raw = addText.trim()
    if (!raw || adding) return
    setAdding(true)
    const resolved = resolveMention(people, raw)
    const text = String(resolved.text || '').trim()
    if (!text) {
      flashToast('Add text after the @name')
      setAdding(false)
      return
    }
    const dueIso = isoFromAny(addDue)
    const payload = {
      interactionId: 'manual-' + Date.now(),
      personId: resolved.personId || 'manual',
      personName: resolved.personName || 'My Tasks',
      todos: [{ text, dueDate: dueIso || '' }],
    }
    try {
      const res = await callFlockAPI('saveTodos', { payload: JSON.stringify(payload) })
      if (!res || res.success !== true) throw new Error((res && res.error) || 'Save failed')
      // drop any local copy of the just-synced item
      setManualTodos(getManualTodos().filter((t) => todoKey(t.personId, t.text, !!t.done, t.dueDateIso || t.dueDate) !== todoKey(payload.personId, text, false, dueIso)))
      setAddText('')
      setAddDue('')
      await loadTodos()
      if (resolved.mentioned && resolved.personId === 'manual' && resolved.mentionRaw) flashToast('No person matched @' + resolved.mentionRaw + ' — saved to My Tasks')
      else flashToast('To-do added')
    } catch {
      // Offline fallback: persist locally, sync on next successful save
      const candidate = {
        id: 'local-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        personId: payload.personId,
        personName: payload.personName,
        text,
        dueDate: dueIso || '',
        dueDateIso: dueIso || '',
        done: false,
        createdAt: 'Saved locally',
        localOnly: true,
      }
      const local = getManualTodos()
      if (!local.some((t) => todoKey(t.personId, t.text, !!t.done, t.dueDateIso || t.dueDate) === todoKey(candidate.personId, candidate.text, false, candidate.dueDateIso))) {
        local.unshift(candidate)
      }
      setManualTodos(local)
      setAddText('')
      setAddDue('')
      setTodos((cur) => mergeManual(cur.filter((t) => !t.localOnly)))
      flashToast('Saved locally — will sync on next successful save')
    } finally {
      setAdding(false)
    }
  }

  /* ── Toggle ── */
  const handleToggle = async (t, done) => {
    setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, done } : x)))
    if (t.localOnly) {
      setManualTodos(getManualTodos().map((item) => (item.id === t.id ? { ...item, done } : item)))
      return
    }
    try {
      await callFlockAPI('updateTodo', { todoId: t.id, done: done ? 'true' : 'false' })
    } catch {
      setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: !done } : x)))
      flashToast('Could not update task')
    }
  }

  /* ── Delete ── */
  const handleDelete = async (t) => {
    if (t.localOnly) {
      setManualTodos(getManualTodos().filter((item) => item.id !== t.id))
      setTodos((cur) => cur.filter((x) => x.id !== t.id))
      flashToast('Task deleted')
      return
    }
    try {
      const res = await callFlockAPI('deleteTodo', { todoId: t.id })
      if (!res || res.success !== true) throw new Error((res && res.error) || 'Delete failed')
      setTodos((cur) => cur.filter((x) => x.id !== t.id))
      flashToast('Task deleted')
    } catch {
      flashToast('Could not delete task')
    }
  }

  /* ── Inline edit ── */
  const startEdit = (t) => {
    editRef.current = { text: t.text || '', due: isoFromAny(t.dueDateIso || t.dueDate), personId: String(t.personId || 'manual') }
    setEditingId(t.id)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditBusy(false)
  }
  const saveEdit = async (t) => {
    if (editBusy) return
    const draft = editRef.current
    const next = String(draft.text || '').trim()
    const nextDue = isoFromAny(draft.due)
    const nextPid = String(draft.personId || 'manual')
    const curText = String(t.text || '')
    const curDue = isoFromAny(t.dueDateIso || t.dueDate)
    const curPid = String(t.personId || 'manual')
    if (!next) {
      flashToast('Task note cannot be empty')
      return
    }
    if (next === curText && nextDue === curDue && nextPid === curPid) {
      cancelEdit()
      return
    }
    const nextPname = resolveAssigneeName(nextPid, t.personName)
    const dueDisplay = nextDue ? new Date(nextDue + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
    const patched = { ...t, text: next, dueDateIso: nextDue || '', dueDate: dueDisplay, personId: nextPid, personName: nextPname }
    setTodos((cur) => cur.map((x) => (x.id === t.id ? patched : x)))
    setEditBusy(true)

    if (t.localOnly) {
      setManualTodos(getManualTodos().map((item) => (item.id === t.id ? { ...item, text: next, dueDateIso: nextDue || '', dueDate: dueDisplay, personId: nextPid, personName: nextPname } : item)))
      cancelEdit()
      flashToast('Task updated')
      return
    }

    try {
      const reqs = []
      if (next !== curText) reqs.push(callFlockAPI('updateTodoText', { todoId: t.id, text: next }))
      if (nextDue !== curDue) reqs.push(callFlockAPI('updateTodoDueDate', { todoId: t.id, dueDate: nextDue || '' }))
      if (nextPid !== curPid) reqs.push(callFlockAPI('updateTodoAssignee', { todoId: t.id, personId: nextPid, personName: nextPname }))
      const results = await Promise.all(reqs)
      if (results.some((r) => !r || r.success !== true)) throw new Error('Update failed')
      cancelEdit()
      flashToast('Task updated')
    } catch {
      setTodos((cur) => cur.map((x) => (x.id === t.id ? t : x)))
      setEditBusy(false)
      flashToast('Could not update task')
    }
  }

  /* ── Grouping / render ── */
  const groups = useMemo(() => {
    const list = filter === 'open' ? todos.filter((t) => !t.done) : todos
    const sorted = list.slice().sort((a, b) => {
      const ad = dueStamp(a)
      const bd = dueStamp(b)
      if (ad !== bd) return ad - bd
      const an = String(a.personName || '').toLowerCase()
      const bn = String(b.personName || '').toLowerCase()
      if (an !== bn) return an < bn ? -1 : 1
      return String(a.text || '').toLowerCase() < String(b.text || '').toLowerCase() ? -1 : 1
    })
    const map = {}
    const order = []
    sorted.forEach((t) => {
      const key = sort === 'due' ? (isoFromAny(t.dueDateIso || t.dueDate) || 'zzzz-nodue') : String(t.personId || 'unknown')
      const label = sort === 'due' ? dueLabel(t) : t.personName || 'Unknown'
      if (!map[key]) {
        map[key] = { name: label, items: [] }
        order.push(key)
      }
      map[key].items.push(t)
    })
    order.sort((a, b) => {
      if (sort === 'person') return String(map[a].name).toLowerCase() < String(map[b].name).toLowerCase() ? -1 : 1
      if (a === 'zzzz-nodue') return 1
      if (b === 'zzzz-nodue') return -1
      return a < b ? -1 : 1
    })
    return order.map((k) => ({ key: k, ...map[k] }))
  }, [todos, filter, sort])

  const openCount = todos.filter((t) => !t.done).length

  return (
    <div style={{ display: 'grid', gap: '16px', position: 'relative' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>To-Do List</h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted }}>
          Things to do as a result of your calls. {openCount > 0 ? `${openCount} open item${openCount > 1 ? 's' : ''}.` : 'All caught up ✓'}
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', background: FLOCK.surface, border: `1px solid ${FLOCK.border}`, borderRadius: '999px', padding: '3px' }}>
          {['open', 'all'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 16px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                fontFamily: FLOCK.fontBody,
                background: filter === f ? FLOCK.purple : 'transparent',
                color: filter === f ? '#FFFFFF' : FLOCK.muted,
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: FLOCK.muted }}>Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ ...inputStyle, padding: '7px 10px' }}>
            <option value="person">Person</option>
            <option value="due">Due Date</option>
          </select>
          <button type="button" onClick={loadTodos} style={{ ...btn(FLOCK.card), color: FLOCK.muted, border: `1px solid ${FLOCK.border}` }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Add row */}
      <div style={flockCard({ padding: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' })}>
        <input
          type="text"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="@Name then your to-do (or just type for My Tasks)"
          style={{ ...inputStyle, flex: '1 1 220px' }}
        />
        <input type="date" value={addDue} onChange={(e) => setAddDue(e.target.value)} title="Optional due date" style={{ ...inputStyle, fontFamily: FLOCK.fontMono }} />
        <button type="button" onClick={handleAdd} disabled={adding || !addText.trim()} style={btn(FLOCK.purple, { opacity: adding || !addText.trim() ? 0.6 : 1 })}>
          <Plus size={15} /> Add
        </button>
      </div>

      {error && <div style={{ fontSize: '13px', color: FLOCK.red }}>{error}</div>}

      {/* List */}
      {loading ? (
        <div style={{ ...flockCard({ padding: '32px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px' }}>Loading to-dos…</div>
      ) : groups.length === 0 ? (
        <div style={{ ...flockCard({ padding: '32px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px' }}>
          {filter === 'open' ? 'No open to-dos ✓' : 'No action items yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {groups.map((g) => (
            <div key={g.key} style={flockCard({ padding: '0', overflow: 'hidden' })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', background: FLOCK.surface, borderBottom: `1px solid ${FLOCK.border}`, fontSize: '12px', fontWeight: 700, color: FLOCK.text }}>
                <span>{g.name}</span>
                <span style={{ color: FLOCK.muted }}>
                  {sort === 'due' ? `${g.items.length} item${g.items.length === 1 ? '' : 's'}` : `${g.items.filter((i) => !i.done).length} open`}
                </span>
              </div>
              <div>
                {g.items.map((t) => {
                  const editing = editingId === t.id
                  return (
                    <div key={t.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 16px', borderTop: `1px solid ${FLOCK.border}` }}>
                      <input type="checkbox" checked={!!t.done} onChange={(e) => handleToggle(t, e.target.checked)} style={{ marginTop: '3px', cursor: 'pointer' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editing ? (
                          <div style={{ display: 'grid', gap: '8px' }}>
                            <input
                              type="text"
                              defaultValue={t.text}
                              maxLength={240}
                              autoFocus
                              onChange={(e) => (editRef.current.text = e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  saveEdit(t)
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault()
                                  cancelEdit()
                                }
                              }}
                              style={inputStyle}
                            />
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <input type="date" defaultValue={isoFromAny(t.dueDateIso || t.dueDate)} onChange={(e) => (editRef.current.due = e.target.value)} style={{ ...inputStyle, fontFamily: FLOCK.fontMono }} />
                              <select defaultValue={String(t.personId || 'manual')} onChange={(e) => (editRef.current.personId = e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }}>
                                {assigneeOptions.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button type="button" onClick={() => saveEdit(t)} disabled={editBusy} style={btn(FLOCK.purple, { padding: '6px 12px', opacity: editBusy ? 0.6 : 1 })}>
                                <Check size={13} /> Save
                              </button>
                              <button type="button" onClick={cancelEdit} disabled={editBusy} style={{ ...btn(FLOCK.card, { padding: '6px 12px' }), color: FLOCK.muted, border: `1px solid ${FLOCK.border}` }}>
                                <X size={13} /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontSize: '14px', color: FLOCK.text, textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.6 : 1, wordBreak: 'break-word' }}>{t.text}</div>
                            {(t.dueDate || t.createdAt) && (
                              <div style={{ fontSize: '11px', color: FLOCK.muted, marginTop: '3px', fontFamily: FLOCK.fontMono }}>
                                {[t.dueDate ? `Due: ${t.dueDate}` : null, t.createdAt ? `Created: ${t.createdAt}` : null].filter(Boolean).join(' • ')}
                                {t.localOnly ? '  •  offline' : ''}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {!editing && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button type="button" onClick={() => startEdit(t)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FLOCK.muted, padding: '4px' }}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => handleDelete(t)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FLOCK.muted, padding: '4px' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div style={{ position: 'sticky', bottom: '16px', justifySelf: 'center', background: FLOCK.text, color: '#FFFFFF', padding: '10px 18px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, boxShadow: '0 8px 24px rgba(30,22,51,0.25)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
