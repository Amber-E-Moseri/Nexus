import React, { useId, useState } from 'react'
import { useAuth } from '../../../../hooks/useAuth'
import { useUpdateProfile } from '../../hooks/useICPLCProfile.js'
import Badge from '../../../../components/ui/Badge.jsx'
import {
  DOCUMENT_READINESS,
  DOCUMENT_READINESS_LABELS,
  DOCUMENT_TYPE_LABELS,
  RESIDENCY_STATUS,
  RESIDENCY_STATUS_LABELS,
} from '../../../registration/icplcDocReadiness.js'
import { overrideFieldsForEdit } from '../../lib/fieldAuthority.js'
import { deriveDocumentation, SUPPORTING_DOC } from '../../lib/documentationRules.js'
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

export default function DocumentationTab({ participant, canWrite }) {
  const { profile: authProfile } = useAuth()
  const updateProfile = useUpdateProfile()
  const uid = useId()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => formFrom(participant))

  function startEdit() {
    setForm(formFrom(participant))
    setEditing(true)
  }

  async function handleSave() {
    const changed = {}
    for (const key of Object.keys(form)) {
      const val = typeof form[key] === 'string' ? (form[key].trim() || null) : form[key]
      const cur = participant[key] || null
      if (val !== cur) changed[key] = val
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
  const view = editing ? { ...participant, ...form } : participant
  const doc = deriveDocumentation(view)
  const isCitizen = doc.canadian.status === RESIDENCY_STATUS.CANADIAN_CITIZEN
  const canEdit = editing && canWrite
  const overridden = (f) => participant.override_fields?.[f]?.overridden

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
        Canadian status, passport and visa are tracked independently. Changing one never changes another.
      </p>

      {/* 1 + 2. Canadian status and its document */}
      <section aria-labelledby={`${uid}-ca`} style={sectionPanel('#EEF2FF', '#4C2A92')}>
        <h4 id={`${uid}-ca`} className="icplc-section-title" style={{ color: '#2D1B69' }}>Canadian status &amp; document</h4>
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
            ) : doc.canadian.required ? (
              <Badge
                tone={DOC_READINESS_TONES[participant.canada_status_document_readiness] || 'mute'}
                label={DOCUMENT_READINESS_LABELS[participant.canada_status_document_readiness] || 'Not set'}
              />
            ) : (
              <Value>Not applicable</Value>
            )}
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
      </section>

      {/* 3-6. Passport */}
      <section aria-labelledby={`${uid}-pp`} style={sectionPanel('#F0FDF4', '#2D8653')}>
        <h4 id={`${uid}-pp`} className="icplc-section-title" style={{ color: '#1A5C38' }}>Passport</h4>
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
          <Field label="Additional Passport Document">
            {doc.passport.supportingDoc === SUPPORTING_DOC.NOT_REQUIRED && <Value>Not required</Value>}
            {doc.passport.supportingDoc === SUPPORTING_DOC.STAFF_REVIEW && <Badge tone="in_progress" label="Staff review" />}
            {doc.passport.supportingDoc === SUPPORTING_DOC.UNKNOWN && <Value muted>Unknown</Value>}
          </Field>
        </div>
        <Why>{doc.passport.why}</Why>
        {doc.passport.region === PASSPORT_REGION.ECOWAS && (
          <Why>ECOWAS classification does not decide the destination visa — see Visa below.</Why>
        )}
      </section>

      {/* 7-8. Visa */}
      <section aria-labelledby={`${uid}-visa`} style={sectionPanel('#FFFBEB', '#C97820')}>
        <h4 id={`${uid}-visa`} className="icplc-section-title" style={{ color: '#7C4A0A' }}>Destination visa</h4>
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
              <Value>{VISA_REQUIREMENT_LABELS[participant.visa_requirement] || participant.visa_requirement}</Value>
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
            ) : (
              <Badge
                tone={VISA_PROCESS_TONES[participant.visa_process_status] || 'mute'}
                label={VISA_PROCESS_LABELS[participant.visa_process_status] || participant.visa_process_status}
              />
            )}
          </Field>
        </div>
        <Why>{doc.visa.why} Visa is set independently of Canadian status and passport region.</Why>
      </section>

      {updateProfile.isError && (
        <div role="alert" style={{ fontSize: 12, color: '#991B1B' }}>
          Could not save: {updateProfile.error?.message || 'unknown error'}
        </div>
      )}

      {canWrite && (
        <div className="icplc-actions">
          {editing ? (
            <>
              <button type="button" onClick={handleSave} disabled={updateProfile.isPending} className="icplc-btn icplc-btn-primary">
                {updateProfile.isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="icplc-btn">Cancel</button>
            </>
          ) : (
            <button type="button" onClick={startEdit} className="icplc-btn icplc-btn-primary">Edit</button>
          )}
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

function sectionPanel(bg, borderColor) {
  return {
    background: bg,
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: 8,
    padding: '14px 16px',
  }
}
