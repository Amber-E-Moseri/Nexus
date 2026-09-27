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
    const ready = active.filter((p) => deriveReadiness(p).readiness === 'ready').length
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0)
    const attention = new Map()
    for (const p of active) {
      for (const key of attentionCategoryKeys(p)) attention.set(key, (attention.get(key) || 0) + 1)
    }
    return {
      total, registered, confirmed, ready,
      registeredPct: pct(registered), confirmedPct: pct(confirmed), readyPct: pct(ready),
      attention,
      bySubgroup: countBy(active, 'subgroup'),
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
          tone="success"
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'registered' }))
            onShowPeople?.()
          }}
        />
        <StatCard
          label="Confirmed"
          value={`${stats.confirmed} / ${stats.total}`}
          detail={`${stats.confirmedPct}%`}
          tone="success"
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'confirmed' }))
            onShowPeople?.()
          }}
        />
        <StatCard
          label="Ready"
          value={`${stats.ready} / ${stats.total}`}
          detail={`${stats.readyPct}%`}
          tone="success"
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'all', readiness: ['ready'] }))
            onShowPeople?.()
          }}
        />
      </div>

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
