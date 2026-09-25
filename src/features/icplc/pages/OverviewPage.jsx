import React, { useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import { deriveReadiness } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'

export default function OverviewPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const eventId = config?.id
  const { data: participants, isLoading } = useICPLCParticipants(eventId, {})

  const stats = useMemo(() => {
    if (!participants) return null
    const total = participants.length
    const byParticipation = countBy(participants, 'participation_status')
    const byRegistration = countBy(participants, 'registration_status')
    const byReadiness = participants.reduce((acc, p) => {
      const { readiness } = deriveReadiness(p)
      acc[readiness] = (acc[readiness] || 0) + 1
      return acc
    }, {})
    const bySubgroup = countBy(participants, 'subgroup')
    return { total, byParticipation, byRegistration, byReadiness, bySubgroup }
  }, [participants])

  if (isLoading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading…</div>
  if (!stats) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Total Participants" value={stats.total} />
        <StatCard label="Confirmed" value={stats.byParticipation.confirmed || 0} tone="success" />
        <StatCard label="Registered" value={stats.byRegistration.registered || 0} tone="success" />
        <StatCard label="Action Required" value={stats.byReadiness.action_required || 0} tone="warn" />
        <StatCard label="Blocked" value={stats.byReadiness.blocked || 0} tone="danger" />
        <StatCard label="Ready" value={stats.byReadiness.ready || 0} tone="success" />
      </div>

      {/* Subgroup breakdown */}
      <section>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>By Subgroup</h3>
        <table className="fs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Subgroup</th>
              <th style={thStyle}>Total</th>
              <th style={thStyle}>Confirmed</th>
              <th style={thStyle}>Registered</th>
              <th style={thStyle}>Action Required</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stats.bySubgroup)
              .sort((a, b) => b[1] - a[1])
              .map(([subgroup, count]) => {
                const inSubgroup = participants.filter((p) => p.subgroup === subgroup)
                const confirmed = inSubgroup.filter((p) => p.participation_status === 'confirmed').length
                const registered = inSubgroup.filter((p) => p.registration_status === 'registered').length
                const actionRequired = inSubgroup.filter((p) => deriveReadiness(p).readiness === 'action_required').length
                return (
                  <tr key={subgroup || 'unassigned'}>
                    <td style={tdStyle}>{subgroup || <em style={{ color: 'var(--text-secondary)' }}>Unassigned</em>}</td>
                    <td style={tdStyle}>{count}</td>
                    <td style={tdStyle}>{confirmed}</td>
                    <td style={tdStyle}>{registered}</td>
                    <td style={tdStyle}>{actionRequired}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </section>

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

function StatCard({ label, value, tone }) {
  const bg = tone === 'success' ? '#F0FDF4' : tone === 'warn' ? '#FFFBEB' : tone === 'danger' ? '#FEF2F2' : 'var(--surface-2)'
  const color = tone === 'success' ? '#166534' : tone === 'warn' ? '#92400E' : tone === 'danger' ? '#991B1B' : 'var(--text-primary)'
  return (
    <div style={{ padding: 16, borderRadius: 8, background: bg, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function countBy(arr, field) {
  return arr.reduce((acc, item) => {
    const key = item[field] || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
}
const tdStyle = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }
