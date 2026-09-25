import React from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import Badge from '../../../components/ui/Badge.jsx'

const PASSPORT_TONES = {
  ready: 'done', renewal_needed: 'at_risk', renewal_in_progress: 'in_progress',
  no_passport: 'blocked', unsure: 'warn', issue: 'blocked', unknown: 'mute',
}
const VISA_PROCESS_TONES = {
  not_started: 'mute', in_progress: 'in_progress', submitted: 'in_progress',
  processing: 'in_progress', approved: 'done', issue: 'blocked', not_applicable: 'mute',
}

export default function DocumentationPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const { data: participants, isLoading } = useICPLCParticipants(config?.id, {})

  if (isLoading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading…</div>

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        {participants?.length ?? 0} participants
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="fs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Subgroup</th>
              <th style={thStyle}>Passport Country</th>
              <th style={thStyle}>Passport</th>
              <th style={thStyle}>Visa Req.</th>
              <th style={thStyle}>Visa Status</th>
              <th style={thStyle}>Residency</th>
            </tr>
          </thead>
          <tbody>
            {(participants || []).map((p) => (
              <tr key={p.id} onClick={() => openProfile(p.id, 'documentation')} style={{ cursor: 'pointer' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{p.full_name}</div>
                </td>
                <td style={tdStyle}>{p.subgroup || '—'}</td>
                <td style={tdStyle}>{p.passport_country || '—'}</td>
                <td style={tdStyle}>
                  <Badge tone={PASSPORT_TONES[p.passport_readiness] || 'mute'} label={p.passport_readiness} />
                </td>
                <td style={tdStyle}>{p.visa_requirement}</td>
                <td style={tdStyle}>
                  <Badge tone={VISA_PROCESS_TONES[p.visa_process_status] || 'mute'} label={p.visa_process_status} />
                </td>
                <td style={tdStyle}>{p.canada_residency_status || '—'}</td>
              </tr>
            ))}
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

const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
}
const tdStyle = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }
