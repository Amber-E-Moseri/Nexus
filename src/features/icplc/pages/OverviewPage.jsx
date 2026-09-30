import React, { useMemo, useState } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import { useICPLCTargets } from '../hooks/useICPLCTargets.js'
import DocumentationOverview from '../components/DocumentationOverview.jsx'
import { deriveReadiness, isConfirmedOrReady } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { ATTENTION_CATEGORIES, attentionCategoryKeys } from '../lib/documentationRules.js'
import { needsAttentionNow } from '../lib/attentionModel.js'
import { isActiveParticipant } from '../lib/reconciliation.js'

/** Subgroup label; hover / focus / tap shows who is in it (click a name to open their profile). */
function SubgroupMembers({ row, onOpen }) {
  const [open, setOpen] = useState(false)
  // Registered first, then not registered; alphabetical within each.
  const members = [...row.members].sort((a, b) => (b.registered - a.registered) || (a.name || '').localeCompare(b.name || ''))
  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${row.subgroup || 'Unassigned'}: show ${row.total} member${row.total === 1 ? '' : 's'}`}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => { if (!e.currentTarget.parentElement.contains(e.relatedTarget)) setOpen(false) }}
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: 'inherit', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
      >
        {row.subgroup || <em style={{ color: 'var(--icplc-text-muted)', fontWeight: 400 }}>Unassigned</em>}
      </button>
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 4, minWidth: 220, maxWidth: 300,
            maxHeight: 280, overflowY: 'auto', background: '#fff', border: '1px solid var(--icplc-border, #E5E7EB)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', padding: 8, fontWeight: 400,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--icplc-text-soft)', padding: '2px 6px 6px' }}>
            {row.subgroup || 'Unassigned'} · {row.total}
          </div>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m.id)}
              style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', padding: '5px 6px', borderRadius: 6, font: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F1EDFA' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              <span>{m.name}</span>
              <span aria-label={m.registered ? 'Registered' : 'Not registered'} style={{ color: m.registered ? '#16A34A' : '#DC2626', fontSize: 12 }}>
                {m.registered ? '✓' : '✕'}
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

export default function OverviewPage({ canWrite, onShowPeople }) {
  const { config, activeProfileId, activeProfileTab, closeProfile, openProfile, setFilters } = useICPLC()
  const eventId = config?.id
  const { participants, ambiguousRegistrations, isLoading } = useICPLCWorkingList(eventId)
  const targets = useICPLCTargets(eventId)

  const stats = useMemo(() => {
    const active = participants.filter(isActiveParticipant)
    const total = active.length
    const registered = active.filter((p) => p.registration_link_status === 'registered').length
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0)
    const attention = new Map()
    const readinessCounts = { ready: 0, waiting_itinerary: 0, in_progress: 0, action_required: 0, blocked: 0, unknown: 0 }
    for (const p of active) {
      for (const key of attentionCategoryKeys(p)) attention.set(key, (attention.get(key) || 0) + 1)
      const r = deriveReadiness(p).readiness
      readinessCounts[r] = (readinessCounts[r] || 0) + 1
    }
    const ready = readinessCounts.ready
    // A Ready person counts as Confirmed (derived, never persisted).
    const confirmed = active.filter((p) => isConfirmedOrReady(p)).length
    // Readiness counts stay data-only; Needs Attention also skips people whose only reasons are missing information staff already reviewed.
    const needsAttention = active.filter(needsAttentionNow).length
    return {
      total, registered, confirmed, ready, needsAttention,
      registeredPct: pct(registered), confirmedPct: pct(confirmed), readyPct: pct(ready),
      needsAttentionPct: pct(needsAttention),
      attention,
      readinessCounts,
      active,
    }
  }, [participants])

  const subgroupRows = useMemo(() => {
    const groups = new Map()
    for (const p of stats.active) {
      const key = p.subgroup || ''
      if (!groups.has(key)) groups.set(key, { subgroup: key, total: 0, registered: 0, confirmed: 0, confirming: 0, members: [] })
      const g = groups.get(key)
      g.total += 1
      g.members.push({ id: p.id, name: p.full_name, registered: p.registration_link_status === 'registered' })
      if (p.registration_link_status === 'registered') g.registered += 1
      if (isConfirmedOrReady(p)) g.confirmed += 1
      else if (p.participation_status === 'likely') g.confirming += 1
    }
    return [...groups.values()].sort((x, y) => (!x.subgroup) - (!y.subgroup) || x.subgroup.localeCompare(y.subgroup))
  }, [stats.active])

  // Clear every documentation filter, then apply the one that was clicked so the People count matches the tile.
  const DOC_FILTER_FIELDS = ['readiness', 'documentation', 'time_risk', 'passport_readiness', 'passport_region', 'visa_requirement', 'visa_process_status', 'assistance', 'attention_state', 'flight_status']
  function showDocumentationInWorkingList(patch) {
    setFilters((prev) => ({
      ...prev, search: '', working_list_view: 'all', subgroup: [],
      ...Object.fromEntries(DOC_FILTER_FIELDS.map((f) => [f, []])),
      ...patch,
    }))
    onShowPeople?.()
  }

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
          label="Registrations"
          value={stats.registered}
          sub={`out of ${stats.total} on working list`}
          pct={stats.registeredPct}
          barColor="var(--icplc-green)"
          onClick={() => {
            setFilters((prev) => ({ ...prev, working_list_view: 'registered' }))
            onShowPeople?.()
          }}
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

      {/* Documentation */}
      <DocumentationOverview
        participants={stats.active}
        targets={targets}
        onOpenPeople={showDocumentationInWorkingList}
      />

      {/* By Subgroup */}
      <div className="icplc-overview-section">
        <h3 className="icplc-overview-section-title">By Subgroup</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="icplc-table icplc-subgroup-table">
            <thead>
              <tr>
                <th>Subgroup</th>
                <th>Registrations</th>
                <th>Confirmed / Confirming</th>
              </tr>
            </thead>
            <tbody>
              {subgroupRows.map((row) => (
                <tr key={row.subgroup || 'unassigned'}>
                  <td style={{ fontWeight: 600 }}>
                    <SubgroupMembers row={row} onOpen={openProfile} />
                  </td>
                  <td className="icplc-mono">
                    {row.registered} <span style={{ color: 'var(--icplc-text-soft)' }}>/ {row.total}</span>
                  </td>
                  <td className="icplc-mono">
                    <span style={{ color: 'var(--icplc-green)' }}>{row.confirmed}</span>
                    <span style={{ color: 'var(--icplc-text-soft)' }}> / {row.confirmed + row.confirming}</span>
                  </td>
                </tr>
              ))}
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
  { key: 'waiting_itinerary', label: 'Waiting on itinerary', color: '#0EA5E9' },
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
