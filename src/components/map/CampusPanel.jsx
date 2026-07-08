import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { STATUS, STATUS_ORDER, NEEDS_PLAN_COLOR } from './data/status'
import { PrayerRequestsTab } from './tabs/PrayerRequestsTab'
import { PrayerActivityTab } from './tabs/PrayerActivityTab'
import { PrayerTimer } from './PrayerTimer'

const EDITABLE_FIELDS = [
  'status', 'contact_name', 'contact_phone', 'notes', 'strategy',
  'prayer_notes', 'coverage_plan', 'custom_photo',
]

const TABS = [
  { id: 'info', label: 'Info' },
  { id: 'notes', label: 'Notes' },
  { id: 'prayer', label: '🙏 Prayer' },
  { id: 'edit', label: 'Edit' },
]

export function CampusPanel({ campus, canEdit, onClose, onSaved }) {
  const [tab, setTab] = useState('info')
  const [form, setForm] = useState(() => initForm(campus))
  const [points, setPoints] = useState(campus.prayer_points || [])
  const [pointInput, setPointInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const [requests, setRequests] = useState([])
  const [logs, setLogs] = useState([])

  // Reset local state when the selected campus changes.
  useEffect(() => {
    setForm(initForm(campus))
    setPoints(campus.prayer_points || [])
    setTab('info')
    setFeedback(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus.id])

  // Load community prayer data for this campus.
  useEffect(() => {
    let active = true
    const load = async () => {
      const [{ data: reqs }, { data: lg }] = await Promise.all([
        supabase
          .from('prayer_requests')
          .select('id, title, description, created_at, resolved_at, user_id')
          .eq('campus_id', campus.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('prayer_logs')
          .select('id, duration_seconds, logged_at, user_id')
          .eq('campus_id', campus.id)
          .order('logged_at', { ascending: false })
          .limit(50),
      ])
      if (!active) return
      setRequests(reqs || [])
      setLogs(lg || [])
    }
    load()
    return () => { active = false }
  }, [campus.id])

  const st = STATUS[campus.status] || {}
  const sub = [campus.province, campus.group, campus.subgroup].filter(Boolean).join(' · ')

  const addPoint = () => {
    const v = pointInput.trim()
    if (!v) return
    setPoints((p) => [...p, v])
    setPointInput('')
  }
  const removePoint = (i) => setPoints((p) => p.filter((_, idx) => idx !== i))

  const save = async () => {
    setSaving(true)
    setFeedback(null)
    const patch = { prayer_points: points }
    EDITABLE_FIELDS.forEach((f) => { patch[f] = form[f] })
    const { error } = await supabase.from('campuses').update(patch).eq('id', campus.id)
    setSaving(false)
    if (error) {
      setFeedback({ ok: false, msg: '⚠ ' + error.message })
    } else {
      setFeedback({ ok: true, msg: '✓ Saved' })
      onSaved?.(patch)
      setTimeout(() => setFeedback(null), 3000)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="blwp-panel-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="blwp-p-inst">{campus.institution}</div>
          <div className="blwp-p-campus">{campus.campus || 'Main Campus'}</div>
          {sub && <div className="blwp-p-meta">{sub}</div>}
        </div>
        <button className="blw-panel-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {/* Badges */}
      <div className="blwp-badges">
        <span className="blwp-badge" style={{ background: `${st.color || '#888'}20`, color: st.color || '#888' }}>
          {st.emoji || '•'} {campus.status}
        </span>
        {campus.needs_plan && (
          <span className="blwp-badge" style={{ background: `${NEEDS_PLAN_COLOR}20`, color: NEEDS_PLAN_COLOR }}>🔷 Needs Plan</span>
        )}
        {campus.subgroup && <span className="blwp-badge" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>📂 {campus.subgroup}</span>}
      </div>

      {/* Tabs */}
      <div className="blwp-tabs">
        {TABS.filter((t) => t.id !== 'edit' || canEdit).map((t) => (
          <button key={t.id} className={`blwp-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="blw-panel-body">
        {tab === 'info' && <InfoTab campus={campus} />}
        {tab === 'notes' && <NotesTab campus={campus} />}
        {tab === 'prayer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <CampusPrayerContent campus={campus} />
            <div className="blwp-divider" />
            <PrayerTimer campusId={campus.id} campusName={campus.institution} />
            <div className="blwp-divider" />
            <PrayerActivityTab logs={logs} />
            <div className="blwp-divider" />
            <PrayerRequestsTab campusId={campus.id} requests={requests} onRequestsChange={setRequests} />
          </div>
        )}
        {tab === 'edit' && canEdit && (
          <EditTab
            campus={campus}
            form={form}
            setForm={setForm}
            points={points}
            pointInput={pointInput}
            setPointInput={setPointInput}
            addPoint={addPoint}
            removePoint={removePoint}
            saving={saving}
            feedback={feedback}
            onSave={save}
          />
        )}
      </div>
    </>
  )
}

function initForm(campus) {
  return {
    status: campus.status || 'Not Reached',
    contact_name: campus.contact_name || '',
    contact_phone: campus.contact_phone || '',
    notes: campus.notes || '',
    strategy: campus.strategy || '',
    prayer_notes: campus.prayer_notes || '',
    coverage_plan: campus.coverage_plan || '',
    custom_photo: campus.custom_photo || '',
  }
}

function InfoTab({ campus }) {
  const photo = campus.custom_photo || campus.photo_url
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="blwp-infocard">
        <div className="blwp-infocard-row">
          <Field label="Hub" value={campus.nearestHubName || 'No hub assigned'} />
          <Field label="Distance" value={campus.distanceKm != null ? `${campus.distanceKm.toFixed(1)} km` : '—'} />
        </div>
        <div className="blwp-infocard-row">
          <Field label="Province" value={campus.province || '—'} />
          <Field label="Group" value={campus.group || '—'} />
        </div>
        {campus.subgroup && (
          <div className="blwp-infocard-row">
            <Field label="Sub-group" value={campus.subgroup} full />
          </div>
        )}
        {campus.campus_name_alt && (
          <div className="blwp-infocard-row">
            <Field label="Also known as" value={campus.campus_name_alt} full />
          </div>
        )}
      </div>

      {campus.needs_plan && (
        <div className="blwp-needs-warn">⚠ No hub within 25 km — needs a coverage plan</div>
      )}

      {(campus.contact_name || campus.contact_phone) && (
        <>
          <div className="blwp-sec">Contact</div>
          <div className="blwp-infocard">
            {campus.contact_name && <div className="blwp-cic-row">👤 {campus.contact_name}</div>}
            {campus.contact_phone && (
              <div className="blwp-cic-row">
                📞 <a href={`tel:${campus.contact_phone.replace(/\s/g, '')}`} style={{ color: 'var(--purple-700)', textDecoration: 'none' }}>{campus.contact_phone}</a>
              </div>
            )}
          </div>
        </>
      )}

      {photo && (
        <img
          src={photo}
          alt={campus.institution}
          style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 10 }}
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}
    </div>
  )
}

function NotesTab({ campus }) {
  const hasAny = campus.notes || campus.strategy || (campus.coverage_plan && campus.needs_plan)
  if (!hasAny) {
    return <div className="blwp-tab-empty">No notes yet.{'\n'}Go to Edit to add notes.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {campus.notes && (
        <div>
          <div className="blwp-sec">Campus Notes</div>
          <div className="blwp-display-text">{campus.notes}</div>
        </div>
      )}
      {campus.strategy && (
        <div>
          <div className="blwp-sec">Strategy</div>
          <div className="blwp-display-text">{campus.strategy}</div>
        </div>
      )}
      {campus.coverage_plan && campus.needs_plan && (
        <div>
          <div className="blwp-sec">Coverage Plan</div>
          <div className="blwp-display-text">{campus.coverage_plan}</div>
        </div>
      )}
    </div>
  )
}

function CampusPrayerContent({ campus }) {
  const pts = campus.prayer_points || []
  if (!pts.length && !campus.prayer_notes) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {pts.length > 0 && (
        <div>
          <div className="blwp-sec">Prayer Points</div>
          <div className="blwp-pp-list">
            {pts.map((p, i) => <div key={i} className="blwp-pp-item">🙏 {p}</div>)}
          </div>
        </div>
      )}
      {campus.prayer_notes && (
        <div>
          <div className="blwp-sec">Prayer Notes</div>
          <div className="blwp-display-text">{campus.prayer_notes}</div>
        </div>
      )}
    </div>
  )
}

function EditTab({ campus, form, setForm, points, pointInput, setPointInput, addPoint, removePoint, saving, feedback, onSave }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="blwp-fgrp">
        <label>Status</label>
        <select value={form.status} onChange={set('status')}>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].emoji} {s}</option>)}
        </select>
      </div>
      <div className="blwp-divider" />
      <div className="blwp-sec">Contact</div>
      <div className="blwp-two-col">
        <div className="blwp-fgrp"><label>Name</label><input value={form.contact_name} onChange={set('contact_name')} placeholder="Contact name" /></div>
        <div className="blwp-fgrp"><label>Phone</label><input value={form.contact_phone} onChange={set('contact_phone')} placeholder="+1 000 000 0000" /></div>
      </div>
      <div className="blwp-fgrp"><label>Campus Notes</label><textarea value={form.notes} onChange={set('notes')} placeholder="Visit history, open doors, challenges…" /></div>
      <div className="blwp-fgrp"><label>Strategy</label><textarea value={form.strategy} onChange={set('strategy')} placeholder="Outreach plan, timeline, key events…" /></div>
      <div className="blwp-divider" />
      <div className="blwp-sec">Prayer Points</div>
      <div className="blwp-pp-list">
        {points.map((p, i) => (
          <div key={i} className="blwp-pp-item">
            <span style={{ flex: 1 }}>{p}</span>
            <button className="blwp-pp-del" onClick={() => removePoint(i)} title="Remove">×</button>
          </div>
        ))}
      </div>
      <div className="blwp-pp-add">
        <input
          value={pointInput}
          onChange={(e) => setPointInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addPoint() }}
          placeholder="Add a prayer point…"
        />
        <button onClick={addPoint}>+ Add</button>
      </div>
      <div className="blwp-fgrp"><label>Prayer Notes</label><textarea value={form.prayer_notes} onChange={set('prayer_notes')} placeholder="Intercession notes, scriptures, burdens…" /></div>
      {campus.needs_plan && (
        <>
          <div className="blwp-divider" />
          <div className="blwp-sec">Coverage Plan</div>
          <div className="blwp-fgrp"><textarea value={form.coverage_plan} onChange={set('coverage_plan')} placeholder="Curated travel plan…" /></div>
        </>
      )}
      <div className="blwp-fgrp"><label>Custom Photo URL</label><input value={form.custom_photo} onChange={set('custom_photo')} placeholder="https://…" /></div>
      <div className="blwp-divider" />
      <button className="blwp-save-btn" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
      {feedback && <div className="blwp-save-fb" style={{ color: feedback.ok ? '#1e8e3e' : '#f9ab00' }}>{feedback.msg}</div>}
    </div>
  )
}

function Field({ label, value, full }) {
  return (
    <div className="blwp-infocard-item" style={full ? { flex: 'none', width: '100%' } : undefined}>
      <div className="blwp-ic-lbl">{label}</div>
      <div className="blwp-ic-val">{value}</div>
    </div>
  )
}
