import { effectiveCanadaDocReadiness, effectiveAssistanceRequested } from '../../lib/cmpDocumentation.js'
import React, { useId, useState } from 'react'
import { useAuth } from '../../../../hooks/useAuth'
import { useUpdateProfile } from '../../hooks/useICPLCProfile.js'
import { Home, BookOpen, Globe, ListChecks, ClipboardCheck } from 'lucide-react'
import { Card, EditButton } from './tabUi.jsx'
import Badge from '../../../../components/ui/Badge.jsx'
import {
  DOCUMENT_READINESS,
  DOCUMENT_READINESS_LABELS,
  DOCUMENT_TYPE_LABELS,
  RESIDENCY_STATUS,
  RESIDENCY_STATUS_LABELS,
} from '../../../registration/icplcDocReadiness.js'
import { overrideFieldsForEdit } from '../../lib/fieldAuthority.js'
import { useICPLCTargets } from '../../hooks/useICPLCTargets.js'
import {
  deriveDocumentationActions,
  riskForTarget,
  ACTION_KIND,
  ACTION_KIND_LABELS,
  RISK_LABELS,
} from '../../lib/documentationRisk.js'
import { deriveDocumentation, SUPPORTING_DOC, documentationMissingInfo, documentationReviewFingerprint, isDocumentationReviewAcknowledged, isDocumentationReviewStale } from '../../lib/documentationRules.js'
import { useUserName } from '../../hooks/useUserName.js'
import {
  ECOWAS_MEMBER_COUNTRIES,
  PASSPORT_REGION,
  PASSPORT_REGION_LABELS,
} from '../../lib/passportRegion.js'

const PASSPORT_READINESS_LABELS = {
  unknown: 'Unknown', ready: 'Ready', renewal_needed: 'Renewal needed',
  renewal_in_progress: 'Renewal in progress', no_passport: 'No passport',
  unsure: 'Unsure', issue: 'Issue',
}
const VISA_REQUIREMENT_LABELS = { review: 'Unknown / needs review', required: 'Required', not_required: 'Not required' }
const VISA_PROCESS_LABELS = {
  not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted',
  processing: 'Processing', approved: 'Approved / ready', issue: 'Blocked / refused / attention',
  not_applicable: 'Not applicable',
}

const PASSPORT_TONES = {
  ready: 'done', renewal_needed: 'at_risk', renewal_in_progress: 'in_progress',
  no_passport: 'blocked', unsure: 'warn', issue: 'blocked', unknown: 'mute',
}
const VISA_PROCESS_TONES = {
  not_started: 'mute', in_progress: 'in_progress', submitted: 'in_progress', processing: 'in_progress',
  approved: 'done', issue: 'blocked', not_applicable: 'mute',
}
const DOC_READINESS_TONES = {
  READY: 'done', NOT_APPLICABLE: 'mute', RENEWAL_IN_PROGRESS: 'in_progress',
  RENEWAL_NEEDED: 'at_risk', ISSUE: 'blocked', UNKNOWN: 'mute',
}
const REGION_TONES = { ECOWAS: 'done', NON_ECOWAS: 'in_progress', UNKNOWN: 'mute' }
const RISK_TONES = { overdue: 'blocked', due_soon: 'at_risk', review: 'warn', on_track: 'done' }
const KIND_ORDER = [ACTION_KIND.PARTICIPANT, ACTION_KIND.TEAM, ACTION_KIND.REVIEW]

const triFrom = (v) => (v === true ? 'yes' : v === false ? 'no' : '')
const triTo = (v) => (v === 'yes' ? true : v === 'no' ? false : null)

function formatDate(d) {
  if (!d) return null
  const [y, m, day] = String(d).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function TimeRisk({ target, targetName }) {
  if (!target) return <Value muted>No {targetName} set in Settings</Value>
  const risk = riskForTarget(target)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Value>{formatDate(target)}</Value>
      {risk && <Badge tone={RISK_TONES[risk.level]} label={risk.level === 'on_track' ? `${risk.days} days to go` : RISK_LABELS[risk.level]} />}
    </div>
  )
}

export default function DocumentationTab({ participant, canWrite }) {
  const { profile: authProfile } = useAuth()
  const updateProfile = useUpdateProfile()
  const uid = useId()
  const targets = useICPLCTargets(participant.event_id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => formFrom(participant))

  function startEdit() {
    setForm(formFrom(participant))
    setEditing(true)
  }

  async function handleSave() {
    const { assistance, ...rest } = form
    const changed = {}
    for (const key of Object.keys(rest)) {
      const val = typeof rest[key] === 'string' ? (rest[key].trim() || null) : rest[key]
      const cur = participant[key] || null
      if (val !== cur) changed[key] = val
    }
    // Assistance is tri-state (unknown / yes / no); only write it when the person actually changed it.
    if (assistance !== triFrom(effectiveAssistanceRequested(participant))) {
      changed.documentation_assistance_requested = triTo(assistance)
    }
    if (Object.keys(changed).length === 0) { setEditing(false); return }

    const overrideFields = overrideFieldsForEdit(Object.keys(changed))
    await updateProfile.mutateAsync({
      id: participant.id,
      fields: changed,
      setOverride: overrideFields.length > 0,
      overrideFields,
      userId: authProfile?.id,
    })
    setEditing(false)
  }

  // While editing, preview the derived dimensions from the draft values.
  const { assistance: draftAssistance, ...draftFields } = form
  const view = editing ? { ...participant, ...draftFields, documentation_assistance_requested: triTo(draftAssistance) } : participant
  const doc = deriveDocumentation(view)
  const followUp = deriveDocumentationActions(view, { targets })
  const assistanceRaw = participant.source_values?.cmp_documentation?.assistance_requested
  const missingInfo = documentationMissingInfo(participant)
  const reviewed = isDocumentationReviewAcknowledged(participant)
  const reviewStale = isDocumentationReviewStale(participant)
  const reviewer = useUserName(participant.documentation_review_by)

  // "Mark reviewed" only records that staff looked despite the gaps: nothing is verified, filled in, or cleared.
  async function setReview(on) {
    await updateProfile.mutateAsync({
      id: participant.id,
      fields: on
        ? {
            documentation_review_by: authProfile?.id ?? null,
            documentation_review_at: new Date().toISOString(),
            // The state that was reviewed. The review stops applying if what is missing later changes.
            documentation_review_fingerprint: documentationReviewFingerprint(participant),
          }
        : { documentation_review_by: null, documentation_review_at: null, documentation_review_fingerprint: null },
    })
  }
  const isCitizen = doc.canadian.status === RESIDENCY_STATUS.CANADIAN_CITIZEN
  const canEdit = editing && canWrite
  const overridden = (f) => participant.override_fields?.[f]?.overridden

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
        Canadian status, passport and visa are tracked independently. Changing one never changes another.
      </p>

      {/* What needs doing, and by whom */}
      <Card icon={ListChecks} title="Follow-up">
        {followUp.items.length === 0 ? (
          <Value muted>Nothing to follow up on from documentation.</Value>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {KIND_ORDER.map((kind) => {
              const rows = followUp.items.filter((i) => i.kind === kind)
              if (!rows.length) return null
              return (
                <div key={kind}>
                  <div className="icplc-label">{ACTION_KIND_LABELS[kind]}</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                    {rows.map((i) => (
                      <li key={i.id} style={{ fontSize: 13 }}>
                        {i.text}{' '}
                        {(i.level === 'overdue' || i.level === 'due_soon') && <Badge tone={RISK_TONES[i.level]} label={RISK_LABELS[i.level]} />}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
        <Why>Passport and Canadian-document items are readiness indicators only. ICPLC does not renew passports or Canadian immigration documents; the active assistance is the Nigerian visa.</Why>
      </Card>

      {(missingInfo.length > 0 || reviewed || reviewStale) && (
        <Card icon={ClipboardCheck} title="Documentation information">
          {missingInfo.length > 0 ? (
            <>
              <div className="icplc-label">Still missing</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                {missingInfo.map((m) => <li key={m.key} style={{ fontSize: 13 }}>{m.label}</li>)}
              </ul>
            </>
          ) : (
            <Value muted>Nothing is missing now.</Value>
          )}
          {reviewed ? (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Badge tone="done" label="Staff review completed" />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {reviewer ? `by ${reviewer} ` : ''}{new Date(participant.documentation_review_at).toLocaleDateString()}
              </span>
              {canWrite && <button type="button" className="icplc-btn" disabled={updateProfile.isPending} onClick={() => setReview(false)}>Undo review</button>}
            </div>
          ) : (
            <>
              {reviewStale && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Reviewed {new Date(participant.documentation_review_at).toLocaleDateString()}, but what is missing has changed since, so it needs another look.
                </div>
              )}
              {canWrite && missingInfo.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="icplc-btn" disabled={updateProfile.isPending} onClick={() => setReview(true)}>
                    ✓ Mark reviewed
                  </button>
                </div>
              )}
            </>
          )}
          <Why>
            Marking reviewed records that staff looked at what is missing right now, and that no further follow-up is needed for it.
            It does not verify any document, fill in any value, change readiness, or clear a registration, visa, passport or
            Canadian-document problem. If something new goes missing later, it needs review again.
          </Why>
        </Card>
      )}

      {/* 1 + 2. Canadian status and its document */}
      <Card icon={Home} title="Canadian status & document" action={canWrite && !editing ? <EditButton onClick={startEdit} /> : null}>
        <div className="icplc-field-grid">
          <Field id={`${uid}-status`} label="Canadian Status">
            {canEdit ? (
              <select
                id={`${uid}-status`}
                className="icplc-input"
                value={form.canada_residency_status}
                onChange={(e) => {
                  const next = e.target.value
                  setForm((f) => {
                    let readiness = f.canada_status_document_readiness
                    if (next === RESIDENCY_STATUS.CANADIAN_CITIZEN) readiness = DOCUMENT_READINESS.NOT_APPLICABLE
                    else if (readiness === DOCUMENT_READINESS.NOT_APPLICABLE) readiness = DOCUMENT_READINESS.UNKNOWN
                    return { ...f, canada_residency_status: next, canada_status_document_readiness: readiness }
                  })
                }}
              >
                <option value="">Not set</option>
                {Object.values(RESIDENCY_STATUS).map((v) => (
                  <option key={v} value={v}>{RESIDENCY_STATUS_LABELS[v]}</option>
                ))}
              </select>
            ) : (
              <Value>{RESIDENCY_STATUS_LABELS[participant.canada_residency_status] || 'Not set'}</Value>
            )}
          </Field>
          <Field label="Required Canadian Document">
            <Value>{doc.canadian.status ? DOCUMENT_TYPE_LABELS[doc.canadian.docType] : 'Set Canadian status'}</Value>
          </Field>
          <Field id={`${uid}-docready`} label="Document Readiness">
            {canEdit ? (
              <select
                id={`${uid}-docready`}
                className="icplc-input"
                value={form.canada_status_document_readiness}
                disabled={!form.canada_residency_status || isCitizen}
                onChange={(e) => setForm((f) => ({ ...f, canada_status_document_readiness: e.target.value }))}
              >
                <option value="">Not set</option>
                {Object.values(DOCUMENT_READINESS).map((v) => (
                  <option key={v} value={v}>{DOCUMENT_READINESS_LABELS[v]}</option>
                ))}
              </select>
            ) : doc.canadian.selfReport.concern ? (
              <Badge tone="warn" label="Review needed (self-reported)" />
            ) : doc.canadian.required ? (
              <Badge
                tone={DOC_READINESS_TONES[effectiveCanadaDocReadiness(participant)] || 'mute'}
                label={DOCUMENT_READINESS_LABELS[effectiveCanadaDocReadiness(participant)] || 'Not set'}
              />
            ) : (
              <Value>Not applicable</Value>
            )}
          </Field>
          <Field label="Valid through the required period (self-reported)">
            <Value muted={doc.canadian.selfReport.answer === null}>
              {doc.canadian.selfReport.answer === 'yes' ? 'Yes'
                : doc.canadian.selfReport.answer === 'no' ? 'No — staff review needed'
                : 'Not answered'}
            </Value>
          </Field>
          <Field label="Authority">
            <Value muted>
              {overridden('canada_residency_status') || overridden('canada_status_document_readiness')
                ? 'Staff override active'
                : 'Staff-managed field'}
            </Value>
          </Field>
        </div>
        <Why>{doc.canadian.why}</Why>
        {doc.canadian.selfReport.concern && (
          <Why>The participant reported that their Canadian immigration or residency documents may not stay valid. Which document, and whether anything has lapsed, is not known. Staff review it; ICPLC does not renew these documents.</Why>
        )}
      </Card>

      {/* 3-6. Passport */}
      <Card icon={BookOpen} title="Passport">
        <div className="icplc-field-grid">
          <Field id={`${uid}-country`} label="Passport Country">
            {canEdit ? (
              <>
                <input
                  id={`${uid}-country`}
                  className="icplc-input"
                  list={`${uid}-countries`}
                  value={form.passport_country}
                  onChange={(e) => setForm((f) => ({ ...f, passport_country: e.target.value }))}
                  placeholder="e.g. Ghana"
                  autoComplete="off"
                />
                <datalist id={`${uid}-countries`}>
                  {ECOWAS_MEMBER_COUNTRIES.map((c) => <option key={c} value={c} />)}
                </datalist>
              </>
            ) : (
              <Value>{participant.passport_country || 'Not set'}</Value>
            )}
          </Field>
          <Field label="Passport Region">
            <Badge tone={REGION_TONES[doc.passport.region]} label={PASSPORT_REGION_LABELS[doc.passport.region]} />
          </Field>
          <Field id={`${uid}-pready`} label="Passport Readiness">
            {canEdit ? (
              <select
                id={`${uid}-pready`}
                className="icplc-input"
                value={form.passport_readiness}
                onChange={(e) => setForm((f) => ({ ...f, passport_readiness: e.target.value }))}
              >
                {Object.entries(PASSPORT_READINESS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <Badge
                tone={PASSPORT_TONES[participant.passport_readiness] || 'mute'}
                label={PASSPORT_READINESS_LABELS[participant.passport_readiness] || participant.passport_readiness}
              />
            )}
          </Field>
          {['renewal_in_progress', 'renewal_needed', 'no_passport'].includes(participant.passport_readiness) && doc.visa.requirement !== 'not_required' && (
            <Field label="Passport ready target">
              <TimeRisk target={targets.passportTarget} targetName="passport-ready target" />
            </Field>
          )}
          <Field label="Additional Passport Document">
            {doc.passport.supportingDoc === SUPPORTING_DOC.NOT_REQUIRED && <Value>Not required</Value>}
            {doc.passport.supportingDoc === SUPPORTING_DOC.STAFF_REVIEW && <Badge tone="in_progress" label="Staff review" />}
            {doc.passport.supportingDoc === SUPPORTING_DOC.UNKNOWN && <Value muted>Unknown</Value>}
          </Field>
        </div>
        <Why>{doc.passport.why}</Why>
        <Why>The participant is responsible for obtaining a valid passport. Nexus only tracks whether it may delay their visa.</Why>
        {doc.passport.region === PASSPORT_REGION.ECOWAS && (
          <Why>An ECOWAS passport also means no destination visa unless staff set one — see Visa below.</Why>
        )}
      </Card>

      {/* 7-8. Visa */}
      <Card icon={Globe} title="Destination visa">
        <div className="icplc-field-grid">
          <Field id={`${uid}-vreq`} label="Visa Requirement">
            {canEdit ? (
              <select
                id={`${uid}-vreq`}
                className="icplc-input"
                value={form.visa_requirement}
                onChange={(e) => setForm((f) => ({ ...f, visa_requirement: e.target.value }))}
              >
                {Object.entries(VISA_REQUIREMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <Value>{VISA_REQUIREMENT_LABELS[doc.visa.requirement] || doc.visa.requirement}</Value>
            )}
          </Field>
          <Field id={`${uid}-vproc`} label="Visa Process">
            {canEdit ? (
              <select
                id={`${uid}-vproc`}
                className="icplc-input"
                value={form.visa_process_status}
                onChange={(e) => setForm((f) => ({ ...f, visa_process_status: e.target.value }))}
              >
                {Object.entries(VISA_PROCESS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : doc.visa.requirement === 'not_required' ? (
              <Value>Not applicable — no visa needed</Value>
            ) : (
              <Badge
                tone={VISA_PROCESS_TONES[participant.visa_process_status] || 'mute'}
                label={VISA_PROCESS_LABELS[participant.visa_process_status] || participant.visa_process_status}
              />
            )}
          </Field>
          {doc.visa.requirement === 'required' && ['not_started', 'in_progress'].includes(doc.visa.process) && (
            <Field label="Visa target date">
              <TimeRisk target={targets.visaTarget} targetName="visa target date" />
            </Field>
          )}
          <Field id={`${uid}-assist`} label="Visa / travel documentation assistance requested">
            {canEdit ? (
              <select
                id={`${uid}-assist`}
                className="icplc-input"
                value={form.assistance}
                onChange={(e) => setForm((f) => ({ ...f, assistance: e.target.value }))}
              >
                <option value="">Unknown</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <Value muted={effectiveAssistanceRequested(participant) === null}>
                {effectiveAssistanceRequested(participant) === true ? 'Yes'
                  : effectiveAssistanceRequested(participant) === false ? 'No'
                  : 'Unknown'}
                {assistanceRaw && !overridden('documentation_assistance_requested') ? ' · from CMP form' : ''}
                {overridden('documentation_assistance_requested') ? ' · staff override' : ''}
              </Value>
            )}
          </Field>
        </div>
        <Why>{doc.visa.why} Visa is set independently of Canadian status. Assistance is a follow-up flag and does not change readiness.</Why>
      </Card>

      {updateProfile.isError && (
        <div role="alert" style={{ fontSize: 12, color: '#991B1B' }}>
          Could not save: {updateProfile.error?.message || 'unknown error'}
        </div>
      )}

      {canWrite && editing && (
        <div className="icplc-actions">
          <button type="button" onClick={handleSave} disabled={updateProfile.isPending} className="icplc-btn icplc-btn-primary">
            {updateProfile.isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="icplc-btn">Cancel</button>
        </div>
      )}
    </div>
  )
}

function formFrom(p) {
  return {
    canada_residency_status: p.canada_residency_status || '',
    canada_status_document_readiness: p.canada_status_document_readiness || '',
    passport_country: p.passport_country || '',
    passport_readiness: p.passport_readiness,
    visa_requirement: p.visa_requirement,
    visa_process_status: p.visa_process_status,
    assistance: triFrom(effectiveAssistanceRequested(p)),
  }
}

function Field({ id, label, children }) {
  return (
    <div>
      {id ? <label htmlFor={id} className="icplc-label">{label}</label> : <div className="icplc-label">{label}</div>}
      {children}
    </div>
  )
}

function Value({ children, muted }) {
  return <div style={{ fontSize: 13, color: muted ? 'var(--text-secondary)' : undefined }}>{children}</div>
}

function Why({ children }) {
  return <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{children}</p>
}

