import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import { REGISTRATION_LINK_SOURCE_TYPES } from '../../lib/reconciliation.js'
import { ClipboardCheck, Link2 } from 'lucide-react'
import { Card, EditButton } from './tabUi.jsx'
import Badge from '../../../../components/ui/Badge.jsx'
import { useAuth } from '../../../../hooks/useAuth'
import { useUpdateProfile, useClearFieldOverride } from '../../hooks/useICPLCProfile.js'
import { getOverrideMeta } from '../../lib/fieldAuthority.js'
import { registrationState, REGISTRATION_STATE_LABELS } from '../../lib/documentationRules.js'

// The stored value has four raw values, but only three states are ever shown: an empty / `unknown` value carries no
// sign of registration activity, so it reads as Not Registered. `issue` means registration was started but is not complete.
const REGISTRATION_OPTIONS = [
  ['not_registered', 'Not registered'],
  ['issue', 'Registration missing (started, not complete)'],
  ['registered', 'Registered'],
]
const storedRegistrationLabel = (v) => (v === 'registered' ? 'Registered' : v === 'issue' ? 'Registration missing' : 'Not registered')
const REGISTRATION_STATE_NOTES = {
  registered: null,
  registration_missing: 'Registration was started but is not complete. It still needs to be completed.',
  not_registered: 'Registration has not been started. It needs to be started.',
}
const PARTICIPATION_OPTIONS = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']

export default function RegistrationTab({ participant, canWrite }) {
  const { profile: authProfile } = useAuth()
  const updateProfile = useUpdateProfile()
  const clearOverride = useClearFieldOverride()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    participation_status: participant.participation_status,
    registration_status: participant.registration_status,
  })
  const { data: linkedMaps = [] } = useQuery({
    queryKey: ['icplc_participant_registration_links', participant.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_identity_maps')
        .select('source_key')
        .eq('participant_id', participant.id)
        .in('source_type', REGISTRATION_LINK_SOURCE_TYPES)
      if (error) throw error
      return data || []
    },
    staleTime: 30_000,
  })
  const isLinked = linkedMaps.length > 0
  const regState = registrationState({ ...participant, registration_link_status: isLinked ? 'registered' : 'not_registered' })

  const registrationOverride = getOverrideMeta(participant, 'registration_status')
  const registrationSource = participant.source_values?.registration_source
  const registrationStatusSource = participant.source_values?.registration_status

  async function handleSave() {
    const changed = {}
    if (form.participation_status !== participant.participation_status)
      changed.participation_status = form.participation_status
    if (form.registration_status !== participant.registration_status)
      changed.registration_status = form.registration_status

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Participation — staff-managed, never from import */}
      <Card icon={ClipboardCheck} title="Participation & Status" action={canWrite && !editing ? <EditButton onClick={() => setEditing(true)} /> : null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Field label="Participation Status" staffManaged>
        {editing && canWrite ? (
          <select
            aria-label="Participation status"
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
      </div>
      </Card>

      {/* Registration link — derived from the identity map, never from participation */}
      <Card icon={Link2} title="Registration">
      <div>
        <Badge tone={regState === 'registered' ? 'done' : 'blocked'} label={REGISTRATION_STATE_LABELS[regState]} />
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          {isLinked
            ? `Linked to ${linkedMaps.length} registration${linkedMaps.length === 1 ? '' : 's'}. Linking never changes participation status.`
            : REGISTRATION_STATE_NOTES[regState]}
        </div>
      </div>
      <div className="icplc-field-grid" style={{ marginTop: 14 }}>
        <Info label="Registration Source" value={registrationStatusSource?.source || registrationSource?.source || 'None linked'} />
        <Info label="Received" value={formatDate(registrationSource?.submitted_at || registrationStatusSource?.observed_at)} />
        <Info label="Source Identifier" value={registrationSource?.registration_id || registrationStatusSource?.registration_id || '-'} />
        <Info label="Source Email" value={registrationSource?.email || '-'} />
      </div>
      <div style={{ marginTop: 14 }}>

      <Field
        label="Recorded registration status"
        sourceValue={participant.source_values?.registration_status}
        override={registrationOverride}
        onResumeSync={canWrite ? () => handleResumeSync('registration_status') : null}
      >
        {editing && canWrite ? (
          <select
            aria-label="Registration status"
            value={form.registration_status === 'unknown' ? 'not_registered' : form.registration_status}
            onChange={(e) => setForm((f) => ({ ...f, registration_status: e.target.value }))}
            style={selectStyle}
          >
            {REGISTRATION_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 13 }}>{storedRegistrationLabel(participant.registration_status)}</span>
        )}
      </Field>
      </div>
      </Card>

      {canWrite && editing && (
        <div className="icplc-actions">
          <button type="button" onClick={handleSave} disabled={updateProfile.isPending} className="icplc-btn icplc-btn-primary">
            {updateProfile.isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="icplc-btn">Cancel</button>
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
              type="button"
              onClick={onResumeSync}
              className="icplc-btn"
              style={{ marginTop: 6, border: 'none', color: 'var(--accent)', padding: 0, minHeight: 32, justifyContent: 'flex-start' }}
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
    <div style={{ background: '#F7F8FA', borderRadius: 8, padding: 10 }}>
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
