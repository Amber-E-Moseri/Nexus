import React, { useMemo, useState } from 'react'
import { UserPlus } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useICPLC } from '../ICPLCContext.jsx'
import { useCreateParticipant } from '../hooks/useICPLCParticipants.js'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import { useICPLCTargets } from '../hooks/useICPLCTargets.js'
import { useUpdateProfile } from '../hooks/useICPLCProfile.js'
import WorkingListTable from '../components/WorkingListTable.jsx'
import BulkActionBar from '../components/BulkActionBar.jsx'
import { useRowSelection } from '../hooks/useRowSelection.js'
import { absentToggleNotice, applyAbsentVisibility } from '../lib/bulkSelection.js'
import ParticipantFilters from '../components/ParticipantFilters.jsx'
import StatusKey from '../components/StatusKey.jsx'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import BoardPage from './BoardPage.jsx'
import { deriveReadiness } from '../lib/readinessEngine.js'
import { applyClientFilters, countAttentionCategories } from '../lib/participantFilters.js'
import { filterParticipantsByWorkingListView } from '../lib/reconciliation.js'
import { needsAttentionNow } from '../lib/attentionModel.js'

export default function PeoplePage({ canWrite, view = 'list', onViewChange }) {
  const { config, filters, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const eventId = config?.id
  const [showAdd, setShowAdd] = useState(false)
  // Operational People view hides Not Attending by default, like Needs Attention, Documentation and Travel.
  const [showAbsent, setShowAbsent] = useState(false)
  const updateProfile = useUpdateProfile()
  const [notice, setNotice] = useState(null) // { ok, text } feedback for the per-row Absent toggle

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

  const attentionCounts = useMemo(
    () => countAttentionCategories(participantsWithRegistrationCoverage),
    [participantsWithRegistrationCoverage],
  )

  const targets = useICPLCTargets(eventId)

  const filteredParticipants = useMemo(() => applyClientFilters(
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

  // Asking for Not Attending in the Participation filter is an explicit request and is honoured.
  const explicitlyAbsent = (filters.participation_status || []).includes('not_attending')
  const absentCount = useMemo(
    () => filteredParticipants.filter((p) => p.participation_status === 'not_attending').length,
    [filteredParticipants],
  )
  const displayedParticipants = useMemo(
    () => applyAbsentVisibility(filteredParticipants, { showAbsent, participationFilter: filters.participation_status }),
    [filteredParticipants, showAbsent, filters.participation_status],
  )

  function toggleAbsent(p) {
    const next = p.participation_status === 'not_attending' ? 'tracking' : 'not_attending'
    updateProfile.mutate(
      { id: p.id, fields: { participation_status: next } },
      {
        onSuccess: () => setNotice(absentToggleNotice(p, next, showAbsent || explicitlyAbsent)),
        onError: (err) => setNotice({ ok: false, text: `Could not update ${p.full_name}: ${err?.message || 'save failed'}` }),
      },
    )
  }

  // Any material filter change (including the Not Attending toggle and switching view) clears the selection.
  const selection = useRowSelection({ resetKey: JSON.stringify([filters, showAbsent, view]) })

  const viewToggle = (
    <div
      role="group"
      aria-label="People view"
      style={{ display: 'flex', gap: 2, border: '1px solid var(--icplc-border)', borderRadius: 6, padding: 2, background: 'var(--icplc-grey-bg)' }}
    >
      <button
        type="button"
        aria-pressed={view === 'list'}
        className={`icplc-view-btn${view === 'list' ? ' icplc-view-btn--active' : ''}`}
        onClick={() => onViewChange?.('list')}
      >
        List
      </button>
      <button
        type="button"
        aria-pressed={view === 'board'}
        className={`icplc-view-btn${view === 'board' ? ' icplc-view-btn--active' : ''}`}
        onClick={() => onViewChange?.('board')}
      >
        Board
      </button>
    </div>
  )

  // Board view: render BoardPage inline (it manages its own drawer)
  if (view === 'board') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--icplc-text, var(--text-primary))' }}>People</div>
          {viewToggle}
        </div>
        <BoardPage canWrite={canWrite} />
      </div>
    )
  }

  // List view
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--icplc-text, var(--text-primary))' }}>People</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {viewToggle}
          {canWrite && (
            <button type="button" onClick={() => setShowAdd(true)} className="icplc-btn icplc-btn-primary">
              <UserPlus size={14} aria-hidden /> Add
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

      {/* Count */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div role="status" style={{ fontSize: 12, color: 'var(--icplc-text-soft, var(--text-secondary))' }}>
            {displayedParticipants.length} participant{displayedParticipants.length !== 1 ? 's' : ''}
          </div>
          {absentCount > 0 && !explicitlyAbsent && (
            <button type="button" className="icplc-chip" aria-pressed={showAbsent} onClick={() => setShowAbsent((v) => !v)}>
              {showAbsent ? 'Hiding not attending' : `Include not attending (${absentCount})`}
            </button>
          )}
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

      {notice && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 8, color: notice.ok ? 'var(--icplc-text, inherit)' : 'var(--icplc-red, #B42318)' }}>
          <span>{notice.text}</span>
          <button type="button" className="icplc-btn" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      <WorkingListTable
        participants={displayedParticipants}
        loading={loading}
        onOpen={openProfile}
        onToggleAbsent={canWrite ? toggleAbsent : undefined}
        selection={selection}
      />

      <BulkActionBar eventId={eventId} selection={selection} context="people" canWrite={canWrite} filteredRows={displayedParticipants} />

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
