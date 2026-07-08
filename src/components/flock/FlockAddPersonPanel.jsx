import { useState } from 'react'
import { AlertCircle, Check, UserPlus } from 'lucide-react'
import { callFlockCRM as callFlockAPI, flockCard, FLOCK } from '../../lib/flockSupabase'

const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: FLOCK.text, marginBottom: '6px', fontFamily: FLOCK.fontBody }
const hintStyle = { fontSize: '12px', color: FLOCK.muted, marginTop: '5px', fontFamily: FLOCK.fontBody }
const fieldInput = {
  width: '100%',
  padding: '11px 14px',
  fontSize: '15px',
  border: `1px solid ${FLOCK.border}`,
  borderRadius: '10px',
  color: FLOCK.text,
  fontFamily: FLOCK.fontBody,
  outline: 'none',
  boxSizing: 'border-box',
}

const BLANK = { name: '', role: '', fellowship: '', priority: '', cadence: '28' }

export default function FlockAddPersonPanel() {
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successName, setSuccessName] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async () => {
    if (saving) return
    const name = form.name.trim()
    if (!name) {
      setError('Full name is required.')
      return
    }
    setSaving(true)
    setError(null)
    const cadence = parseInt(form.cadence, 10) > 0 ? parseInt(form.cadence, 10) : 28
    const payload = JSON.stringify({
      name,
      role: form.role.trim(),
      fellowship: form.fellowship.trim(),
      priority: form.priority.trim(),
      cadenceDays: cadence,
    })
    try {
      const res = await callFlockAPI('addPerson', { payload })
      if (res && res.success) {
        setSuccessName(name)
      } else {
        setError((res && (res.error || res.message)) || 'Save failed — check that the Apps Script is deployed and up to date.')
      }
    } catch (e) {
      setError('Error: ' + String(e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setForm(BLANK)
    setError(null)
    setSuccessName(null)
  }

  if (successName) {
    return (
      <div style={{ ...flockCard({ padding: '40px 28px' }), textAlign: 'center', maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: FLOCK.greenTint, color: FLOCK.green, display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <Check size={28} />
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>{successName} has been added.</div>
        <div style={{ fontSize: '13px', color: FLOCK.muted, marginTop: '6px' }}>Added to your call list.</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '22px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={reset}
            style={{ padding: '11px 18px', background: FLOCK.purple, color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: FLOCK.fontBody }}
          >
            Add another person
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <UserPlus size={20} color={FLOCK.purple} />
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Add Person</h2>
      </div>
      <p style={{ margin: '0 0 18px', fontSize: '13px', color: FLOCK.muted }}>Add a new contact to your call list.</p>

      {error && (
        <div style={{ ...flockCard({ padding: '12px 14px', background: FLOCK.redTint, borderColor: 'transparent' }), color: FLOCK.red, display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', fontSize: '13px', fontFamily: FLOCK.fontBody }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      <div style={flockCard({ padding: '20px', display: 'grid', gap: '18px' })}>
        <div>
          <label style={labelStyle}>
            Full Name <span style={{ color: FLOCK.red }}>*</span>
          </label>
          <input type="text" value={form.name} onChange={set('name')} placeholder="e.g. John Smith" autoFocus style={fieldInput} />
        </div>
        <div>
          <label style={labelStyle}>
            Role <span style={{ fontWeight: 400, color: FLOCK.muted }}>— optional</span>
          </label>
          <input type="text" value={form.role} onChange={set('role')} placeholder="e.g. Coordinator, Cell leader, Manager" style={fieldInput} />
        </div>
        <div>
          <label style={labelStyle}>
            Fellowship <span style={{ fontWeight: 400, color: FLOCK.muted }}>— optional</span>
          </label>
          <input type="text" value={form.fellowship} onChange={set('fellowship')} placeholder="e.g. University of Manitoba" style={fieldInput} />
        </div>
        <div>
          <label style={labelStyle}>
            Priority <span style={{ fontWeight: 400, color: FLOCK.muted }}>— optional</span>
          </label>
          <input type="text" value={form.priority} onChange={set('priority')} placeholder="e.g. High, Medium, Low" style={fieldInput} />
        </div>
        <div>
          <label style={labelStyle}>Call Cadence (days)</label>
          <input type="number" min="1" max="365" value={form.cadence} onChange={set('cadence')} style={{ ...fieldInput, fontFamily: FLOCK.fontMono }} />
          <p style={hintStyle}>How many days between calls. Default is 28.</p>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !form.name.trim()}
          style={{
            padding: '13px 18px',
            background: FLOCK.purple,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving || !form.name.trim() ? 0.6 : 1,
            fontFamily: FLOCK.fontBody,
          }}
        >
          {saving ? 'Saving…' : 'Add to Call List'}
        </button>
      </div>
    </div>
  )
}
