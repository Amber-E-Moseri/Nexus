import React from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import ParticipantTable from '../components/ParticipantTable.jsx'
import ParticipantFilters from '../components/ParticipantFilters.jsx'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'

export default function PeoplePage({ canWrite }) {
  const { config, filters, activeProfileId, activeProfileTab, closeProfile } = useICPLC()
  const eventId = config?.id

  const { data: participants, isLoading, error } = useICPLCParticipants(eventId, {
    search: filters.search,
    participation_status: filters.participation_status,
    registration_status: filters.registration_status,
    passport_readiness: filters.passport_readiness,
    visa_requirement: filters.visa_requirement,
    visa_process_status: filters.visa_process_status,
    subgroup: filters.subgroup,
  })

  return (
    <div>
      {/* Search bar */}
      <div style={{ marginBottom: 12 }}>
        <SearchBar />
      </div>

      {/* Filters */}
      <ParticipantFilters />

      {/* Count */}
      {!isLoading && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {participants?.length ?? 0} participant{participants?.length !== 1 ? 's' : ''}
        </div>
      )}

      {error && (
        <div style={{ padding: 20, color: 'var(--text-secondary)' }}>
          Failed to load participants.
        </div>
      )}

      <ParticipantTable participants={participants} loading={isLoading} />

      {/* Canonical profile drawer */}
      {activeProfileId && (
        <ParticipantProfileDrawer
          participantId={activeProfileId}
          initialTab={activeProfileTab}
          onClose={closeProfile}
          canWrite={canWrite}
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
