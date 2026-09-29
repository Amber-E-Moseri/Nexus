/**
 * ICPLC documentation dimensions — derived, never persisted.
 *
 * Four INDEPENDENT dimensions. No dimension is inferred from another:
 *   1. Canadian status  → required Canadian-status document   (icplcDocReadiness.js)
 *   2. Passport country → region → supporting-document rule    (passportRegion.js)
 *   3. Passport readiness
 *   4. Destination visa requirement + process
 *
 * Forbidden inferences (see tests): Canadian status NEVER decides visa requirement.
 * The one allowed inference: an ECOWAS passport settles an UNASSESSED visa
 * requirement as "not required" (see effectiveVisaRequirement). Anything staff
 * (or a configured country visa default) set explicitly always wins.
 *
 * This is operational document tracking — not a legal eligibility determination.
 */

import {
  DOCUMENT_TYPE,
  DOCUMENT_TYPE_LABELS,
  deriveDocumentType,
  docNeedsAttention,
} from '../../registration/icplcDocReadiness.js'
import { PASSPORT_REGION, effectivePassportRegion } from './passportRegion.js'
import { effectiveCanadaDocReadiness } from './cmpDocumentation.js'

export const SUPPORTING_DOC = {
  NOT_REQUIRED: 'NOT_REQUIRED', // ECOWAS passport
  STAFF_REVIEW: 'STAFF_REVIEW', // NON_ECOWAS: workflow not yet defined in configuration
  UNKNOWN: 'UNKNOWN',           // no passport country → cannot classify
}

const COMMITTED = ['confirmed', 'likely']

/** Participants staff are actively counting on (used to gate "missing data" blockers). */
export function isCommitted(p) {
  return COMMITTED.includes(p?.participation_status)
}

/** Canadian-status dimension. */
export function deriveCanadianDocumentation(p) {
  const status = p.canada_residency_status || null
  const docType = deriveDocumentType(status)
  const attention = docNeedsAttention({
    canadaResidencyStatus: status,
    canadaStatusDocumentReadiness: effectiveCanadaDocReadiness(p),
  })
  let why
  if (!status) why = 'Canadian status has not been set.'
  else if (docType === DOCUMENT_TYPE.NONE) why = 'Canadian citizens do not need a Canadian-status document.'
  else if (docType === DOCUMENT_TYPE.REVIEW) why = 'Visitor / Other: no document is assumed — staff review needed.'
  else why = `${DOCUMENT_TYPE_LABELS[docType]} is required for this Canadian status.`
  return {
    status,
    docType,
    required: docType !== DOCUMENT_TYPE.NONE && docType !== DOCUMENT_TYPE.REVIEW && !!status,
    readiness: effectiveCanadaDocReadiness(p),
    attention,          // string | null
    why,
  }
}

/** Passport dimension: country, region and the passport-specific supporting document rule. */
export function derivePassportDocumentation(p) {
  // A known country always wins; the region the participant reported (CMP) only fills the gap.
  const region = effectivePassportRegion(p)
  let supportingDoc
  let why
  if (region === PASSPORT_REGION.ECOWAS) {
    supportingDoc = SUPPORTING_DOC.NOT_REQUIRED
    why = 'Not required for an ECOWAS passport.'
  } else if (region === PASSPORT_REGION.NON_ECOWAS) {
    supportingDoc = SUPPORTING_DOC.STAFF_REVIEW
    why = 'Non-ECOWAS passport: staff review the supporting-document workflow (no fixed requirement is configured).'
  } else {
    supportingDoc = SUPPORTING_DOC.UNKNOWN
    why = 'Set the passport country to classify the passport.'
  }
  return {
    country: p.passport_country || null,
    region,
    readiness: p.passport_readiness || 'unknown',
    supportingDoc,
    why,
  }
}

/**
 * Visa requirement to act on. The stored value is 'review' until someone assesses it; for an
 * ECOWAS passport holder that default means "not required". An explicit 'required' /
 * 'not_required' is never overridden. Derived on read, never persisted.
 */
export function effectiveVisaRequirement(p) {
  const stored = p?.visa_requirement || 'review'
  if (stored === 'review' && effectivePassportRegion(p) === PASSPORT_REGION.ECOWAS) return 'not_required'
  return stored
}

/** Visa dimension — reads visa fields (plus ECOWAS region, via effectiveVisaRequirement). */
export function deriveVisaDocumentation(p) {
  const requirement = effectiveVisaRequirement(p)
  const process = p.visa_process_status || 'not_started'
  let why
  if (requirement === 'not_required' && p.visa_requirement !== 'not_required') why = 'Not required for an ECOWAS passport.'
  else if (requirement === 'review') why = 'Visa requirement has not been determined — needs review.'
  else if (requirement === 'not_required') why = 'Staff marked the destination visa as not required.'
  else if (process === 'approved') why = 'Visa required and approved.'
  else if (process === 'issue') why = 'Visa required — process has a problem.'
  else if (process === 'not_started') why = 'Visa required — process not started.'
  else why = 'Visa required — process underway.'
  return { requirement, process, why }
}

export function deriveDocumentation(p) {
  return {
    canadian: deriveCanadianDocumentation(p),
    passport: derivePassportDocumentation(p),
    visa: deriveVisaDocumentation(p),
  }
}

// ── Needs Attention categories ────────────────────────────────────────────────

export const ATTENTION_CATEGORIES = [
  { key: 'not_registered', label: 'Not Registered', section: 'registration', description: 'No registration is linked to this participant' },
  { key: 'canadian_status_unknown', label: 'Canadian Status Unknown', section: 'documentation', description: 'Canadian status has not been collected' },
  { key: 'canadian_status_review', label: 'Canadian Status Needs Review', section: 'documentation', description: 'Visitor / Other status needs staff review' },
  { key: 'pr_card', label: 'PR Card Missing / Incomplete', section: 'documentation', description: 'Permanent Resident — PR Card not ready' },
  { key: 'study_permit', label: 'Study Permit Missing / Incomplete', section: 'documentation', description: 'International Student — Study Permit not ready' },
  { key: 'pgwp', label: 'PGWP Missing / Incomplete', section: 'documentation', description: 'Post-Graduation Worker — PGWP not ready' },
  { key: 'work_permit', label: 'Work Permit Missing / Incomplete', section: 'documentation', description: 'Work Permit Holder — Work Permit not ready' },
  { key: 'passport_incomplete', label: 'Passport Incomplete', section: 'documentation', description: 'Passport readiness needs action' },
  { key: 'non_ecowas_review', label: 'Non-ECOWAS Documentation Review', section: 'documentation', description: 'Non-ECOWAS passport: supporting-document workflow is staff-reviewed', informational: true },
  { key: 'visa_unknown', label: 'Visa Requirement Unknown', section: 'documentation', description: 'Visa requirement has not been determined' },
  { key: 'visa_not_started', label: 'Visa Required — Not Started', section: 'documentation', description: 'Visa required but the process has not started' },
  { key: 'visa_blocked', label: 'Visa Blocked / Issue', section: 'documentation', description: 'Visa process has a problem' },
  { key: 'travel_incomplete', label: 'Travel Incomplete', section: 'travel', description: 'Confirmed participant with no itinerary' },
]

const DOC_TYPE_TO_CATEGORY = {
  [DOCUMENT_TYPE.PR_CARD]: 'pr_card',
  [DOCUMENT_TYPE.STUDY_PERMIT]: 'study_permit',
  [DOCUMENT_TYPE.PGWP]: 'pgwp',
  [DOCUMENT_TYPE.WORK_PERMIT]: 'work_permit',
}

/**
 * Attention category keys that apply to one participant, from real state only.
 * `p.registration_link_status` (registered|not_registered) is preferred over the
 * raw registration_status column when the caller has derived it.
 */
export function attentionCategoryKeys(p) {
  if (p.participation_status === 'not_attending') return []
  const keys = []
  const registration = p.registration_link_status || p.registration_status
  if (registration !== 'registered') keys.push('not_registered')

  const canadian = deriveCanadianDocumentation(p)
  if (!canadian.status) keys.push('canadian_status_unknown')
  else if (canadian.docType === DOCUMENT_TYPE.REVIEW) keys.push('canadian_status_review')
  else if (canadian.attention && DOC_TYPE_TO_CATEGORY[canadian.docType]) {
    keys.push(DOC_TYPE_TO_CATEGORY[canadian.docType])
  }

  const passport = derivePassportDocumentation(p)
  const committed = isCommitted(p)
  if (!['unknown', 'ready'].includes(passport.readiness)) keys.push('passport_incomplete')
  if (passport.region === PASSPORT_REGION.NON_ECOWAS) keys.push('non_ecowas_review')

  const visa = deriveVisaDocumentation(p)
  if (visa.requirement === 'review' && committed) keys.push('visa_unknown')  // effective value: ECOWAS never lands here
  if (visa.requirement === 'required' && visa.process === 'not_started') keys.push('visa_not_started')
  if (visa.process === 'issue') keys.push('visa_blocked')

  if (p.participation_status === 'confirmed' && !(p.arrival_flight || p.arrival_date)) {
    keys.push('travel_incomplete')
  }
  return keys
}

export function attentionCategoryDef(key) {
  return ATTENTION_CATEGORIES.find((c) => c.key === key)
}
