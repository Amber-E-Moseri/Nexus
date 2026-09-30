import React, { useMemo } from 'react'
import { deriveDocumentationActions } from '../lib/documentationRisk.js'
import { effectiveAssistanceRequested } from '../lib/cmpDocumentation.js'
import { attentionCategoryKeys, documentationActionRequired, effectiveVisaRequirement } from '../lib/documentationRules.js'

// A compact documentation health summary. It answers: how many people need documentation attention, why, is
// anything time-critical, and where to work it. The detail lives in the Working List, profiles and Documentation tab.
//
// Every number reuses the canonical models: the headline is documentationActionRequired() (documentation categories
// only, so registration, travel and informational items are never counted); the reasons are attentionCategoryKeys();
// timing is deriveDocumentationActions(). Nothing here is a second calculation.

const VISA_ACTION_KEYS = ['visa_unknown', 'visa_not_started', 'visa_blocked']

const chipStyle = {
  display: 'inline-flex', alignItems: 'baseline', gap: 8, padding: '5px 12px', minHeight: 32, height: 'auto',
}

function Chip({ label, count, hot, onClick }) {
  return (
    <button type="button" className="icplc-btn" onClick={onClick} style={{ ...chipStyle, ...(hot ? { borderColor: 'var(--icplc-orange)' } : {}) }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <strong style={{ fontSize: 14, color: hot ? 'var(--icplc-orange)' : 'var(--icplc-text)' }}>{count}</strong>
    </button>
  )
}

export default function DocumentationOverview({ participants, targets, onOpenPeople }) {
  const ctx = useMemo(() => ({ targets }), [targets])

  const data = useMemo(() => {
    const d = {
      attention: 0, visaAction: 0, passport: 0, canadian: 0, assistance: 0,
      dueSoon: 0, overdue: 0, visaCleared: 0, passportReady: 0, visaChasing: 0,
    }
    for (const p of participants) {
      if (documentationActionRequired(p)) d.attention += 1
      const keys = attentionCategoryKeys(p)
      if (keys.some((k) => VISA_ACTION_KEYS.includes(k))) d.visaAction += 1
      if (keys.includes('passport_incomplete')) d.passport += 1
      if (keys.includes('canadian_docs_review')) d.canadian += 1
      if (effectiveAssistanceRequested(p) === true) d.assistance += 1
      const { worst } = deriveDocumentationActions(p, ctx)
      if (worst === 'due_soon') d.dueSoon += 1
      if (worst === 'overdue') d.overdue += 1
      if (p.passport_readiness === 'ready') d.passportReady += 1
      if (effectiveVisaRequirement(p) === 'required') {
        if (p.visa_process_status === 'approved') d.visaCleared += 1
        if (['not_started', 'in_progress'].includes(p.visa_process_status || 'not_started')) d.visaChasing += 1
      }
    }
    return d
  }, [participants, ctx])

  const healthy = data.attention === 0
  const openAll = () => onOpenPeople(healthy ? {} : { documentation: ['action_required'] })
  // Only worth mentioning when timing would matter: somebody is still chasing a visa and no target is set.
  const showTargetHint = !targets?.visaTarget && !targets?.passportTarget && data.visaChasing > 0

  const reasons = [
    ['Visa action', data.visaAction, { documentation: VISA_ACTION_KEYS }],
    ['Passport attention', data.passport, { documentation: ['passport_incomplete'] }],
    ['Canadian documents require review', data.canadian, { documentation: ['canadian_docs_review'] }],
    ['Assistance requested', data.assistance, { assistance: ['requested'] }],
  ].filter(([, count]) => count > 0)

  const timing = [
    ['Due soon', data.dueSoon, { time_risk: ['due_soon'] }],
    ['Overdue', data.overdue, { time_risk: ['overdue'] }],
  ].filter(([, count]) => count > 0)

  const positives = [['Visa cleared', data.visaCleared], ['Passport ready', data.passportReady]].filter(([, n]) => n > 0)

  return (
    <div className="icplc-overview-section" data-testid="documentation-overview">
      <h3 className="icplc-overview-section-title">Documentation</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 12, rowGap: 2 }}>
          {healthy ? (
            <span style={{ fontSize: 15, fontWeight: 600 }}>No documentation issues requiring attention</span>
          ) : (
            <>
              <button
                type="button"
                onClick={openAll}
                aria-label={`${data.attention} need attention`}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
              >
                <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: 'var(--icplc-orange)' }}>{data.attention}</span>
                <span style={{ fontSize: 15, fontWeight: 600, marginLeft: 8 }}>need attention</span>
              </button>
              <span style={{ fontSize: 12, color: 'var(--icplc-text-soft)' }}>Passport, visa, or Canadian-document follow-up</span>
            </>
          )}
        </div>

        {(reasons.length > 0 || timing.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {reasons.map(([label, count, filter]) => (
              <Chip key={label} label={label} count={count} onClick={() => onOpenPeople(filter)} />
            ))}
            {timing.map(([label, count, filter]) => (
              <Chip key={label} label={label} count={count} hot onClick={() => onOpenPeople(filter)} />
            ))}
          </div>
        )}

        {positives.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--icplc-text-soft)', display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
            {positives.map(([label, n]) => <span key={label}>{label} <strong style={{ color: 'var(--icplc-text)' }}>{n}</strong></span>)}
          </div>
        )}

        {showTargetHint && (
          <div style={{ fontSize: 11, color: 'var(--icplc-text-muted)' }}>Visa target date not set (Settings) — timing is not tracked.</div>
        )}

        <div>
          <button type="button" className="icplc-btn" onClick={openAll}>View documentation →</button>
        </div>
      </div>
    </div>
  )
}
