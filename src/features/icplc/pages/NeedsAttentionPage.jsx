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

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ height: 80, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  )

  if (error) return (
    <div style={{
      border: '1px solid #F3BDB8', borderRadius: 8, padding: '16px 20px',
      background: '#FEF2F2', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>⚠</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Failed to load attention items</div>
        <div style={{ fontSize: 12, color: '#B91C1C' }}>
          {error?.message || 'An error occurred. Please refresh the page.'}
        </div>
      </div>
    </div>
  )

  if (!cohorts.length && !ambiguousRegistrations.length) return (
    <div style={{
      padding: '48px 20px', textAlign: 'center',
      border: '1px dashed var(--border)', borderRadius: 8,
      color: 'var(--text-secondary)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>All clear</div>
      <div style={{ fontSize: 13 }}>No items need attention right now.</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {ambiguousRegistrations.length > 0 && (
        <section aria-labelledby="attn-ambiguous">
          <h3 id="attn-ambiguous" style={headingStyle}>
            Ambiguous Registration Match <span style={countStyle}>{ambiguousRegistrations.length}</span>
          </h3>
          <div style={descStyle}>
            These registrations could belong to an existing participant. They are not linked and no duplicate was created — review them in the Working List's Registration Sources segment.
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {ambiguousRegistrations.slice(0, 20).map((r) => (
              <li key={r.id}>{registrationDisplayName(r) || r.email || r.id}{r.email ? ` — ${r.email}` : ''}</li>
            ))}
          </ul>
        </section>
      )}

      {cohorts.map((c) => {
        const severity = CATEGORY_SEVERITY[c.key] || 'warn'
        const borderColor = SEVERITY_BORDER[severity]
        return (
        <section key={c.key} aria-labelledby={`attn-${c.key}`}>
          <div style={{
            marginBottom: 12,
            borderLeft: `3px solid ${borderColor}`,
            paddingLeft: 12,
          }}>
            <h3 id={`attn-${c.key}`} style={headingStyle}>
              {c.label} <span style={countStyle}>{c.participants.length}</span>
              {c.informational && <span style={{ ...countStyle, marginLeft: 6 }}>Informational</span>}
            </h3>
            <div style={descStyle}>{c.description}</div>
          </div>
          <ParticipantTable participants={c.participants} loading={false} profileTab={c.section} />
        </section>
        )
      })}

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

const SEVERITY_BORDER = {
  danger: '#C94830',
  warn: '#C97820',
  info: '#2563EB',
}

const CATEGORY_SEVERITY = {
  registration_missing: 'danger',
  not_registered: 'danger',
  canadian_status_unknown: 'warn',
  canadian_status_review: 'warn',
  pr_card: 'warn',
  study_permit: 'warn',
  pgwp: 'warn',
  work_permit: 'warn',
  passport_incomplete: 'danger',
  non_ecowas_review: 'info',
  visa_unknown: 'warn',
  visa_not_started: 'warn',
  visa_blocked: 'danger',
  travel_incomplete: 'warn',
}

const headingStyle = { margin: '0 0 4px', fontSize: 15, fontWeight: 600 }
const descStyle = { fontSize: 12, color: 'var(--text-secondary)' }
const countStyle = { marginLeft: 8, fontSize: 12, fontWeight: 400, background: 'var(--surface-2)', borderRadius: 10, padding: '1px 8px' }
