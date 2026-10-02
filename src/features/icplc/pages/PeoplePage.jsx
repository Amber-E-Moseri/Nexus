import React, { useCallback, useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAuth } from '../../../hooks/useAuth.js'
import { useICPLC } from '../ICPLCContext.jsx'
import { useCreateParticipant } from '../hooks/useICPLCParticipants.js'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import { useICPLCTargets } from '../hooks/useICPLCTargets.js'
import { useUpdateProfile } from '../hooks/useICPLCProfile.js'
import WorkingListTable from '../components/WorkingListTable.jsx'
import ParticipantFilters from '../components/ParticipantFilters.jsx'
import StatusKey from '../components/StatusKey.jsx'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import BulkActionBar from '../components/BulkActionBar.jsx'
import ICPLCEmailComposer, { EmailParticipantsButton, canEstimateICPLCEmail } from '../components/ICPLCEmailComposer.jsx'
import { deriveReadiness } from '../lib/readinessEngine.js'
import { applyClientFilters, countAttentionCategories } from '../lib/participantFilters.js'
import { filterParticipantsByWorkingListView } from '../lib/reconciliation.js'
import { needsAttentionNow } from '../lib/attentionModel.js'

export default function PeoplePage({ canWrite }) {
  const { config, filters, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const eventId = config?.id
  const [showAdd, setShowAdd] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [emailSelectedOnly, setEmailSelectedOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const { profile } = useAuth()
  const canEmail = canEstimateICPLCEmail(profile)
  const updateProfile = useUpdateProfile()
  const setSelection = useCallback((ids) => setSelectedIds(new Set(ids)), [])
  const toggleSelect = useCallback((id) => setSelectedIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }), [])

  // Same hook (and cache keys) as the Overview, so opening the Working List after the Overview
  // reuses the already-fetched participants, registrations and identity maps instead of refetching.
  const {
    participants: participantsWithRegistrationCoverage,
    registrations,
    registrationMaps,
    isLoading: loading,
    error,
  } = useICPLCWorkingList(eventId, {
    search: filters.search,
    participation_status: filters.participation_status,
    passport_readiness: filters.passport_readiness,
    visa_process_status: filters.visa_process_status,
    subgroup: filters.subgroup,
  })

  const attentionCounts = useMemo(() => countAttentionCategories(participantsWithRegistrationCoverage), [participantsWithRegistrationCoverage])

  const targets = useICPLCTargets(eventId)

  const displayedParticipants = useMemo(() => applyClientFilters(
    filterParticipantsByWorkingListView(
      participantsWithRegistrationCoverage,
      registrations,
      registrationMaps,
      eventId,
      filters.working_list_view || 'all',
      (participant) => deriveReadiness(participant).readiness,
      needsAttentionNow,
    ),
    filters,
    { targets },
  ), [eventId, filters, participantsWithRegistrationCoverage, registrationMaps, registrations, targets])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--icplc-text, var(--text-primary))' }}>Registrations</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {canEmail && <EmailParticipantsButton count={displayedParticipants.length} disabled={displayedParticipants.length === 0} onClick={() => { setEmailSelectedOnly(false); setShowEmail(true) }} />}
          {canWrite && (
            <button type="button" onClick={() => setShowAdd(true)} className="icplc-btn icplc-btn-primary" style={{ flexShrink: 0 }}>
              <UserPlus size={14} aria-hidden /> Add Participant
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 12 }}>
        <SearchBar />
      </div>

      {/* Filters */}
      <ParticipantFilters resultCount={displayedParticipants.length} attentionCounts={attentionCounts} />

      <StatusKey />

      {/* View toggle + Count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div role="status" style={{ fontSize: 12, color: 'var(--icplc-text-soft, var(--text-secondary))' }}>
          {displayedParticipants.length} participant{displayedParticipants.length !== 1 ? 's' : ''}
        </div>
      </div>

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

      <WorkingListTable
        participants={displayedParticipants}
        loading={loading}
        onOpen={openProfile}
        selectedIds={canWrite || canEmail ? selectedIds : undefined}
        onToggleSelect={canWrite || canEmail ? toggleSelect : undefined}
        onSetSelection={setSelection}
        onToggleAbsent={canWrite ? (p) => updateProfile.mutate({ id: p.id, fields: { participation_status: p.participation_status === 'not_attending' ? 'tracking' : 'not_attending' } }) : undefined}
      />

      {selectedIds.size > 0 && (
        <BulkActionBar
          eventId={eventId}
          selectedIds={[...selectedIds]}
          selectedParticipants={displayedParticipants.filter((p) => selectedIds.has(p.id))}
          userId={profile?.id}
          canWrite={canWrite}
          canEmail={canEmail}
          onEmail={() => { setEmailSelectedOnly(true); setShowEmail(true) }}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {activeProfileId && (
        <ParticipantProfileDrawer
          participantId={activeProfileId}
          initialTab={activeProfileTab}
          onClose={closeProfile}
          canWrite={canWrite}
        />
      )}

      {showEmail && canEmail && (
        <ICPLCEmailComposer
          eventId={eventId}
          eventName={config?.event_name}
          sourceLabel={emailSelectedOnly ? 'Selected people' : 'Current list'}
          participants={emailSelectedOnly ? displayedParticipants.filter((p) => selectedIds.has(p.id)) : displayedParticipants}
          open
          onClose={() => { setShowEmail(false); setEmailSelectedOnly(false) }}
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
