import React, { useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import ParticipantTable from '../components/ParticipantTable.jsx'
import { ATTENTION_CATEGORIES, attentionCategoryKeys } from '../lib/documentationRules.js'
import { registrationDisplayName } from '../lib/reconciliation.js'

/**
 * Needs Attention — every category is derived from real participant state
 * (see attentionCategoryKeys). Opening a participant lands on the relevant profile tab.
 */
export default function NeedsAttentionPage({ canWrite }) {
  const { config, activeProfileId, activeProfileTab, closeProfile } = useICPLC()
  const { participants, ambiguousRegistrations, isLoading, error } = useICPLCWorkingList(config?.id)

  const cohorts = useMemo(() => {
    const byKey = new Map(ATTENTION_CATEGORIES.map((c) => [c.key, []]))
    for (const p of participants) {
      for (const key of attentionCategoryKeys(p)) byKey.get(key)?.push(p)
    }
    return ATTENTION_CATEGORIES
      .map((c) => ({ ...c, participants: byKey.get(c.key) }))
      .filter((c) => c.participants.length > 0)
  }, [participants])

  if (isLoading) return <div role="status" style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading…</div>
  if (error) return <div role="alert" style={{ padding: 40, color: 'var(--text-secondary)' }}>Failed to load attention items.</div>
  if (!cohorts.length && !ambiguousRegistrations.length) {
    return (
      <div role="status" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
        No items need attention right now.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {ambiguousRegistrations.length > 0 && (
        <section aria-labelledby="attn-ambiguous">
          <h3 id="attn-ambiguous" style={headingStyle}>
            Ambiguous Registration Match <span style={countStyle}>{ambiguousRegistrations.length}</span>
          </h3>
          <div style={descStyle}>
            These registrations could belong to an existing participant. They are not linked and no duplicate was created — review them in the Registrations tab.
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {ambiguousRegistrations.slice(0, 20).map((r) => (
              <li key={r.id}>{registrationDisplayName(r) || r.email || r.id}{r.email ? ` — ${r.email}` : ''}</li>
            ))}
          </ul>
        </section>
      )}

      {cohorts.map((c) => (
        <section key={c.key} aria-labelledby={`attn-${c.key}`}>
          <div style={{ marginBottom: 12 }}>
            <h3 id={`attn-${c.key}`} style={headingStyle}>
              {c.label} <span style={countStyle}>{c.participants.length}</span>
              {c.informational && <span style={{ ...countStyle, marginLeft: 6 }}>Informational</span>}
            </h3>
            <div style={descStyle}>{c.description}</div>
          </div>
          <ParticipantTable participants={c.participants} loading={false} profileTab={c.section} />
        </section>
      ))}

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

const headingStyle = { margin: '0 0 4px', fontSize: 15, fontWeight: 600 }
const descStyle = { fontSize: 12, color: 'var(--text-secondary)' }
const countStyle = { marginLeft: 8, fontSize: 12, fontWeight: 400, background: 'var(--surface-2)', borderRadius: 10, padding: '1px 8px' }
