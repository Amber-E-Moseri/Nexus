import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight, Mail, Pencil, Phone, RefreshCw, Search, Sparkles, UserPlus, Users, X } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, initials, FLOCK } from '../../lib/flockSupabase'
import { useAuth } from '../../hooks/useAuth'

const inputStyle = {
  padding: '10px 12px',
  border: `1px solid ${FLOCK.border}`,
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: FLOCK.fontBody,
  color: FLOCK.text,
  outline: 'none',
  boxSizing: 'border-box',
}
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: FLOCK.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', fontFamily: FLOCK.fontBody }
const btnPrimary = (extra = {}) => ({
  padding: '10px 16px',
  background: FLOCK.purple,
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '10px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: FLOCK.fontBody,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  ...extra,
})
const btnGhost = (extra = {}) => ({
  ...btnPrimary(extra),
  background: FLOCK.card,
  color: FLOCK.muted,
  border: `1px solid ${FLOCK.border}`,
  fontWeight: 600,
})

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

function dueBucket(p) {
  if (p.active === false) return 'paused'
  if (p.dueStatus === 'Overdue' || (p.nextDueDate && p.nextDueDate < todayIso())) return 'overdue'
  if (p.nextDueDate && p.nextDueDate === todayIso()) return 'today'
  if (p.nextDueDate) return 'onTrack'
  return 'noCalls'
}

const DUE_BUCKETS = {
  overdue: { label: 'Overdue', fg: FLOCK.red, bg: FLOCK.redTint },
  today: { label: 'Due today', fg: FLOCK.amber, bg: FLOCK.amberTint },
  onTrack: { label: 'On track', fg: FLOCK.green, bg: FLOCK.greenTint },
  noCalls: { label: 'No calls yet', fg: FLOCK.purple, bg: FLOCK.purpleTint },
  paused: { label: 'Paused', fg: FLOCK.muted, bg: '#F2F0F7' },
}

function dueBadge(p) {
  return DUE_BUCKETS[dueBucket(p)]
}

/** Highlight case-insensitive matches of `q` inside `text`. */
function Highlighted({ text, q }) {
  const query = String(q || '').trim()
  if (!query) return <>{text}</>
  const parts = []
  const lower = String(text).toLowerCase()
  const lowerQ = query.toLowerCase()
  let i = 0
  while (i < text.length) {
    const found = lower.indexOf(lowerQ, i)
    if (found === -1) {
      parts.push(text.slice(i))
      break
    }
    if (found > i) parts.push(text.slice(i, found))
    parts.push(
      <mark key={found} style={{ background: FLOCK.purpleTint, color: FLOCK.purple, borderRadius: '3px', padding: '0 2px' }}>
        {text.slice(found, found + query.length)}
      </mark>
    )
    i = found + query.length
  }
  return <>{parts}</>
}

function interactionTone(i) {
  if (i.outcome === 'Successful' || i.result === 'Reached') return { fg: FLOCK.green, bg: FLOCK.greenTint }
  if (i.result === 'Left Message') return { fg: FLOCK.amber, bg: FLOCK.amberTint }
  if (i.result === 'Rescheduled Call') return { fg: FLOCK.purple, bg: FLOCK.purpleTint }
  return { fg: FLOCK.red, bg: FLOCK.redTint }
}

const RESULT_OPTIONS = ['Reached', 'No Answer', 'Left Message', 'Rescheduled Call']
const SUMMARY_CLAMP_LINES = 5

function toDateTimeLocalValue(raw) {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function InteractionCard({ i, onUpdated }) {
  const tone = interactionTone(i)
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const isLong = (i.summary || '').length > 260 || (i.summary || '').split('\n').length > SUMMARY_CLAMP_LINES

  const startEdit = () => {
    setForm({
      result: i.result || 'Reached',
      summary: i.summary || '',
      nextAction: i.nextAction && i.nextAction !== 'None' ? i.nextAction : '',
      nextActionDateTime: toDateTimeLocalValue(i.nextActionDateTimeRaw),
    })
    setError(null)
    setEditing(true)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await callFlockAPI('updateInteraction', {
        payload: JSON.stringify({
          interactionId: i.id,
          result: form.result,
          summary: form.summary,
          nextAction: form.nextAction.trim() || 'None',
          nextActionDateTime: form.nextActionDateTime ? new Date(form.nextActionDateTime).toISOString() : null,
        }),
      })
      const nextIso = form.nextActionDateTime ? new Date(form.nextActionDateTime).toISOString() : null
      onUpdated?.(i.id, {
        result: form.result,
        summary: form.summary,
        nextAction: form.nextAction.trim() || 'None',
        nextDt: nextIso ? new Date(nextIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
        nextActionDateTimeRaw: nextIso,
      })
      setEditing(false)
    } catch (err) {
      setError(err.message || 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  if (editing && form) {
    return (
      <div style={flockCard({ padding: '13px 15px', borderRadius: '12px', boxShadow: 'none', background: FLOCK.surface })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span style={{ fontFamily: FLOCK.fontMono, fontSize: '12px', color: FLOCK.muted }}>{i.timestamp || '—'}</span>
          <select value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))} style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }}>
            {RESULT_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <textarea
          value={form.summary}
          onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
          rows={4}
          style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: FLOCK.fontBody }}
          placeholder="Notes…"
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <input
            value={form.nextAction}
            onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))}
            placeholder="Next action (optional)"
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="datetime-local"
            value={form.nextActionDateTime}
            onChange={(e) => setForm((f) => ({ ...f, nextActionDateTime: e.target.value }))}
            style={{ ...inputStyle }}
          />
        </div>
        {error && <div style={{ marginTop: '8px', fontSize: '12px', color: FLOCK.red }}>{error}</div>}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button onClick={save} disabled={saving} style={btnPrimary({ padding: '7px 14px', fontSize: '12px', opacity: saving ? 0.6 : 1 })}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} disabled={saving} style={btnGhost({ padding: '7px 14px', fontSize: '12px' })}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={flockCard({ padding: '13px 15px', borderRadius: '12px', boxShadow: 'none', background: FLOCK.surface })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontFamily: FLOCK.fontMono, fontSize: '12px', color: FLOCK.muted }}>{i.timestamp || '—'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', color: tone.fg, background: tone.bg, fontFamily: FLOCK.fontBody, whiteSpace: 'nowrap' }}>
            {i.result || i.outcome || 'Attempt'}
          </span>
          <button
            onClick={startEdit}
            title="Edit note"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', border: 'none', background: 'transparent', color: FLOCK.muted, cursor: 'pointer', borderRadius: '6px' }}
          >
            <Pencil size={13} />
          </button>
        </div>
      </div>
      {i.summary && (
        <div
          style={{
            marginTop: '8px',
            fontSize: '13px',
            lineHeight: 1.5,
            color: FLOCK.text,
            fontFamily: FLOCK.fontBody,
            whiteSpace: 'pre-wrap',
            ...(isLong && !expanded
              ? { display: '-webkit-box', WebkitLineClamp: String(SUMMARY_CLAMP_LINES), WebkitBoxOrient: 'vertical', overflow: 'hidden' }
              : {}),
          }}
        >
          {i.summary}
        </div>
      )}
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ marginTop: '4px', padding: 0, border: 'none', background: 'transparent', color: FLOCK.purple, fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: FLOCK.fontBody }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      {i.nextAction && i.nextAction !== 'None' && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: FLOCK.purple, fontWeight: 600, fontFamily: FLOCK.fontBody }}>
          Next: {i.nextAction}
          {i.nextDt ? <span style={{ fontFamily: FLOCK.fontMono, fontWeight: 400 }}> · {i.nextDt}</span> : null}
        </div>
      )}
      {i.meetingId && (
        <Link
          to={`/meetings/${i.meetingId}`}
          style={{ display: 'inline-block', marginTop: '8px', fontSize: '12px', color: FLOCK.purple, fontWeight: 600, fontFamily: FLOCK.fontBody, textDecoration: 'none' }}
        >
          → Open linked meeting
        </Link>
      )}
    </div>
  )
}

const BLANK_PERSON = { name: '', role: '', fellowship: '', phone: '', email: '', cadence: '28' }

function AddPersonForm({ onAdded, onCancel }) {
  const [form, setForm] = useState(BLANK_PERSON)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    const name = form.name.trim()
    if (!name || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await callFlockAPI('addPerson', {
        payload: JSON.stringify({
          name,
          role: form.role.trim(),
          fellowship: form.fellowship.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          priority: '',
          cadenceDays: parseInt(form.cadence, 10) > 0 ? parseInt(form.cadence, 10) : 28,
        }),
      })
      if (!res || !res.success) throw new Error((res && res.error) || 'Save failed')
      onAdded(name, res.personId)
    } catch (e) {
      setError('Error: ' + String(e.message || e))
      setSaving(false)
    }
  }

  return (
    <div style={flockCard({ padding: '18px', display: 'grid', gap: '14px', borderColor: FLOCK.borderStrong })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <UserPlus size={16} color={FLOCK.purple} />
        <span style={{ fontSize: '14px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Add a person</span>
      </div>
      {error && <div style={{ fontSize: '13px', color: FLOCK.red }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Full name *</label>
          <input
            type="text"
            value={form.name}
            onChange={set('name')}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. John Smith"
            autoFocus
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div>
          <label style={labelStyle}>Role — optional</label>
          <input type="text" value={form.role} onChange={set('role')} placeholder="e.g. Cell leader" style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Fellowship — optional</label>
          <input type="text" value={form.fellowship} onChange={set('fellowship')} placeholder="e.g. U of Manitoba" style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Phone — optional</label>
          <input type="tel" value={form.phone} onChange={set('phone')} placeholder="e.g. (204) 555-0123" style={{ ...inputStyle, width: '100%', fontFamily: FLOCK.fontMono }} />
        </div>
        <div>
          <label style={labelStyle}>Email — optional</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="e.g. john@example.com" style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Call every (days)</label>
          <input type="number" min="1" max="365" value={form.cadence} onChange={set('cadence')} style={{ ...inputStyle, width: '100%', fontFamily: FLOCK.fontMono }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={submit} disabled={saving || !form.name.trim()} style={btnPrimary({ opacity: saving || !form.name.trim() ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' })}>
          {saving ? 'Saving…' : 'Add person'}
        </button>
        <button type="button" onClick={onCancel} style={btnGhost()}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function EditPersonForm({ person, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: person.name || '',
    role: person.role || '',
    fellowship: person.fellowship || '',
    phone: person.phone || '',
    email: person.email || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await callFlockAPI('updatePerson', {
        payload: JSON.stringify({ personId: person.id, ...form }),
      })
      if (!res || !res.success) throw new Error('Save failed')
      onSaved({
        name: form.name.trim(),
        role: form.role.trim(),
        fellowship: form.fellowship.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      })
    } catch (e) {
      setError('Error: ' + String(e.message || e))
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '12px', padding: '14px', background: FLOCK.surface, borderRadius: '12px' }}>
      {error && <div style={{ fontSize: '13px', color: FLOCK.red }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        <div>
          <label style={labelStyle}>Full name *</label>
          <input type="text" value={form.name} onChange={set('name')} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Role</label>
          <input type="text" value={form.role} onChange={set('role')} placeholder="e.g. Cell leader" style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Fellowship</label>
          <input type="text" value={form.fellowship} onChange={set('fellowship')} placeholder="e.g. U of Manitoba" style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Phone</label>
          <input type="tel" value={form.phone} onChange={set('phone')} placeholder="e.g. (204) 555-0123" style={{ ...inputStyle, width: '100%', fontFamily: FLOCK.fontMono }} />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="e.g. john@example.com" style={{ ...inputStyle, width: '100%' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={submit} disabled={saving || !form.name.trim()} style={btnPrimary({ padding: '8px 14px', opacity: saving || !form.name.trim() ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' })}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
        <button type="button" onClick={onCancel} style={btnGhost({ padding: '8px 14px' })}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function PersonCard({ person, expanded, onToggle, onLogCall, onPatched }) {
  const [interactions, setInteractions] = useState(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  const [editing, setEditing] = useState(false)

  const [days, setDays] = useState(String(parseInt(person.cadenceDays, 10) || 28))
  const [savingCad, setSavingCad] = useState(false)
  const [cadStatus, setCadStatus] = useState(null) // 'ok' | 'err'
  const [toggling, setToggling] = useState(false)

  const active = person.active !== false
  const badge = dueBadge(person)
  const sub = [person.role, person.fellowship].filter(Boolean).join(' · ')

  const loadHistory = async () => {
    setLoadingHistory(true)
    setHistoryError(null)
    try {
      const list = await callFlockAPI('getInteractions', { personId: person.id })
      setInteractions(Array.isArray(list) ? list : [])
    } catch (err) {
      setHistoryError(err.message || 'Could not load history.')
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (expanded && interactions === null && !loadingHistory) loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const saveCadence = async () => {
    const n = parseInt(days, 10)
    if (!n || n < 1 || savingCad) return
    setSavingCad(true)
    setCadStatus(null)
    try {
      const res = await callFlockAPI('saveCadence', { personId: person.id, cadenceDays: n })
      if (!res || !res.success) throw new Error('Save failed')
      onPatched(person.id, { cadenceDays: n })
      setCadStatus('ok')
      setTimeout(() => setCadStatus((cur) => (cur === 'ok' ? null : cur)), 2000)
    } catch {
      setCadStatus('err')
    } finally {
      setSavingCad(false)
    }
  }

  const toggleActive = async () => {
    if (toggling) return
    const next = !active
    setToggling(true)
    onPatched(person.id, { active: next })
    try {
      const res = await callFlockAPI('setActive', { personId: person.id, active: next ? 'true' : 'false' })
      if (!res || !res.success) throw new Error('Toggle failed')
    } catch {
      onPatched(person.id, { active: !next })
    } finally {
      setToggling(false)
    }
  }

  return (
    <div style={flockCard({ padding: 0, overflow: 'hidden' })}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FLOCK.fontBody }}
      >
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: FLOCK.purpleTint, color: FLOCK.purple, display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0, opacity: active ? 1 : 0.5 }}>
          {initials(person.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: FLOCK.text, opacity: active ? 1 : 0.6 }}>{person.name}</div>
          {sub && <div style={{ fontSize: '12px', color: FLOCK.muted, marginTop: '2px' }}>{sub}</div>}
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', color: badge.fg, background: badge.bg, whiteSpace: 'nowrap' }}>
          {badge.label}
        </span>
        {expanded ? <ChevronDown size={16} color={FLOCK.muted} /> : <ChevronRight size={16} color={FLOCK.muted} />}
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px', display: 'grid', gap: '14px' }}>
          {/* Contact details */}
          {editing ? (
            <EditPersonForm
              person={person}
              onCancel={() => setEditing(false)}
              onSaved={(patch) => {
                onPatched(person.id, patch)
                setEditing(false)
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', paddingTop: '4px', fontSize: '13px', fontFamily: FLOCK.fontBody }}>
              {person.phone ? (
                <a href={`tel:${person.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: FLOCK.purple, fontWeight: 600, textDecoration: 'none', fontFamily: FLOCK.fontMono }}>
                  <Phone size={13} />
                  {person.phone}
                </a>
              ) : (
                <span style={{ color: FLOCK.muted }}>No phone on file</span>
              )}
              {person.email && (
                <a href={`mailto:${person.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: FLOCK.purple, fontWeight: 600, textDecoration: 'none' }}>
                  <Mail size={13} />
                  {person.email}
                </a>
              )}
              <button type="button" onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: FLOCK.muted, fontSize: '12px', fontWeight: 600, fontFamily: FLOCK.fontBody, padding: 0 }}>
                <Pencil size={12} />
                Edit details
              </button>
            </div>
          )}

          {/* Quick actions */}
          <div className="flock-person-detail-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '4px' }}>
            <button type="button" onClick={() => onLogCall(person)} style={btnPrimary({ padding: '9px 14px' })}>
              <Sparkles size={14} />
              Log a call
            </button>
            <div className="flock-cadence-row" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: FLOCK.muted }}>Call every</span>
              <input
                type="number"
                min="1"
                max="365"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                style={{ ...inputStyle, width: '64px', padding: '7px 9px', fontFamily: FLOCK.fontMono, fontSize: '13px' }}
              />
              <span style={{ fontSize: '12px', color: FLOCK.muted }}>days</span>
              <button type="button" onClick={saveCadence} disabled={savingCad} style={btnGhost({ padding: '7px 12px', opacity: savingCad ? 0.6 : 1 })}>
                {savingCad ? '…' : 'Save'}
              </button>
              {cadStatus === 'ok' && <Check size={15} color={FLOCK.green} />}
              {cadStatus === 'err' && <X size={15} color={FLOCK.red} />}
              <button
                type="button"
                onClick={toggleActive}
                disabled={toggling}
                aria-pressed={active}
                title={active ? 'Pause reminders for this person' : 'Resume reminders'}
                style={{ width: '40px', height: '22px', borderRadius: '999px', border: 'none', cursor: toggling ? 'wait' : 'pointer', background: active ? FLOCK.purple : FLOCK.borderStrong, position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}
              >
                <span style={{ position: 'absolute', top: '2px', left: active ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#FFFFFF', transition: 'left 0.15s' }} />
              </button>
            </div>
          </div>

          {/* History */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: FLOCK.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Past notes</span>
            <button type="button" onClick={loadHistory} disabled={loadingHistory} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: FLOCK.muted, background: 'none', border: 'none', cursor: loadingHistory ? 'wait' : 'pointer', fontFamily: FLOCK.fontBody }}>
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
          {loadingHistory && <div style={{ fontSize: '13px', color: FLOCK.muted }}>Loading history…</div>}
          {historyError && <div style={{ fontSize: '13px', color: FLOCK.red }}>{historyError}</div>}
          {!loadingHistory && !historyError && interactions && interactions.length === 0 && (
            <div style={{ fontSize: '13px', color: FLOCK.muted }}>No call history yet — log your first call above.</div>
          )}
          {!loadingHistory && !historyError && interactions && interactions.map((i, idx) => (
            <InteractionCard
              key={i.id || idx}
              i={i}
              onUpdated={(id, patch) => setInteractions((list) => (list || []).map((x) => (x.id === id ? { ...x, ...patch } : x)))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FlockPeoplePanel({ preselectId = null, startAdding = false, onLogCall }) {
  const { user } = useAuth()
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [bucketFilter, setBucketFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(preselectId)
  const [showAdd, setShowAdd] = useState(startAdding)
  const [noteResults, setNoteResults] = useState(null)
  const [toast, setToast] = useState(null)

  const flashToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2600)
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await callFlockAPI('people')
      setPeople(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e.message || 'Could not load contacts.')
    } finally {
      setLoading(false)
    }
  }

  // Refetch (and drop the previous user's cached rows) whenever the signed-in
  // account changes — without this, switching accounts in the same tab without
  // a hard refresh left the prior pastor's contacts on screen.
  useEffect(() => {
    setPeople([])
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (preselectId) setExpandedId(preselectId)
  }, [preselectId])

  // Search call notes too (debounced) — one search box covers names and notes.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setNoteResults(null)
      return
    }
    const t = setTimeout(async () => {
      try {
        const data = await callFlockAPI('searchInteractions', { query: q })
        setNoteResults(data && data.results ? data.results : [])
      } catch {
        setNoteResults([])
      }
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  const onPatched = (id, patch) => {
    setPeople((cur) => cur.map((p) => (String(p.id) === String(id) ? { ...p, ...patch } : p)))
  }

  const onAdded = (name, personId) => {
    setShowAdd(false)
    flashToast(`${name} added to your flock`)
    load().then(() => {
      if (personId) setExpandedId(personId)
    })
  }

  const bucketCounts = useMemo(() => {
    const counts = { all: people.length, overdue: 0, today: 0, onTrack: 0, noCalls: 0, paused: 0 }
    for (const p of people) counts[dueBucket(p)] += 1
    return counts
  }, [people])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => {
      if (bucketFilter !== 'all' && dueBucket(p) !== bucketFilter) return false
      if (q && !String(p.name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [people, query, bucketFilter])

  return (
    <div style={{ display: 'grid', gap: '16px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>People</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: FLOCK.muted, fontFamily: FLOCK.fontBody }}>
            Everyone you shepherd — call history, cadence, and search in one place.
          </p>
        </div>
        {!showAdd && (
          <button type="button" onClick={() => setShowAdd(true)} style={btnPrimary()}>
            <UserPlus size={15} />
            Add person
          </button>
        )}
      </div>

      {showAdd && <AddPersonForm onAdded={onAdded} onCancel={() => setShowAdd(false)} />}

      <div style={{ position: 'relative' }}>
        <Search size={15} color={FLOCK.muted} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people and call notes…"
          autoComplete="off"
          style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: '12px', border: `1px solid ${FLOCK.border}`, background: FLOCK.card, fontSize: '14px', color: FLOCK.text, fontFamily: FLOCK.fontBody, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {people.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'overdue', label: DUE_BUCKETS.overdue.label },
            { key: 'today', label: DUE_BUCKETS.today.label },
            { key: 'onTrack', label: DUE_BUCKETS.onTrack.label },
            { key: 'noCalls', label: DUE_BUCKETS.noCalls.label },
            { key: 'paused', label: DUE_BUCKETS.paused.label },
          ].filter((b) => b.key === 'all' || bucketCounts[b.key] > 0).map((b) => {
            const active = bucketFilter === b.key
            const tone = b.key === 'all' ? { fg: FLOCK.text, bg: FLOCK.surface } : DUE_BUCKETS[b.key]
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setBucketFilter(b.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  border: `1px solid ${active ? tone.fg : FLOCK.border}`,
                  background: active ? tone.bg : FLOCK.card,
                  color: active ? tone.fg : FLOCK.muted,
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: FLOCK.fontBody,
                  whiteSpace: 'nowrap',
                }}
              >
                {b.label}
                <span style={{ opacity: 0.75 }}>{bucketCounts[b.key]}</span>
              </button>
            )
          })}
        </div>
      )}

      {error && <div style={{ fontSize: '13px', color: FLOCK.red }}>{error}</div>}

      {loading ? (
        <div style={{ ...flockCard({ padding: '28px' }), textAlign: 'center', color: FLOCK.muted, fontSize: '13px', fontFamily: FLOCK.fontBody }}>Loading your people…</div>
      ) : people.length === 0 && !showAdd ? (
        <div style={{ ...flockCard({ padding: '40px 28px' }), textAlign: 'center', fontFamily: FLOCK.fontBody }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: FLOCK.purpleTint, color: FLOCK.purple, display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
            <Users size={24} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Your flock is empty</div>
          <p style={{ margin: '6px auto 18px', fontSize: '13px', color: FLOCK.muted, maxWidth: '340px' }}>Add the people you shepherd and this page becomes your one-stop view of everyone's call history and cadence.</p>
          <button type="button" onClick={() => setShowAdd(true)} style={btnPrimary({ margin: '0 auto' })}>
            <UserPlus size={15} />
            Add your first person
          </button>
        </div>
      ) : (
        <>
          {filtered.length === 0 && (query.trim() || bucketFilter !== 'all') && (
            <div style={{ fontSize: '13px', color: FLOCK.muted, fontFamily: FLOCK.fontBody }}>
              {query.trim() ? `No people named "${query.trim()}"` : `No one in "${DUE_BUCKETS[bucketFilter]?.label ?? bucketFilter}"`}
              {query.trim() && bucketFilter !== 'all' ? ` in "${DUE_BUCKETS[bucketFilter]?.label ?? bucketFilter}"` : ''}.
            </div>
          )}
          <div style={{ display: 'grid', gap: '10px' }}>
            {filtered.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                expanded={expandedId === person.id}
                onToggle={() => setExpandedId(expandedId === person.id ? null : person.id)}
                onLogCall={onLogCall}
                onPatched={onPatched}
              />
            ))}
          </div>

          {noteResults && noteResults.length > 0 && (
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: FLOCK.muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: FLOCK.fontBody }}>
                In call notes ({noteResults.length})
              </div>
              {noteResults.map((r, idx) => {
                const tone = interactionTone(r)
                return (
                  <button
                    key={r.interactionId || idx}
                    type="button"
                    onClick={() => {
                      if (r.personId) setExpandedId(r.personId)
                      setQuery('')
                    }}
                    style={{ ...flockCard({ padding: '13px 15px' }), textAlign: 'left', cursor: 'pointer', display: 'grid', gap: '7px', fontFamily: FLOCK.fontBody }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: FLOCK.text }}>{r.personName || 'Unknown'}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: FLOCK.fontMono, fontSize: '11px', color: FLOCK.muted }}>{r.timestamp}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', color: tone.fg, background: tone.bg }}>
                          {r.result || r.outcome || 'Attempt'}
                        </span>
                      </span>
                    </div>
                    {r.summary && (
                      <div style={{ fontSize: '13px', lineHeight: 1.5, color: FLOCK.text }}>
                        <Highlighted text={r.summary} q={query} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {toast && (
        <div style={{ position: 'sticky', bottom: '16px', justifySelf: 'center', background: FLOCK.text, color: '#FFFFFF', padding: '10px 18px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, boxShadow: '0 8px 24px rgba(30,22,51,0.25)', fontFamily: FLOCK.fontBody }}>
          {toast}
        </div>
      )}
    </div>
  )
}
