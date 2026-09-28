import React, { useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useICPLC } from '../ICPLCContext.jsx'
import { useCreateParticipant, useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import ParticipantTable from '../components/ParticipantTable.jsx'
import ParticipantFilters from '../components/ParticipantFilters.jsx'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import RegistrationsPage from './RegistrationsPage.jsx'
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
  const [view, setView] = useState('list') // 'list' | 'sources'

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
      {/* Sub-view toggle + primary action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 3 }}>
          {[{ key: 'list', label: 'Working List' }, { key: 'sources', label: 'Registration Sources' }].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 13, cursor: 'pointer',
                background: view === key ? 'var(--surface-1, #fff)' : 'transparent',
                color: view === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: view === key ? 600 : 400,
                boxShadow: view === key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                transition: 'background 0.12s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {canWrite && view === 'list' && (
          <button type="button" onClick={() => setShowAdd(true)} className="icplc-btn icplc-btn-primary">
            <UserPlus size={14} aria-hidden /> Add Participant
          </button>
        )}
      </div>

      {view === 'sources' && <RegistrationsPage canWrite={canWrite} />}

      {view === 'list' && (
        <>
          {/* Search bar */}
          <div style={{ marginBottom: 12 }}>
            <SearchBar />
          </div>

          {/* Filters */}
          <ParticipantFilters />

          {/* Count */}
          {!loading && (
            <div role="status" style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              {displayedParticipants.length} participant{displayedParticipants.length !== 1 ? 's' : ''}
            </div>
          )}

          {error && (
            <div style={{
              border: '1px solid #F3BDB8', borderRadius: 8, padding: '14px 18px',
              background: '#FEF2F2', display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12,
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>⚠</span>
              <div style={{ fontSize: 13, color: '#991B1B' }}>
                Failed to load participants. {error?.message || 'Please refresh the page.'}
              </div>
            </div>
          )}

          <ParticipantTable participants={displayedParticipants} loading={loading} />
        </>
      )}

      {/* Canonical profile drawer (shared across both views) */}
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
      aria-label="Search participants by name or email"
      className="icplc-input icplc-search"
      placeholder="Search by name or email…"
      value={filters.search}
      onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
    />
  )
}

function AddPersonModal({ eventId, onClose, onCreated }) {
  const createParticipant = useCreateParticipant(eventId)
  const [form, setForm] = useState({ full_name: '', email: '', alternate_email: '', region: '', subgroup: '' })
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    if (!form.full_name.trim() || createParticipant.isPending) return

    // Normalize: if primary empty but alternate supplied, promote alternate → primary
    let primary = form.email.trim() || null
    let alternate = form.alternate_email.trim() || null
    if (!primary && alternate) {
      primary = alternate
      alternate = null
    }

    const participant = await createParticipant.mutateAsync({
      full_name: form.full_name.trim(),
      email: primary,
      alternate_email: alternate,
      region: form.region.trim() || null,
      subgroup: form.subgroup.trim() || null,
      registration_status: 'not_registered',
      source_values: {
        created_from: { source: 'nexus_manual', observed_at: new Date().toISOString() },
      },
    })
    onCreated(participant)
  }

  const err = createParticipant.error
  const duplicate = err?.code === '23505'

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.35)' }} />
        <Dialog.Content className="icplc-dialog" aria-describedby={undefined}>
          <form onSubmit={submit}>
            <Dialog.Title style={{ margin: '0 0 12px', fontSize: 16 }}>Add Participant</Dialog.Title>
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="Full name" value={form.full_name} onChange={set('full_name')} autoFocus required />
              <Field label="Primary Email" type="email" value={form.email} onChange={set('email')} />
              <Field label="Alternate Email" type="email" value={form.alternate_email} onChange={set('alternate_email')} />
              <Field label="Region" value={form.region} onChange={set('region')} />
              <Field label="Subgroup" value={form.subgroup} onChange={set('subgroup')} />
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Both emails optional. If only alternate is supplied it becomes primary. Added as Not Registered until a registration is linked.
            </p>
            {err && (
              <div role="alert" style={{ marginTop: 10, fontSize: 12, color: '#991B1B' }}>
                {duplicate
                  ? 'A participant with this email already exists in this event. Search for them instead.'
                  : `Could not create participant: ${err.message}`}
              </div>
            )}
            <div className="icplc-actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={onClose} className="icplc-btn">Cancel</button>
              <button type="submit" disabled={!form.full_name.trim() || createParticipant.isPending} className="icplc-btn icplc-btn-primary">
                {createParticipant.isPending ? 'Saving…' : 'Create participant'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Field({ label, value, onChange, autoFocus, type = 'text', required }) {
  return (
    <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
      {label}
      <input type={type} value={value} onChange={onChange} autoFocus={autoFocus} required={required} className="icplc-input" style={{ marginTop: 4 }} />
    </label>
  )
}
