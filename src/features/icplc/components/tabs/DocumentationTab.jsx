import React, { useState } from 'react'
import { useUpdateProfile } from '../../hooks/useICPLCProfile.js'
import Badge from '../../../../components/ui/Badge.jsx'

const PASSPORT_READINESS_OPTIONS = [
  'unknown', 'ready', 'renewal_needed', 'renewal_in_progress',
  'no_passport', 'unsure', 'issue',
]
const VISA_REQUIREMENT_OPTIONS = ['review', 'required', 'not_required']
const VISA_PROCESS_OPTIONS = [
  'not_started', 'in_progress', 'submitted', 'processing',
  'approved', 'issue', 'not_applicable',
]

const PASSPORT_TONES = {
  ready: 'done',
  renewal_needed: 'at_risk',
  renewal_in_progress: 'in_progress',
  no_passport: 'blocked',
  unsure: 'warn',
  issue: 'blocked',
  unknown: 'mute',
}

const VISA_PROCESS_TONES = {
  not_started: 'mute',
  in_progress: 'in_progress',
  submitted: 'in_progress',
  processing: 'in_progress',
  approved: 'done',
  issue: 'blocked',
  not_applicable: 'mute',
}

export default function DocumentationTab({ participant, canWrite }) {
  const updateProfile = useUpdateProfile()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    canada_residency_status: participant.canada_residency_status || '',
    passport_country: participant.passport_country || '',
    passport_readiness: participant.passport_readiness,
    visa_requirement: participant.visa_requirement,
    visa_process_status: participant.visa_process_status,
  })

  async function handleSave() {
    const changed = {}
    for (const key of Object.keys(form)) {
      const val = form[key] || null
      const cur = participant[key] || null
      if (val !== cur) changed[key] = val || undefined
    }
    if (Object.keys(changed).length === 0) { setEditing(false); return }
    await updateProfile.mutateAsync({ id: participant.id, fields: changed })
    setEditing(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Staff-managed fields */}
      <section>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Documentation — Staff Managed
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Canada Residency Status</label>
            {editing && canWrite ? (
              <input
                value={form.canada_residency_status}
                onChange={(e) => setForm((f) => ({ ...f, canada_residency_status: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. Permanent Resident"
              />
            ) : (
              <div style={{ fontSize: 13 }}>{participant.canada_residency_status || '—'}</div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Passport Country</label>
            {editing && canWrite ? (
              <input
                value={form.passport_country}
                onChange={(e) => setForm((f) => ({ ...f, passport_country: e.target.value }))}
                style={inputStyle}
                placeholder="e.g. Nigeria"
              />
            ) : (
              <div style={{ fontSize: 13 }}>{participant.passport_country || '—'}</div>
            )}
          </div>
        </div>
      </section>

      {/* Passport readiness */}
      <section>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Passport
        </h4>
        <div>
          <label style={labelStyle}>Passport Readiness</label>
          {editing && canWrite ? (
            <select
              value={form.passport_readiness}
              onChange={(e) => setForm((f) => ({ ...f, passport_readiness: e.target.value }))}
              style={selectStyle}
            >
              {PASSPORT_READINESS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <Badge
              tone={PASSPORT_TONES[participant.passport_readiness] || 'mute'}
              label={participant.passport_readiness}
            />
          )}
        </div>
      </section>

      {/* Visa */}
      <section>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Visa
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Visa Requirement</label>
            {editing && canWrite ? (
              <select
                value={form.visa_requirement}
                onChange={(e) => setForm((f) => ({ ...f, visa_requirement: e.target.value }))}
                style={selectStyle}
              >
                {VISA_REQUIREMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: 13 }}>{participant.visa_requirement}</span>
            )}
          </div>
          <div>
            <label style={labelStyle}>Visa Process Status</label>
            {editing && canWrite ? (
              <select
                value={form.visa_process_status}
                onChange={(e) => setForm((f) => ({ ...f, visa_process_status: e.target.value }))}
                style={selectStyle}
              >
                {VISA_PROCESS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <Badge
                tone={VISA_PROCESS_TONES[participant.visa_process_status] || 'mute'}
                label={participant.visa_process_status}
              />
            )}
          </div>
        </div>
      </section>

      {canWrite && (
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateProfile.isPending}
                style={primaryBtn}
              >
                {updateProfile.isPending ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} style={ghostBtn}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={primaryBtn}>Edit</button>
          )}
        </div>
      )}
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }
const inputStyle = {
  padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4,
  fontSize: 13, width: '100%', boxSizing: 'border-box',
}
const selectStyle = {
  padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4,
  fontSize: 13, background: 'white', width: '100%',
}
const primaryBtn = {
  padding: '6px 14px', background: 'var(--accent)', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const ghostBtn = {
  padding: '6px 14px', background: 'transparent', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
