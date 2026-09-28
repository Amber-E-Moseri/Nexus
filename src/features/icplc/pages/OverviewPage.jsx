import React, { useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import { deriveReadiness } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { ATTENTION_CATEGORIES, attentionCategoryKeys } from '../lib/documentationRules.js'
import { isActiveParticipant } from '../lib/reconciliation.js'

export default function OverviewPage({ canWrite, onShowPeople, onShowAttention }) {
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
    return {
      total, registered, confirmed, ready,
      registeredPct: pct(registered), confirmedPct: pct(confirmed), readyPct: pct(ready),
      attention,
      bySubgroup: countBy(active, 'subgroup'),
      readinessCounts,
      active,
    }
  }, [participants])

  if (isLoading) return <div role="status" style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading...</div>

  const attentionCards = ATTENTION_CATEGORIES.filter((c) => stats.attention.get(c.key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="icplc-stat-grid">
        <StatCard label="Working List" value={`${stats.total}`} detail="participants" />
        <StatCard
          label="Registered"
          value={`${stats.registered} / ${stats.total}`}
          detail={`${stats.registeredPct}%`}
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'registered' }))
            onShowPeople?.()
          }}
        />
        <StatCard
          label="Confirmed"
          value={`${stats.confirmed} / ${stats.total}`}
          detail={`${stats.confirmedPct}%`}
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'confirmed' }))
            onShowPeople?.()
          }}
        />
        <StatCard
          label="Ready"
          value={`${stats.ready} / ${stats.total}`}
          detail={`${stats.readyPct}%`}
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'all', readiness: ['ready'] }))
            onShowPeople?.()
          }}
        />
      </div>

      <ReadinessBar counts={stats.readinessCounts} total={stats.total} />

      {ambiguousRegistrations.length > 0 && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 8, padding: 14,
          background: 'var(--surface-1)', display: 'flex', justifyContent: 'space-between',
          gap: 12, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Ambiguous Registration Match</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
              {ambiguousRegistrations.length} registration{ambiguousRegistrations.length === 1 ? '' : 's'} need review — not linked, no duplicate created.
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Review in the Registrations tab</div>
        </div>
      )}

      <section aria-labelledby="ov-attn">
        <h3 id="ov-attn" style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Needs Attention</h3>
        {attentionCards.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Nothing needs attention right now.</div>
        ) : (
          <div className="icplc-attn-grid">
            {attentionCards.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onShowAttention?.()}
                className="icplc-btn"
                style={{ justifyContent: 'space-between', textAlign: 'left', padding: '10px 12px', minHeight: 44 }}
              >
                <span>{c.label}</span>
                <strong>{stats.attention.get(c.key)}</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>By Subgroup</h3>
        <div style={{ overflowX: 'auto' }}>
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
                const inSubgroup = stats.active.filter((p) => p.subgroup === subgroup)
                const confirmed = inSubgroup.filter((p) => p.participation_status === 'confirmed').length
                const registeredInSubgroup = inSubgroup.filter((p) => p.registration_link_status === 'registered').length
                const actionRequired = inSubgroup.filter((p) => deriveReadiness(p).readiness === 'action_required').length
                return (
                  <tr key={subgroup || 'unassigned'}>
                    <td style={tdStyle}>{subgroup || <em style={{ color: 'var(--text-secondary)' }}>Unassigned</em>}</td>
                    <td style={tdStyle}>{count}</td>
                    <td style={tdStyle}>{confirmed}</td>
                    <td style={tdStyle}>{registeredInSubgroup}</td>
                    <td style={tdStyle}>{actionRequired}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        </div>
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

const READINESS_SEGMENTS = [
  { key: 'ready',          label: 'Ready',           color: '#2D8653' },
  { key: 'in_progress',    label: 'In Progress',     color: '#4C6FBF' },
  { key: 'action_required',label: 'Action Required', color: '#C97820' },
  { key: 'blocked',        label: 'Blocked',         color: '#C94830' },
  { key: 'unknown',        label: 'Unknown',         color: '#C4BBD4' },
]

function ReadinessBar({ counts, total }) {
  if (!total) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Readiness Distribution
        </h3>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{total} participants</span>
      </div>
      <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)' }}>
        {READINESS_SEGMENTS.map(({ key, color }) => {
          const pct = total ? (counts[key] || 0) / total * 100 : 0
          if (!pct) return null
          return <div key={key} style={{ width: `${pct}%`, background: color, transition: 'width 0.3s' }} />
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
        {READINESS_SEGMENTS.map(({ key, label, color }) => {
          const n = counts[key] || 0
          if (!n) return null
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <strong style={{ color: 'var(--text-primary)' }}>{n}</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, detail, tone, onClick }) {
  const bg = tone === 'success' ? '#F0FDF4' : tone === 'warn' ? '#FFFBEB' : tone === 'danger' ? '#FEF2F2' : 'var(--surface-2)'
  const color = tone === 'success' ? '#166534' : tone === 'warn' ? '#92400E' : tone === 'danger' ? '#991B1B' : 'var(--text-primary)'
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        padding: 16,
        borderRadius: 8,
        background: bg,
        border: '1px solid var(--border)',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        font: 'inherit',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      {detail && <div style={{ fontSize: 12, fontWeight: 700, color, marginTop: 2 }}>{detail}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
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

const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
}
const tdStyle = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }
