import React, { useState } from 'react'
import { useAuth } from '../../../../hooks/useAuth'
import { useUpdateProfile, useClearFieldOverride } from '../../hooks/useICPLCProfile.js'
import { getOverrideMeta } from '../../lib/fieldAuthority.js'

const REGISTRATION_OPTIONS = ['unknown', 'not_registered', 'registered', 'issue']
const PARTICIPATION_OPTIONS = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']

export default function RegistrationTab({ participant, canWrite }) {
  const { profile: authProfile } = useAuth()
  const updateProfile = useUpdateProfile()
  const clearOverride = useClearFieldOverride()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    participation_status: participant.participation_status,
    registration_status: participant.registration_status,
    notes: participant.notes || '',
  })

  const registrationOverride = getOverrideMeta(participant, 'registration_status')
  const registrationSource = participant.source_values?.registration_source
  const registrationStatusSource = participant.source_values?.registration_status

  async function handleSave() {
    const changed = {}
    if (form.participation_status !== participant.participation_status)
      changed.participation_status = form.participation_status
    if (form.registration_status !== participant.registration_status)
      changed.registration_status = form.registration_status
    if (form.notes !== (participant.notes || ''))
      changed.notes = form.notes

    if (Object.keys(changed).length === 0) { setEditing(false); return }

    // If registration_status changed manually, set an override
    const setOverride = 'registration_status' in changed
    await updateProfile.mutateAsync({
      id: participant.id,
      fields: changed,
      setOverride,
      overrideField: setOverride ? 'registration_status' : undefined,
      userId: authProfile?.id,
    })
    setEditing(false)
  }

  async function handleResumeSync(field) {
    await clearOverride.mutateAsync({ id: participant.id, field })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Participation — staff-managed, never from import */}
      <Field label="Participation Status" staffManaged>
        {editing && canWrite ? (
          <select
            value={form.participation_status}
            onChange={(e) => setForm((f) => ({ ...f, participation_status: e.target.value }))}
            style={selectStyle}
          >
            {PARTICIPATION_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 13 }}>{participant.participation_status}</span>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          Staff-managed — never modified by imports
        </div>
      </Field>

      {/* Registration status — source-backed with override */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Info label="Registration Source" value={registrationStatusSource?.source || registrationSource?.source || 'None linked'} />
        <Info label="Received" value={formatDate(registrationSource?.submitted_at || registrationStatusSource?.observed_at)} />
        <Info label="Source Identifier" value={registrationSource?.registration_id || registrationStatusSource?.registration_id || '-'} />
        <Info label="Source Email" value={registrationSource?.email || '-'} />
      </div>

      <Field
        label="Registration Status"
        sourceValue={participant.source_values?.registration_status}
        override={registrationOverride}
        onResumeSync={canWrite ? () => handleResumeSync('registration_status') : null}
      >
        {editing && canWrite ? (
          <select
            value={form.registration_status}
            onChange={(e) => setForm((f) => ({ ...f, registration_status: e.target.value }))}
            style={selectStyle}
          >
            {REGISTRATION_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 13 }}>{participant.registration_status}</span>
        )}
      </Field>

      {/* Notes */}
      <Field label="Notes">
        {editing && canWrite ? (
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {participant.notes || <span style={{ color: 'var(--text-secondary)' }}>—</span>}
          </p>
        )}
      </Field>

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

function Field({ label, staffManaged, sourceValue, override, onResumeSync, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        {staffManaged && (
          <span style={{ fontSize: 10, background: 'var(--surface-2)', borderRadius: 4, padding: '1px 5px', color: 'var(--text-secondary)' }}>
            Staff-managed
          </span>
        )}
        {override && (
          <span style={{ fontSize: 10, background: '#FFF3CD', borderRadius: 4, padding: '1px 5px', color: '#856404' }}>
            Override active
          </span>
        )}
      </div>
      {children}
      {/* Source disagreement panel */}
      {sourceValue && override && (
        <div style={{
          marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)',
          borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
        }}>
          <div>Source value: <strong>{sourceValue.value}</strong> (from {sourceValue.source}, {new Date(sourceValue.observed_at).toLocaleDateString()})</div>
          <div style={{ marginTop: 2 }}>Staff override by {override.by?.slice(0, 8)} on {new Date(override.at).toLocaleDateString()}</div>
          {onResumeSync && (
            <button
              onClick={onResumeSync}
              style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}
            >
              Resume source sync →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value || '-'}</div>
    </div>
  )
}

function formatDate(value) {
  if (!value) return '-'
  try { return new Date(value).toLocaleDateString() } catch { return value }
}

const selectStyle = {
  padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4,
  fontSize: 13, background: 'white', width: '100%',
}
const inputStyle = {
  padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 4,
  fontSize: 13, width: '100%', boxSizing: 'border-box',
}
const primaryBtn = {
  padding: '6px 14px', background: 'var(--accent)', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const ghostBtn = {
  padding: '6px 14px', background: 'transparent', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
