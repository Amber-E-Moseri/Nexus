import React from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import { deriveItineraryStatus, deriveTravelStatus } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { rowOpenProps } from '../components/ParticipantTable.jsx'
import Badge from '../../../components/ui/Badge.jsx'

export default function TravelPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const { data: participants, isLoading, error } = useICPLCParticipants(config?.id, {})

  if (isLoading) return <div role="status" style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading…</div>
  if (error) return <div role="alert" style={{ padding: 40, color: 'var(--text-secondary)' }}>Failed to load travel data.</div>

  return (
    <div>
      <div role="status" style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Flight manifest — {participants?.length ?? 0} participants
      </div>
      <div className="icplc-table-wrap" style={{ overflowX: 'auto' }}>
        <table className="icplc-table">
          <thead>
            <tr>
              <th scope="col">Participant</th>
              <th scope="col">Itinerary</th>
              <th scope="col">Travel status</th>
              <th scope="col">Arrival</th>
              <th scope="col">Arrival flight</th>
              <th scope="col">Departure</th>
              <th scope="col">Departure flight</th>
            </tr>
          </thead>
          <tbody>
            {(participants || []).map((p) => {
              const itinerary = deriveItineraryStatus(p)
              const travel = deriveTravelStatus(p)
              return (
                <tr key={p.id} {...rowOpenProps(p.full_name, () => openProfile(p.id, 'travel'))}>
                  <td data-primary>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.full_name}</div>
                    {p.subgroup && <div className="icplc-cell-sub">{p.subgroup}</div>}
                  </td>
                  <td data-label="Itinerary">
                    <Badge tone={itinerary === 'received' ? 'done' : 'warn'} label={itinerary === 'received' ? 'Received' : 'Missing'} />
                  </td>
                  <td data-label="Travel status">
                    <Badge tone={travel === 'ready' ? 'done' : 'at_risk'} label={travel === 'ready' ? 'Ready' : 'Outstanding'} />
                  </td>
                  <td data-label="Arrival">{formatDate(p.arrival_date)}</td>
                  <td data-label="Arrival flight">{p.arrival_flight || '—'}</td>
                  <td data-label="Departure">{formatDate(p.departure_date)}</td>
                  <td data-label="Departure flight">{p.departure_flight || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}
