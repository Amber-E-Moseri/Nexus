import React, { useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import { deriveReadiness } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { ATTENTION_CATEGORIES, attentionCategoryKeys } from '../lib/documentationRules.js'
import { isActiveParticipant } from '../lib/reconciliation.js'

export default function OverviewPage({ canWrite, onShowPeople }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, setFilters } = useICPLC()
  const eventId = config?.id
  const { participants, ambiguousRegistrations, isLoading } = useICPLCWorkingList(eventId)

  const stats = useMemo(() => {
    const active = participants.filter(isActiveParticipant)
    const total = active.length
    const registered = active.filter((p) => p.registration_link_status === 'registered').length
    const confirmed = active.filter((p) => p.participation_status === 'confirmed').length
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0)
    const attention = new Map()
    const readinessCounts = { ready: 0, in_progress: 0, action_required: 0, blocked: 0, unknown: 0 }
    for (const p of active) {
      for (const key of attentionCategoryKeys(p)) attention.set(key, (attention.get(key) || 0) + 1)
      const r = deriveReadiness(p).readiness
      readinessCounts[r] = (readinessCounts[r] || 0) + 1
    }
    const ready = readinessCounts.ready
    const needsAttention = readinessCounts.action_required + readinessCounts.blocked
    return {
      total, registered, confirmed, ready, needsAttention,
      registeredPct: pct(registered), confirmedPct: pct(confirmed), readyPct: pct(ready),
      needsAttentionPct: pct(needsAttention),
      attention,
      bySubgroup: countBy(active, 'subgroup'),
      readinessCounts,
      active,
    }
  }, [participants])

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="icplc-stat-grid">
        {[1,2,3,4].map((i) => (
          <div key={i} className="icplc-stat-card" style={{ height: 120, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    </div>
  )

  const attentionCards = ATTENTION_CATEGORIES.filter((c) => stats.attention.get(c.key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stat cards */}
      <div className="icplc-stat-grid">
        <StatCard
          label="Working List"
          value={stats.total}
          sub="total participants"
        />
        <StatCard
          label="Confirmed"
          value={stats.confirmed}
          sub={`${stats.confirmedPct}% of ${stats.total}`}
          pct={stats.confirmedPct}
          barColor="var(--icplc-green)"
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'confirmed' }))
            onShowPeople?.()
          }}
        />
        <StatCard
          label="Ready"
          value={stats.ready}
          sub={`${stats.readyPct}% of ${stats.total}`}
          pct={stats.readyPct}
          barColor="var(--icplc-green)"
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'all', readiness: ['ready'] }))
            onShowPeople?.()
          }}
        />
        <StatCard
          label="Needs Attention"
          value={stats.needsAttention}
          sub={`${stats.needsAttentionPct}% of ${stats.total}`}
          pct={stats.needsAttentionPct}
          barColor="var(--icplc-orange)"
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'needs_attention' }))
            onShowPeople?.()
          }}
        />
      </div>

      {/* Readiness Distribution */}
      <div className="icplc-overview-section">
        <ReadinessBar counts={stats.readinessCounts} total={stats.total} />
      </div>

      {/* Ambiguous registrations */}
      {ambiguousRegistrations.length > 0 && (
        <div style={{
          border: '1px solid var(--icplc-border)', borderRadius: 8, padding: '14px 18px',
          background: 'var(--icplc-orange-bg)', display: 'flex', justifyContent: 'space-between',
          gap: 12, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--icplc-text)' }}>Ambiguous Registration Match</div>
            <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)', marginTop: 3 }}>
              {ambiguousRegistrations.length} registration{ambiguousRegistrations.length === 1 ? '' : 's'} need review — not linked, no duplicate created.
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)' }}>Review in Imports</div>
        </div>
      )}

      {/* Needs Attention */}
      <div className="icplc-overview-section">
        <h3 className="icplc-overview-section-title">Needs Attention</h3>
        {attentionCards.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--icplc-text-soft)' }}>Nothing needs attention right now.</div>
        ) : (
          <div className="icplc-attn-grid">
            {attentionCards.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setFilters((prev) => ({ ...prev, working_list_view: 'needs_attention' }))
                  onShowPeople?.()
                }}
                className="icplc-btn"
                style={{ justifyContent: 'space-between', textAlign: 'left', padding: '10px 14px', minHeight: 44 }}
              >
                <span style={{ fontSize: 13 }}>{c.label}</span>
                <strong style={{ fontSize: 14, color: 'var(--icplc-orange)' }}>{stats.attention.get(c.key)}</strong>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* By Subgroup */}
      <div className="icplc-overview-section">
        <h3 className="icplc-overview-section-title">By Subgroup</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="icplc-table">
            <thead>
              <tr>
                <th>Subgroup</th>
                <th>Total</th>
                <th>Confirmed</th>
                <th>Registered</th>
                <th>Ready</th>
                <th>Confirmed %</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.bySubgroup)
                .sort((a, b) => b[1] - a[1])
                .map(([subgroup, count]) => {
                  const inSubgroup = stats.active.filter((p) => p.subgroup === subgroup)
                  const confirmed = inSubgroup.filter((p) => p.participation_status === 'confirmed').length
                  const registeredInSubgroup = inSubgroup.filter((p) => p.registration_link_status === 'registered').length
                  const ready = inSubgroup.filter((p) => deriveReadiness(p).readiness === 'ready').length
                  const confirmedPct = count ? Math.round((confirmed / count) * 100) : 0
                  const issues = inSubgroup.filter((p) => {
                    const r = deriveReadiness(p).readiness
                    return r === 'action_required' || r === 'blocked'
                  }).length
                  return (
                    <tr key={subgroup || 'unassigned'}>
                      <td style={{ fontWeight: 500 }}>{subgroup || <em style={{ color: 'var(--icplc-text-muted)' }}>Unassigned</em>}</td>
                      <td>{count}</td>
                      <td>{confirmed}</td>
                      <td>{registeredInSubgroup}</td>
                      <td>{ready}</td>
                      <td>
                        <span>{confirmedPct}%</span>
                        <span className="icplc-mini-bar-track">
                          <span className="icplc-mini-bar-fill" style={{ width: `${confirmedPct}%` }} />
                        </span>
                      </td>
                      <td>
                        {issues > 0 ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                            background: 'var(--icplc-red-bg)', color: 'var(--icplc-red)',
                          }}>
                            {issues}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--icplc-text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
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

const READINESS_SEGMENTS = [
  { key: 'ready',           label: 'Ready',           color: '#2D8653' },
  { key: 'in_progress',     label: 'In Progress',     color: '#2563EB' },
  { key: 'action_required', label: 'Action Required', color: '#C97820' },
  { key: 'blocked',         label: 'Blocked',         color: '#C94830' },
  { key: 'unknown',         label: 'Unknown',         color: '#9CA3AF' },
]

function ReadinessBar({ counts, total }) {
  if (!total) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--icplc-text)' }}>
          Readiness Distribution
        </h3>
        <span style={{ fontSize: 12, color: 'var(--icplc-text-muted)' }}>{total} participants</span>
      </div>
      <div className="icplc-readiness-bar">
        {READINESS_SEGMENTS.map(({ key, color }) => {
          const pct = total ? (counts[key] || 0) / total * 100 : 0
          if (!pct) return null
          return <div key={key} className="icplc-readiness-segment" style={{ width: `${pct}%`, background: color }} />
        })}
      </div>
      <div className="icplc-readiness-legend">
        {READINESS_SEGMENTS.map(({ key, label, color }) => {
          const n = counts[key] || 0
          if (!n) return null
          return (
            <div key={key} className="icplc-legend-item">
              <span className="icplc-legend-dot" style={{ background: color }} />
              <span>{label}</span>
              <strong style={{ color: 'var(--icplc-text)' }}>{n}</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, pct, barColor, onClick }) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="icplc-stat-card"
      style={{ cursor: onClick ? 'pointer' : 'default', font: 'inherit', textAlign: 'left' }}
    >
      <div className="icplc-stat-card-label">{label}</div>
      <div className="icplc-stat-card-value">{value}</div>
      {sub && <div className="icplc-stat-card-sub">{sub}</div>}
      {pct != null && (
        <div className="icplc-progress-track">
          <div className="icplc-progress-fill" style={{ width: `${pct}%`, background: barColor }} />
        </div>
      )}
    </Component>
  )
}

function countBy(arr, field) {
  return arr.reduce((acc, item) => {
    const key = item[field] || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}
