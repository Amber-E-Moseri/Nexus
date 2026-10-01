// Mass "Mark documentation reviewed": client-side classification and result summary.
//
// This adds NO new definition of documentation completeness. Eligibility is expressed entirely through the
// existing canonical functions: documentationMissingInfo() (what is missing), documentationReviewFingerprint()
// (the state that was reviewed) and isDocumentationReviewAcknowledged() (does the stored review still match).
// The RPC re-checks what the database can see (participation, stale updated_at, same fingerprint already stored).

import {
  documentationMissingInfo,
  documentationReviewFingerprint,
  isDocumentationReviewAcknowledged,
} from './documentationRules.js'

export const REVIEW_BUCKET = { ELIGIBLE: 'eligible', ALREADY: 'already_reviewed', CANNOT: 'cannot_review' }

export const CANNOT_REVIEW_REASONS = {
  not_attending: 'Not attending',
  not_committed: 'Not confirmed or likely yet',
  nothing_missing: 'Nothing is missing',
}

/**
 * Where one participant falls for a bulk review.
 *   eligible          documentation information is missing and that state has not been reviewed (a stale review counts as not reviewed)
 *   already_reviewed  staff already reviewed this exact missing-information state
 *   cannot_review     Not Attending, not committed, or nothing missing
 */
export function classifyForReview(p) {
  if (!p) return { bucket: REVIEW_BUCKET.CANNOT, reason: 'nothing_missing' }
  if (p.participation_status === 'not_attending') return { bucket: REVIEW_BUCKET.CANNOT, reason: 'not_attending' }
  if (!['confirmed', 'likely'].includes(p.participation_status)) return { bucket: REVIEW_BUCKET.CANNOT, reason: 'not_committed' }
  if (documentationMissingInfo(p).length === 0 || documentationReviewFingerprint(p) === '') {
    return { bucket: REVIEW_BUCKET.CANNOT, reason: 'nothing_missing' }
  }
  if (isDocumentationReviewAcknowledged(p)) return { bucket: REVIEW_BUCKET.ALREADY, reason: 'same_state_already_reviewed' }
  return { bucket: REVIEW_BUCKET.ELIGIBLE, reason: null }
}

/** Split a selection into the three buckets the confirmation shows. */
export function partitionForReview(participants) {
  const out = { eligible: [], already_reviewed: [], cannot_review: [] }
  for (const p of participants || []) out[classifyForReview(p).bucket].push(p)
  return out
}

/**
 * RPC payload for the eligible participants. The fingerprint is the SAME one the drawer's single review writes;
 * expected_updated_at is the row's updated_at exactly as loaded (a string, never re-formatted through Date, so
 * microseconds survive) and lets the database refuse a row that changed since.
 */
export function buildReviewItems(eligible) {
  return (eligible || []).map((p) => ({
    id: p.id,
    fingerprint: documentationReviewFingerprint(p),
    expected_updated_at: p.updated_at ?? null,
  }))
}

export const RESULT_LABELS = {
  updated: 'updated',
  already_reviewed: 'already reviewed',
  skipped_stale: 'skipped (changed since loaded)',
  skipped_ineligible: 'ineligible',
  no_change: 'unchanged',
  failed: 'failed',
}

const REASON_LABELS = {
  changed_since_loaded: 'Changed since you loaded the list',
  same_state_already_reviewed: 'Already reviewed',
  not_attending: 'Not attending',
  not_committed: 'Not confirmed or likely',
  nothing_missing: 'Nothing is missing',
  duplicate_id: 'Selected twice',
  not_found: 'Not found or no access',
  update_blocked: 'Update was blocked',
  invalid_id: 'Invalid participant',
  tag_not_for_event: 'Tag belongs to another event',
  already_tagged: 'Already had the tag',
  not_tagged: 'Did not have the tag',
  error: 'Could not be saved',
}

/** Per-participant RPC results -> { total, counts, reasons: [{ status, reason, label, count }] } for the result panel. */
export function summarizeBulkResults(results) {
  const counts = {}
  const reasons = new Map()
  for (const r of results || []) {
    counts[r.status] = (counts[r.status] || 0) + 1
    if (r.status !== 'updated' && r.reason) {
      const key = `${r.status}:${r.reason}`
      const cur = reasons.get(key) || { status: r.status, reason: r.reason, label: REASON_LABELS[r.reason] || r.reason, count: 0 }
      cur.count += 1
      reasons.set(key, cur)
    }
  }
  return { total: (results || []).length, counts, reasons: [...reasons.values()] }
}
