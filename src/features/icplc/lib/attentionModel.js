// Confirmation and attention are independent dimensions.
//
// Someone can be CONFIRMED and NEED ATTENTION at the same time (missing registration, incomplete documentation,
// a visa follow-up, a missing flight). Nothing here downgrades a confirmation, and nothing here can waive
// registration: it is the only universally mandatory item, and it is always the top-priority reason.

import { isConfirmedOrReady, deriveFlightStatus, deriveReadiness } from './readinessEngine.js'
import {
  ATTENTION_CATEGORIES,
  attentionCategoryKeys,
  attentionTier,
  documentationMissingInfo,
  isDocumentationReviewAcknowledged,
  isDocumentationReviewStale,
  isMissingInfoReason,
  isRegistered,
  attentionCategoryDef,
} from './documentationRules.js'

const INFORMATIONAL = new Set(ATTENTION_CATEGORIES.filter((c) => c.informational).map((c) => c.key))

/**
 * Readiness reasons staff still need to act on. Readiness itself is derived from the data alone and does not change
 * when staff click "Mark reviewed"; this only drops the missing-information reasons for a state staff already reviewed.
 * Known problems and a missing registration are never dropped.
 */
export function attentionReasons(p) {
  const { reasons } = deriveReadiness(p)
  return isDocumentationReviewAcknowledged(p) ? reasons.filter((r) => !isMissingInfoReason(r)) : reasons
}

/**
 * THE canonical Needs Attention predicate. Every consumer (Overview headline, People / Board views, the
 * "Confirmed + needs attention" filter, tiles, profile) derives from the actionable attention categories, so it
 * means the same thing everywhere. Missing registration, known passport / visa / Canadian-document / travel
 * problems and unreviewed missing information count; a reviewed missing-information state and informational
 * items do not.
 */
export function hasActionableAttention(keys) {
  return keys.some((k) => !INFORMATIONAL.has(k))
}

export function needsAttentionNow(p) {
  return hasActionableAttention(attentionCategoryKeys(p))
}

/** Human-readable actionable attention for one participant, highest priority first (registration is always first). */
export function attentionItems(p) {
  return attentionCategoryKeys(p)
    .filter((k) => !INFORMATIONAL.has(k))
    .map((k) => (k === 'not_registered' ? 'URGENT — Registration Required' : attentionCategoryDef(k)?.label || k))
}

export function isRegistrationMissing(p) {
  if (!p || p.participation_status === 'not_attending') return false
  return !isRegistered(p)
}

/**
 * One participant's operational picture.
 *  confirmed            staff-confirmed, or derived Ready (never lowered by attention)
 *  urgent               registration is missing (highest priority, cannot be acknowledged or waived)
 *  attention            attention keys, highest priority first
 *  needsAttention       any non-informational attention key
 *  docsIncomplete       documentation information is missing and staff have not reviewed it
 *  docsReviewed         staff acknowledged the CURRENT missing-information state (values stay missing)
 *  docsReviewStale      a review exists but the missing-information state has since changed
 *  flight               booked | missing | awaiting | not_required
 */
export function operationalSummary(p) {
  const attention = attentionCategoryKeys(p)
  const actionable = attention.filter((k) => !INFORMATIONAL.has(k))
  const missing = documentationMissingInfo(p)
  const reviewed = isDocumentationReviewAcknowledged(p)
  return {
    confirmed: isConfirmedOrReady(p),
    urgent: isRegistrationMissing(p),
    attention,
    needsAttention: hasActionableAttention(attention),
    topTier: actionable.length ? attentionTier(actionable[0]) : null,
    docsIncomplete: missing.length > 0 && !reviewed,
    docsReviewed: reviewed,
    docsReviewStale: isDocumentationReviewStale(p), // reviewed earlier, but the missing-information state has changed since
    missingInfo: missing,
    flight: deriveFlightStatus(p),
  }
}

/** Values of the `attention_state` Working List filter. */
export const ATTENTION_STATES = {
  confirmed_needs_attention: (s) => s.confirmed && s.needsAttention,
  registration_missing: (s) => s.urgent,
  confirmed_registration_missing: (s) => s.confirmed && s.urgent,
  docs_incomplete: (s) => s.docsIncomplete,
  docs_review_acknowledged: (s) => s.docsReviewed,
}

export function matchesAttentionState(p, state) {
  const test = ATTENTION_STATES[state]
  return test ? test(operationalSummary(p)) : false
}
