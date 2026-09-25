import React, { useState, useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import { deriveReadiness, readinessLabel } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import Badge from '../../../components/ui/Badge.jsx'

const PARTICIPATION_COLUMNS = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']
const READINESS_COLUMNS = ['unknown', 'in_progress', 'action_required', 'blocked', 'ready']

const PARTICIPATION_TONES = {
  tracking: 'mute', likely: 'in_progress', confirmed: 'done',
  uncertain: 'at_risk', not_attending: 'blocked',
}
const READINESS_TONES = {
  unknown: 'mute', in_progress: 'in_progress',
  action_required: 'at_risk', blocked: 'blocked', ready: 'done',
}

export default function BoardPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const [groupBy, setGroupBy] = useState('participation')
  const { data: participants, isLoading } = useICPLCParticipants(config?.id, {})

  const columns = groupBy === 'participation' ? PARTICIPATION_COLUMNS : READINESS_COLUMNS
  const tones = groupBy === 'participation' ? PARTICIPATION_TONES : READINESS_TONES

  const grouped = useMemo(() => {
    if (!participants) return {}
    return columns.reduce((acc, col) => {
      if (groupBy === 'participation') {
        acc[col] = participants.filter((p) => p.participation_status === col)
      } else {
        acc[col] = participants.filter((p) => deriveReadiness(p).readiness === col)
      }
      return acc
    }, {})
  }, [participants, groupBy, columns])

  if (isLoading) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading…</div>

  return (
    <div>
      {/* Group by toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>Group by:</span>
        {['participation', 'readiness'].map((opt) => (
          <button
            key={opt}
            onClick={() => setGroupBy(opt)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              background: groupBy === opt ? 'var(--accent)' : 'transparent',
              color: groupBy === opt ? 'white' : 'var(--text-secondary)',
              border: `1px solid ${groupBy === opt ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {opt === 'participation' ? 'Participation' : 'Readiness'}
          </button>
        ))}
      </div>

      {/* Board columns */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 16 }}>
        {columns.map((col) => {
          const cards = grouped[col] || []
          return (
            <div
              key={col}
              style={{
                minWidth: 220, width: 220, flexShrink: 0,
                background: 'var(--surface-2)', borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            >
              {/* Column header */}
              <div style={{
                padding: '10px 12px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <Badge tone={tones[col] || 'mute'} label={col} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cards.length}</span>
              </div>

              {/* Cards */}
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cards.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => openProfile(p.id)}
                    style={{
                      padding: '8px 10px', background: 'white', borderRadius: 6,
                      border: '1px solid var(--border)', cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.full_name}</div>
                    {p.subgroup && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{p.subgroup}</div>
                    )}
                    {p.tags?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                        {p.tags.slice(0, 3).map((t) => (
                          <span
                            key={t.id}
                            className="fchip"
                            style={{ fontSize: 10, background: t.color || 'var(--surface-2)' }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {cards.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 2px' }}>—</div>
                )}
              </div>
            </div>
          )
        })}
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
