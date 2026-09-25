import React from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import { deriveItineraryStatus, deriveTravelStatus } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import Badge from '../../../components/ui/Badge.jsx'

export default function TravelPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const { data: participants, isLoading } = useICPLCParticipants(config?.id, {})

  if (isLoading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Flight manifest — {participants?.length ?? 0} participants
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="fs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Subgroup</th>
              <th style={thStyle}>Itinerary</th>
              <th style={thStyle}>Travel Status</th>
              <th style={thStyle}>Arrival</th>
              <th style={thStyle}>Arrival Flight</th>
              <th style={thStyle}>Departure</th>
              <th style={thStyle}>Departure Flight</th>
            </tr>
          </thead>
          <tbody>
            {(participants || []).map((p) => {
              const itinerary = deriveItineraryStatus(p)
              const travel = deriveTravelStatus(p)
              return (
                <tr key={p.id} onClick={() => openProfile(p.id, 'travel')} style={{ cursor: 'pointer' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{p.full_name}</div>
                  </td>
                  <td style={tdStyle}>{p.subgroup || '—'}</td>
                  <td style={tdStyle}>
                    <Badge
                      tone={itinerary === 'received' ? 'done' : 'warn'}
                      label={itinerary === 'received' ? 'Received' : 'Missing'}
                    />
                  </td>
                  <td style={tdStyle}>
                    <Badge
                      tone={travel === 'ready' ? 'done' : 'at_risk'}
                      label={travel === 'ready' ? 'Ready' : 'Outstanding'}
                    />
                  </td>
                  <td style={tdStyle}>{formatDate(p.arrival_date)}</td>
                  <td style={tdStyle}>{p.arrival_flight || '—'}</td>
                  <td style={tdStyle}>{formatDate(p.departure_date)}</td>
                  <td style={tdStyle}>{p.departure_flight || '—'}</td>
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

const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
}
const tdStyle = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }
