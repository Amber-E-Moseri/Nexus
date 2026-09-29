import React, { useState, useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCParticipants } from '../hooks/useICPLCParticipants.js'
import { deriveReadiness, readinessLabel } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'

const PARTICIPATION_COLUMNS = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']
const READINESS_COLUMNS = ['unknown', 'in_progress', 'action_required', 'blocked', 'ready']

const PARTICIPATION_DOTS = {
  tracking: '#6B7280', likely: '#2563EB', confirmed: '#2D8653',
  uncertain: '#C97820', not_attending: '#C94830',
}
const READINESS_DOTS = {
  unknown: '#9CA3AF', in_progress: '#2563EB',
  action_required: '#C97820', blocked: '#C94830', ready: '#2D8653',
}

const PARTICIPATION_LABELS = {
  tracking: 'Tracking', likely: 'Likely', confirmed: 'Confirmed',
  uncertain: 'Uncertain', not_attending: 'Not Attending',
}

function humanizeReadiness(r) {
  return { unknown: 'Unknown', in_progress: 'In Progress', action_required: 'Action Required', blocked: 'Blocked', ready: 'Ready' }[r] || r
}

export default function BoardPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const [groupBy, setGroupBy] = useState('participation')
  const { data: participants, isLoading, error, refetch } = useICPLCParticipants(config?.id, {})

  const columns = groupBy === 'participation' ? PARTICIPATION_COLUMNS : READINESS_COLUMNS
  const dots = groupBy === 'participation' ? PARTICIPATION_DOTS : READINESS_DOTS
  const colLabels = groupBy === 'participation'
    ? PARTICIPATION_LABELS
    : Object.fromEntries(READINESS_COLUMNS.map((c) => [c, humanizeReadiness(c)]))

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

  if (isLoading) return (
    <div style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
      {[1,2,3,4,5].map((i) => (
        <div key={i} style={{
          minWidth: 220, width: 220, flexShrink: 0, background: 'var(--surface-2)',
          borderRadius: 8, border: '1px solid var(--border)', height: 200,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
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
        <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Failed to load board</div>
        <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>
          {error?.message || 'An error occurred while fetching participant data.'}
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

  return (
    <div>
      {/* Group by toolbar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--icplc-text-soft, var(--text-secondary))' }}>Group by:</span>
        {['participation', 'readiness'].map((opt) => (
          <button
            key={opt}
            onClick={() => setGroupBy(opt)}
            className="icplc-chip"
            aria-pressed={groupBy === opt}
          >
            {opt === 'participation' ? 'Participation' : 'Readiness'}
          </button>
        ))}
      </div>

      {/* Board columns */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 16 }}>
        {columns.map((col) => {
          const cards = grouped[col] || []
          const dotColor = dots[col] || '#9CA3AF'
          return (
            <div
              key={col}
              style={{
                minWidth: 220, width: 220, flexShrink: 0,
                background: 'var(--icplc-grey-bg, var(--surface-2))', borderRadius: 8,
                border: '1px solid var(--icplc-border, var(--border))',
              }}
            >
              {/* Column header */}
              <div style={{
                padding: '9px 12px', borderBottom: '1px solid var(--icplc-border, var(--border))',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: dotColor, flexShrink: 0,
                }} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--icplc-text, var(--text-primary))' }}>
                  {colLabels[col]}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--icplc-text-soft, var(--text-secondary))',
                  background: 'var(--icplc-surface, #fff)', border: '1px solid var(--icplc-border, var(--border))',
                  borderRadius: 10, padding: '1px 7px', minWidth: 20, textAlign: 'center',
                }}>
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cards.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => openProfile(p.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfile(p.id) } }}
                    aria-label={`Open profile: ${p.full_name}`}
                    style={{
                      padding: '12px 14px', background: 'var(--icplc-surface, #fff)', borderRadius: 8,
                      border: '1px solid var(--icplc-border, var(--border))', cursor: 'pointer', fontSize: 12,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 13.5 }}>{p.full_name}</div>
                    {p.subgroup && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{p.subgroup}</div>
                    )}
                    {p.tags?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                        {p.tags.slice(0, 3).map((t) => (
                          <span
                            key={t.id}
                            style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 10,
                              background: t.color ? `${t.color}22` : 'var(--surface-2)',
                              color: t.color || 'var(--text-secondary)',
                              border: `1px solid ${t.color ? `${t.color}44` : 'var(--border)'}`,
                            }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {cards.length === 0 && (
                  <div style={{
                    padding: '16px 8px', textAlign: 'center',
                    color: 'var(--text-secondary)', fontSize: 11,
                    borderRadius: 6, border: '1px dashed var(--border)',
                  }}>
                    No participants
                  </div>
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
