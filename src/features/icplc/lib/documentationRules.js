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
import { effectiveCanadaDocReadiness, canadianDocSelfReport } from './cmpDocumentation.js'
import { flightNotRequired, hasFlightData } from './flightRequirement.js'

export const SUPPORTING_DOC = {
  NOT_REQUIRED: 'NOT_REQUIRED', // ECOWAS passport
  STAFF_REVIEW: 'STAFF_REVIEW', // NON_ECOWAS: workflow not yet defined in configuration
  UNKNOWN: 'UNKNOWN',           // no passport country → cannot classify
}

const COMMITTED = ['confirmed', 'likely']

/**
 * Registration is universally mandatory and only a positive `registered` satisfies it: unknown, null, not_registered,
 * issue and any unrecognised value all count as NOT registered. The registration-link status (derived from the
 * registrations table) wins when the caller provides it; otherwise the stored registration_status is used.
 * There is no waiver.
 */
export function isRegistered(p) {
  return (p?.registration_link_status || p?.registration_status) === 'registered'
}

// ── Registration: three user-facing states, ONE canonical derivation ─────────────────────────────────────────
//
//   registered            a completed registration (the only state that satisfies the requirement)
//   registration_missing  no completed registration, but there is meaningful evidence the participant is already
//                         progressing through ICPLC (see registrationProgressSignals: a flight, the documentation form,
//                         registration CSV / issue evidence, visa progress). Meaning: "registration still needs to be completed"
//   not_registered        no completed registration and no meaningful ICPLC progress. Meaning: "registration needs to be started"
//
// There is deliberately no "unknown" state: an empty, `unknown` or unrecognised stored value carries no evidence of
// any activity, so it is Not Registered. Both non-complete states fail the registration gate identically.
export const REGISTRATION_STATE = { REGISTERED: 'registered', MISSING: 'registration_missing', NOT_REGISTERED: 'not_registered' }
export const REGISTRATION_STATE_LABELS = {
  registered: 'Registered',
  registration_missing: 'Registration Missing',
  not_registered: 'Not Registered',
}
// The urgent Needs Attention wording for the two non-complete states.
export const REGISTRATION_URGENT_LABELS = {
  registration_missing: 'URGENT — Registration Missing',
  not_registered: 'URGENT — Not Registered',
}

/**
 * Evidence that a participant is already progressing through ICPLC. Each signal is an ICPLC-specific step that actually
 * happened, recorded by the registration CSV, a CMP form, or staff. Merely existing in the Working List does not
 * count, and neither does participation stage (a Confirmed person can still be Not Registered), passport / Canadian
 * fields on their own, tags, notes or manual overrides.
 *
 *   flight              a flight / itinerary is recorded (arrival or departure flight or date, or a linked CMP flight submission)
 *   documentation_form  the ICPLC Immigration / documentation form was received
 *   registration_csv    the registration export lists them with Registered other than Yes (started, not complete)
 *   registration_issue  the stored registration status is `issue`
 *   visa                the visa process has moved past "not started" (in progress, submitted, processing, approved, issue)
 *   flight_not_required staff recorded that no flight is needed (they are being handled for travel)
 */
export function registrationProgressSignals(p) {
  const signals = []
  const sv = p?.source_values
  if (hasFlightData(p) || (sv?.cmp_flights && typeof sv.cmp_flights === 'object' && Object.keys(sv.cmp_flights).length > 0)) {
    signals.push('flight')
  }
  if (sv?.cmp_documentation?.submission_id) signals.push('documentation_form')
  const csv = sv?.registered_raw?.value
  if (typeof csv === 'string' && csv.trim() !== '' && csv.trim().toLowerCase() !== 'yes') signals.push('registration_csv')
  if (p?.registration_status === 'issue') signals.push('registration_issue')
  if (['in_progress', 'submitted', 'processing', 'approved', 'issue'].includes(p?.visa_process_status)) signals.push('visa')
  if (p?.flight_not_required_reason) signals.push('flight_not_required')
  return signals
}

export function hasRegistrationProgress(p) {
  return registrationProgressSignals(p).length > 0
}

/** registered | registration_missing | not_registered. Use this everywhere registration is shown or filtered. */
export function registrationState(p) {
  if (isRegistered(p)) return REGISTRATION_STATE.REGISTERED
  return hasRegistrationProgress(p) ? REGISTRATION_STATE.MISSING : REGISTRATION_STATE.NOT_REGISTERED
}

/** Participants staff are actively counting on (used to gate "missing data" blockers). */
export function isCommitted(p) {
  return COMMITTED.includes(p?.participation_status)
}

/**
 * Identifies the missing-information state staff looked at: the sorted set of missing-information keys.
 * A review only covers THAT state. If the set changes (something new goes missing, or it is fixed and breaks
 * again differently) the review no longer applies and attention returns. Empty string = nothing missing.
 */
export function documentationReviewFingerprint(p) {
  return documentationMissingInfo(p).map((m) => m.key).sort().join(',')
}

/**
 * Staff once-over ("Mark reviewed") of the CURRENT incomplete-information state. It is attention bookkeeping only:
 * no value is filled in, no document is verified, readiness is untouched, and real problems and a missing
 * registration are never affected. It is not a permanent exemption: it stops applying when the state changes.
 */
export function isDocumentationReviewAcknowledged(p) {
  if (!p?.documentation_review_at) return false
  const current = documentationReviewFingerprint(p)
  return current !== '' && p.documentation_review_fingerprint === current
}

/** A review exists but no longer matches the current missing-information state (something changed since). */
export function isDocumentationReviewStale(p) {
  return !!p?.documentation_review_at && !isDocumentationReviewAcknowledged(p)
}

/** Reasons that mean "we don't know yet", as opposed to a known problem. */
export function isMissingInfoReason(reason) {
  return typeof reason === 'string' && /(^|\s)unknown$/i.test(reason.trim())
}

/**
 * Documentation information that is missing for someone staff are counting on (confirmed or likely).
 * Missing is not the same as a problem: a known bad answer (no valid passport, visa issue, Canadian documents
 * self-reported as not valid) is reported elsewhere and is never listed here.
 */
export function documentationMissingInfo(p) {
  if (!p || p.participation_status === 'not_attending' || !isCommitted(p)) return []
  const missing = []
  if (!p.source_values?.cmp_documentation?.submission_id) {
    missing.push({ key: 'form_not_received', label: 'Immigration Form not received' })
  }
  if (!p.canada_residency_status) {
    missing.push({ key: 'canadian_status', label: 'Canadian status unknown' })
  } else if (isDocumentValidityUnknown(p)) {
    missing.push({ key: 'canadian_doc_validity', label: 'Canadian-document validity unknown' })
  }
  if ((p.passport_readiness || 'unknown') === 'unknown') {
    missing.push({ key: 'passport_status', label: 'Passport status unknown' })
  }
  if (effectivePassportRegion(p) === PASSPORT_REGION.UNKNOWN) {
    missing.push({ key: 'passport_region', label: 'Passport region unknown' })
  }
  if (effectiveVisaRequirement(p) === 'review') {
    missing.push({ key: 'visa_requirement', label: 'Visa requirement unresolved (information missing)' })
  }
  return missing
}

/** Status is set and needs a document (PR card, study permit, PGWP, work permit), but nobody knows whether it is ready. */
function isDocumentValidityUnknown(p) {
  if (!p.canada_residency_status || p.canada_residency_status === 'CANADIAN_CITIZEN') return false
  return isMissingInfoReason(canadianDocAttention(p))
}

export const CANADIAN_DOCS_REVIEW_REASON = 'Canadian immigration/residency documents require review'

/**
 * Why (if at all) the Canadian-status document needs attention. A self-reported "documents won't stay valid"
 * answer is a review flag (ICPLC does not renew Canadian documents and cannot tell which one is affected);
 * otherwise the existing status-document rules apply.
 */
export function canadianDocAttention(p) {
  if (canadianDocSelfReport(p).concern) return CANADIAN_DOCS_REVIEW_REASON
  return docNeedsAttention({
    canadaResidencyStatus: p.canada_residency_status || null,
    canadaStatusDocumentReadiness: effectiveCanadaDocReadiness(p),
  })
}

/** Canadian-status dimension. */
export function deriveCanadianDocumentation(p) {
  const status = p.canada_residency_status || null
  const docType = deriveDocumentType(status)
  const attention = canadianDocAttention(p)
  const selfReport = canadianDocSelfReport(p)
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
    selfReport,         // { answer: 'yes' | 'no' | null, concern: boolean }
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
  { key: 'registration_missing', label: 'Registration Missing', section: 'registration', urgent: true, description: 'URGENT: registration was started but is not complete. Registration is mandatory and can never be waived' },
  { key: 'not_registered', label: 'Not Registered', section: 'registration', urgent: true, description: 'URGENT: registration has not been started. Registration is mandatory and can never be waived' },
  { key: 'canadian_status_unknown', label: 'Canadian Status Unknown', section: 'documentation', description: 'Canadian status has not been collected' },
  { key: 'documentation_incomplete', label: 'Documentation Information Incomplete', section: 'documentation', description: 'Information is missing (for example the Immigration Form). Staff can mark it reviewed; nothing is verified or filled in' },
  { key: 'canadian_docs_review', label: 'Canadian Documents Require Review', section: 'documentation', description: 'Participant reported their Canadian immigration/residency documents may not stay valid through the required period' },
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
  const reviewed = isDocumentationReviewAcknowledged(p)

  // Registration is the one universally mandatory item: there is no "not required", and nothing clears it but a registration.
  const registration = registrationState(p)
  if (registration !== REGISTRATION_STATE.REGISTERED) keys.push(registration) // registration_missing | not_registered

  const canadian = deriveCanadianDocumentation(p)
  if (!canadian.status) { if (!reviewed) keys.push('canadian_status_unknown') }
  else if (canadian.docType === DOCUMENT_TYPE.REVIEW) keys.push('canadian_status_review')
  else if (canadian.selfReport.concern) keys.push('canadian_docs_review')
  else if (canadian.attention && DOC_TYPE_TO_CATEGORY[canadian.docType]) {
    // "Readiness unknown" is missing information a review can cover; an explicit issue / renewal needed is a known problem.
    if (!(reviewed && isMissingInfoReason(canadian.attention))) keys.push(DOC_TYPE_TO_CATEGORY[canadian.docType])
  }

  const passport = derivePassportDocumentation(p)
  const committed = isCommitted(p)
  if (!['unknown', 'ready'].includes(passport.readiness)) keys.push('passport_incomplete')
  if (passport.region === PASSPORT_REGION.NON_ECOWAS) keys.push('non_ecowas_review')

  const visa = deriveVisaDocumentation(p)
  if (visa.requirement === 'review' && committed && !reviewed) keys.push('visa_unknown')  // effective value: ECOWAS never lands here
  if (visa.requirement === 'required' && visa.process === 'not_started') keys.push('visa_not_started')
  if (visa.process === 'issue') keys.push('visa_blocked')

  if (!reviewed && documentationMissingInfo(p).length > 0) keys.push('documentation_incomplete')

  // Flight expected but absent. A recorded "Flight Not Required" is an exception, not missing data.
  if (p.participation_status === 'confirmed' && !(p.arrival_flight || p.arrival_date) && !flightNotRequired(p)) {
    keys.push('travel_incomplete')
  }
  return sortAttentionKeys(keys)
}

/**
 * Priority tiers for Needs Attention: 0 urgent (registration), 1 known operational problems,
 * 2 documentation information incomplete (staff once-over), 3 informational.
 */
export function attentionTier(key) {
  const def = ATTENTION_CATEGORIES.find((c) => c.key === key)
  if (def?.urgent) return 0
  if (def?.informational) return 3
  if (key === 'documentation_incomplete' || key === 'canadian_status_unknown' || key === 'visa_unknown') return 2
  return 1
}

export function sortAttentionKeys(keys) {
  return [...keys].sort((a, b) => attentionTier(a) - attentionTier(b))
}

export function attentionCategoryDef(key) {
  return ATTENTION_CATEGORIES.find((c) => c.key === key)
}

const DOCUMENTATION_ACTION_KEYS = new Set(
  ATTENTION_CATEGORIES.filter((c) => c.section === 'documentation' && !c.informational).map((c) => c.key),
)

/** True when any documentation attention category applies (informational ones such as the Non-ECOWAS review don't count). */
export function documentationActionRequired(p) {
  return attentionCategoryKeys(p).some((k) => DOCUMENTATION_ACTION_KEYS.has(k))
}
