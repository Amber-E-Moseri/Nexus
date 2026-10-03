import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import { REGISTRATION_LINK_SOURCE_TYPES } from '../../lib/reconciliation.js'
import { ClipboardCheck, Link2 } from 'lucide-react'
import { Card, EditButton } from './tabUi.jsx'
import Badge from '../../../../components/ui/Badge.jsx'
import { useAuth } from '../../../../hooks/useAuth'
import { useUpdateProfile } from '../../hooks/useICPLCProfile.js'
import { registrationState, REGISTRATION_STATE_LABELS } from '../../lib/documentationRules.js'

const REGISTRATION_STATE_NOTES = {
  registered: null,
  registration_missing: 'Registration was started but is not complete. It still needs to be completed.',
  not_registered: 'Registration has not been started. It needs to be started.',
}
const PARTICIPATION_OPTIONS = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']

export default function RegistrationTab({ participant, canWrite }) {
  const { profile: authProfile } = useAuth()
  const updateProfile = useUpdateProfile()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    participation_status: participant.participation_status,
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

  const registrationSource = participant.source_values?.registration_source
  const registrationStatusSource = participant.source_values?.registration_status

  async function handleSave() {
    if (form.participation_status === participant.participation_status) { setEditing(false); return }
    await updateProfile.mutateAsync({
      id: participant.id,
      fields: { participation_status: form.participation_status },
      setOverride: false,
      userId: authProfile?.id,
    })
    setEditing(false)
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

function Field({ label, staffManaged, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        {staffManaged && (
          <span style={{ fontSize: 10, background: 'var(--surface-2)', borderRadius: 4, padding: '1px 5px', color: 'var(--text-secondary)' }}>
            Staff-managed
          </span>
        )}
      </div>
      {children}
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
