import React, { useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useICPLC } from '../ICPLCContext.jsx'
import { useCreateParticipant, useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import ParticipantTable from '../components/ParticipantTable.jsx'
import ParticipantFilters from '../components/ParticipantFilters.jsx'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { deriveReadiness } from '../lib/readinessEngine.js'
import {
  REGISTRATION_SOURCE_TYPE,
  filterParticipantsByWorkingListView,
  registrationLinkedParticipantIds,
} from '../lib/reconciliation.js'

export default function PeoplePage({ canWrite }) {
  const { config, filters, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const eventId = config?.id
  const [showAdd, setShowAdd] = useState(false)

  const { data: participants, isLoading, error } = useICPLCParticipants(eventId, {
    search: filters.search,
    participation_status: filters.participation_status,
    passport_readiness: filters.passport_readiness,
    visa_requirement: filters.visa_requirement,
    visa_process_status: filters.visa_process_status,
    subgroup: filters.subgroup,
  })
  const { data: registrations = [], isLoading: registrationsLoading } = useQuery({
    queryKey: ['icplc_working_list_registrations', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error: registrationsError } = await supabase
        .from('registrations')
        .select('id, event_config_id, submitted_at, status, registration_status')
        .eq('event_config_id', eventId)
      if (registrationsError) throw registrationsError
      return data || []
    },
  })
  const { data: registrationMaps = [], isLoading: mapsLoading } = useQuery({
    queryKey: ['icplc_working_list_registration_maps', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error: mapsError } = await supabase
        .from('icplc_identity_maps')
        .select('source_type, source_key, participant_id')
        .eq('event_id', eventId)
        .eq('source_type', REGISTRATION_SOURCE_TYPE)
      if (mapsError) throw mapsError
      return data || []
    },
  })

  const participantsWithRegistrationCoverage = useMemo(() => {
    const linkedParticipantIds = registrationLinkedParticipantIds(registrations, registrationMaps, eventId)
    return (participants || []).map((participant) => ({
      ...participant,
      registration_link_status: linkedParticipantIds.has(participant.id) ? 'registered' : 'not_registered',
    }))
  }, [eventId, participants, registrationMaps, registrations])

  const displayedParticipants = useMemo(() => (
    filterParticipantsByWorkingListView(
      participantsWithRegistrationCoverage,
      registrations,
      registrationMaps,
      eventId,
      filters.working_list_view || 'all',
      (participant) => deriveReadiness(participant).readiness,
    )
  ), [eventId, filters.working_list_view, participantsWithRegistrationCoverage, registrationMaps, registrations])
  const loading = isLoading || registrationsLoading || mapsLoading

  return (
    <div>
      {canWrite && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={() => setShowAdd(true)} style={primaryBtn}><UserPlus size={14} /> Add Person</button>
        </div>
      )}

      {/* Search bar */}
      <div style={{ marginBottom: 12 }}>
        <SearchBar />
      </div>

      {/* Filters */}
      <ParticipantFilters />

      {/* Count */}
      {!loading && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {displayedParticipants.length} participant{displayedParticipants.length !== 1 ? 's' : ''}
        </div>
      )}

      {error && (
        <div style={{ padding: 20, color: 'var(--text-secondary)' }}>
          Failed to load participants.
        </div>
      )}

      <ParticipantTable participants={displayedParticipants} loading={loading} />

      {/* Canonical profile drawer */}
      {activeProfileId && (
        <ParticipantProfileDrawer
          participantId={activeProfileId}
          initialTab={activeProfileTab}
          onClose={closeProfile}
          canWrite={canWrite}
        />
      )}

      {showAdd && (
        <AddPersonModal
          eventId={eventId}
          onClose={() => setShowAdd(false)}
          onCreated={(participant) => {
            setShowAdd(false)
            openProfile(participant.id)
          }}
        />
      )}
    </div>
  )
}

function SearchBar() {
  const { filters, setFilters } = useICPLC()
  return (
    <input
      type="search"
      placeholder="Search by name or email…"
      value={filters.search}
      onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
      style={{
        padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6,
        fontSize: 13, width: 280, outline: 'none',
      }}
    />
  )
}

function AddPersonModal({ eventId, onClose, onCreated }) {
  const createParticipant = useCreateParticipant(eventId)
  const [form, setForm] = useState({ full_name: '', email: '', region: '', subgroup: '' })
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function submit() {
    if (!form.full_name.trim()) return
    const participant = await createParticipant.mutateAsync({
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      region: form.region.trim() || null,
      subgroup: form.subgroup.trim() || null,
      registration_status: 'not_registered',
      source_values: {
        created_from: {
          source: 'nexus_manual',
          observed_at: new Date().toISOString(),
        },
      },
    })
    onCreated(participant)
  }

  return (
    <div style={modalOverlay}>
      <div style={modalCard}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Add ICPLC Person</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <Field label="Full name" value={form.full_name} onChange={set('full_name')} autoFocus />
          <Field label="Email" value={form.email} onChange={set('email')} />
          <Field label="Region" value={form.region} onChange={set('region')} />
          <Field label="Subgroup" value={form.subgroup} onChange={set('subgroup')} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={ghostButtonStyle}>Cancel</button>
          <button onClick={submit} disabled={!form.full_name.trim() || createParticipant.isPending} style={primaryButtonStyle}>
            {createParticipant.isPending ? 'Saving...' : 'Create participant'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, autoFocus }) {
  return (
    <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
      {label}
      <input value={value} onChange={onChange} autoFocus={autoFocus} style={{ ...inputStyle, marginTop: 4 }} />
    </label>
  )
}

const primaryBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  border: 'none',
  borderRadius: 6,
  background: 'var(--accent)',
  color: 'white',
  cursor: 'pointer',
  fontSize: 13,
}
const ghostBtn = { ...primaryBtn, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)' }
const modalOverlay = { position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 20 }
const modalCard = { width: 'min(520px, 96vw)', background: 'var(--surface-1)', borderRadius: 8, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflow: 'auto' }
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }
const primaryButtonStyle = { padding: '7px 14px', border: 'none', borderRadius: 6, background: 'var(--accent)', color: 'white', cursor: 'pointer', fontSize: 13 }
const ghostButtonStyle = { padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }
const thStyleSmall = { padding: '8px 10px', textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }
const tdStyleSmall = { padding: '9px 10px', borderBottom: '1px solid var(--border)', fontSize: 13 }
