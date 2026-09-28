import React from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import { deriveItineraryStatus, deriveTravelStatus } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { rowOpenProps } from '../components/ParticipantTable.jsx'
import Badge from '../../../components/ui/Badge.jsx'

export default function TravelPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const { data: participants, isLoading, error, refetch } = useICPLCParticipants(config?.id, {})

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3,4,5].map((i) => (
        <div key={i} style={{ height: 44, background: 'var(--surface-2)', borderRadius: 6, animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
      ))}
    </div>
  )

  if (error) return (
    <div style={{
      border: '1px solid #F3BDB8', borderRadius: 8, padding: '16px 20px',
      background: '#FEF2F2', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>⚠</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Failed to load travel data</div>
        <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>
          {error?.message || 'An error occurred while fetching travel records.'}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          style={{
            padding: '5px 12px', background: '#991B1B', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          }}
        >
          Retry
        </button>
      </div>
    </div>
  )

  if (!participants?.length) return (
    <div style={{
      padding: '40px 20px', textAlign: 'center',
      border: '1px dashed var(--border)', borderRadius: 8,
      color: 'var(--text-secondary)',
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>✈️</div>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No travel records yet</div>
      <div style={{ fontSize: 12 }}>Travel itineraries will appear here once participants are added.</div>
    </div>
  )

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
