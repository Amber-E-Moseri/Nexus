import React, { useMemo } from 'react'
import { deriveDocumentationActions, followUpFirst, RISK_LABELS } from '../lib/documentationRisk.js'
import { effectiveAssistanceRequested } from '../lib/cmpDocumentation.js'
import { attentionCategoryKeys, effectiveVisaRequirement } from '../lib/documentationRules.js'
import { operationalSummary } from '../lib/attentionModel.js'

// Compact, operational documentation counts for the Overview. Every count opens People with that filter.
// Passport and Canadian-document counts are readiness indicators only; the visa rows are the active workflow.

const VISA_STEPS = [
  ['not_started', 'Not started'],
  ['in_progress', 'In progress'],
  ['submitted', 'Submitted'],
  ['processing', 'Processing'],
  ['approved', 'Approved'],
  ['issue', 'Issue'],
]

const PASSPORT_NOT_READY = ['renewal_in_progress', 'no_passport', 'renewal_needed']

const tileStyle = (hot) => ({
  justifyContent: 'space-between', textAlign: 'left', padding: '8px 12px', minHeight: 40, gap: 10,
  ...(hot ? { borderColor: 'var(--icplc-orange)' } : {}),
})

function Tile({ label, count, hot, onClick }) {
  return (
    <button type="button" className="icplc-btn" onClick={onClick} disabled={count === 0} style={tileStyle(hot && count > 0)}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <strong style={{ fontSize: 14, color: count > 0 && hot ? 'var(--icplc-orange)' : 'var(--icplc-text)' }}>{count}</strong>
    </button>
  )
}

function Group({ title, note, children }) {
  return (
    <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--icplc-text-soft)' }}>{title}</div>
      {note && <div style={{ fontSize: 11, color: 'var(--icplc-text-muted)' }}>{note}</div>}
      <div style={{ display: 'grid', gap: 6 }}>{children}</div>
    </div>
  )
}

export default function DocumentationOverview({ participants, targets, onOpenPeople, onOpenProfile }) {
  const ctx = useMemo(() => ({ targets }), [targets])

  const data = useMemo(() => {
    const visa = Object.fromEntries(VISA_STEPS.map(([k]) => [k, 0]))
    let passportNotReady = 0
    let canadianReview = 0
    let assistance = 0
    let dueSoon = 0
    let overdue = 0
    const att = { registrationMissing: 0, confirmedRegistrationMissing: 0, confirmedNeedsAttention: 0, flightMissing: 0, flightNotRequired: 0, docsIncomplete: 0, docsReviewed: 0 }
    for (const p of participants) {
      const s = operationalSummary(p)
      if (s.urgent) att.registrationMissing += 1
      if (s.confirmed && s.urgent) att.confirmedRegistrationMissing += 1
      if (s.confirmed && s.needsAttention) att.confirmedNeedsAttention += 1
      if (s.flight === 'missing') att.flightMissing += 1
      if (s.flight === 'not_required') att.flightNotRequired += 1
      if (s.docsIncomplete) att.docsIncomplete += 1
      if (s.docsReviewed) att.docsReviewed += 1
      if (PASSPORT_NOT_READY.includes(p.passport_readiness)) passportNotReady += 1
      if (attentionCategoryKeys(p).includes('canadian_docs_review')) canadianReview += 1
      if (effectiveAssistanceRequested(p) === true) assistance += 1
      if (effectiveVisaRequirement(p) === 'required') {
        const step = p.visa_process_status || 'not_started'
        if (step in visa) visa[step] += 1
      }
      const { worst } = deriveDocumentationActions(p, ctx)
      if (worst === 'due_soon') dueSoon += 1
      if (worst === 'overdue') overdue += 1
    }
    return { visa, passportNotReady, canadianReview, assistance, dueSoon, overdue, att, first: followUpFirst(participants, ctx, 5) }
  }, [participants, ctx])

  const noTargets = !targets.visaTarget && !targets.passportTarget

  return (
    <div className="icplc-overview-section">
      <h3 className="icplc-overview-section-title">Documentation</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <Group title="Attention" note="Confirmed people can also need attention">
          <button
            type="button"
            className="icplc-btn"
            disabled={data.att.registrationMissing === 0}
            onClick={() => onOpenPeople({ attention_state: ['registration_missing'] })}
            style={{ ...tileStyle(false), background: data.att.registrationMissing ? '#FBE4E2' : undefined, borderColor: data.att.registrationMissing ? '#DC2626' : undefined, color: data.att.registrationMissing ? '#B42318' : undefined }}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>URGENT · Registration missing</span>
            <strong style={{ fontSize: 14 }}>{data.att.registrationMissing}</strong>
          </button>
          <Tile label="Confirmed + registration missing" count={data.att.confirmedRegistrationMissing} hot onClick={() => onOpenPeople({ attention_state: ['confirmed_registration_missing'] })} />
          <Tile label="Confirmed + needs attention" count={data.att.confirmedNeedsAttention} hot onClick={() => onOpenPeople({ attention_state: ['confirmed_needs_attention'] })} />
          <Tile label="Flight missing" count={data.att.flightMissing} hot onClick={() => onOpenPeople({ flight_status: ['missing'] })} />
          <Tile label="Flight not required" count={data.att.flightNotRequired} onClick={() => onOpenPeople({ flight_status: ['not_required'] })} />
          <Tile label="Documentation information incomplete" count={data.att.docsIncomplete} hot onClick={() => onOpenPeople({ attention_state: ['docs_incomplete'] })} />
          <Tile label="Documentation review acknowledged" count={data.att.docsReviewed} onClick={() => onOpenPeople({ attention_state: ['docs_review_acknowledged'] })} />
        </Group>

        <Group title="Nigerian visa" note="People who need a visa">
          {VISA_STEPS.map(([key, label]) => (
            <Tile
              key={key}
              label={label}
              count={data.visa[key]}
              hot={key === 'not_started' || key === 'issue'}
              onClick={() => onOpenPeople({ visa_requirement: ['required'], visa_process_status: [key] })}
            />
          ))}
          <Tile label="Assistance requested" count={data.assistance} hot onClick={() => onOpenPeople({ assistance: ['requested'] })} />
        </Group>

        <Group title="Follow-up timing" note={noTargets ? 'Set the Visa Target Date in Settings' : 'From the visa and passport targets'}>
          <Tile label="Due soon" count={data.dueSoon} hot onClick={() => onOpenPeople({ time_risk: ['due_soon'] })} />
          <Tile label="Overdue" count={data.overdue} hot onClick={() => onOpenPeople({ time_risk: ['overdue'] })} />
        </Group>

        <Group title="Readiness risks" note="Indicators only">
          <Tile label="Passport not ready" count={data.passportNotReady} hot onClick={() => onOpenPeople({ passport_readiness: PASSPORT_NOT_READY })} />
          <Tile label="Canadian documents require review" count={data.canadianReview} hot onClick={() => onOpenPeople({ documentation: ['canadian_docs_review'] })} />
        </Group>

        <Group title="Follow up first">
          {data.first.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--icplc-text-soft)' }}>Nobody needs documentation follow-up right now.</div>
          ) : data.first.map((r) => (
            <button
              key={r.p.id}
              type="button"
              className="icplc-btn"
              onClick={() => onOpenProfile(r.p.id)}
              style={{ display: 'grid', gap: 2, textAlign: 'left', padding: '8px 12px', height: 'auto' }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {r.p.full_name}
                {r.worst && r.worst !== 'on_track' && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--icplc-orange)' }}>{RISK_LABELS[r.worst]}</span>}
              </span>
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--icplc-text-soft)' }}>{(r.items.find((i) => i.level === r.worst) || r.items[0])?.text}</span>
            </button>
          ))}
        </Group>
      </div>
    </div>
  )
}
