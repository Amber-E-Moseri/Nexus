/**
 * Mass "Mark documentation reviewed": client-side eligibility, canonical fingerprint, attention semantics,
 * expiry and result summary. The RPC's database behaviour is covered in bulkReviewDb.test.js.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  attentionCategoryKeys,
  documentationMissingInfo,
  documentationReviewFingerprint,
  isDocumentationReviewAcknowledged,
  isDocumentationReviewStale,
} from '../../features/icplc/lib/documentationRules.js'
import { needsAttentionNow, operationalSummary } from '../../features/icplc/lib/attentionModel.js'
import {
  REVIEW_BUCKET,
  buildReviewItems,
  classifyForReview,
  partitionForReview,
  summarizeBulkResults,
} from '../../features/icplc/lib/bulkReview.js'

// Committed, registered participant whose ONLY gap is that the Immigration Form has not been received.
const base = {
  id: 'p1',
  full_name: 'Review Me',
  participation_status: 'confirmed',
  registration_status: 'registered',
  registration_link_status: 'registered',
  canada_residency_status: 'CANADIAN_CITIZEN',
  passport_country: 'Ghana',
  passport_readiness: 'ready',
  visa_requirement: 'required',
  visa_process_status: 'approved',
  arrival_date: '2027-01-15',
  arrival_flight: 'AC1',
  departure_date: '2027-01-25',
  departure_flight: 'AC2',
  source_values: {},
  updated_at: '2026-10-01T12:00:00.123456+00:00',
}
const withForm = { ...base, source_values: { cmp_documentation: { submission_id: 'form-1' } } }

// What the bulk RPC stores for an eligible row (and what the drawer's single review stores).
const reviewed = (p) => ({
  ...p,
  documentation_review_by: 'staff-1',
  documentation_review_at: '2026-10-01T13:00:00Z',
  documentation_review_fingerprint: documentationReviewFingerprint(p),
})

describe('classification (canonical eligibility)', () => {
  it('RV-1 missing information that has not been reviewed is eligible', () => {
    expect(documentationMissingInfo(base).map((m) => m.key)).toContain('form_not_received')
    expect(classifyForReview(base)).toEqual({ bucket: REVIEW_BUCKET.ELIGIBLE, reason: null })
  })

  it('RV-2 already reviewed for the same state is not eligible again', () => {
    expect(classifyForReview(reviewed(base)).bucket).toBe(REVIEW_BUCKET.ALREADY)
  })

  it('RV-3 a stale review (state changed since) can be reviewed again', () => {
    const stale = { ...reviewed(base), documentation_review_fingerprint: 'passport_status' }
    expect(isDocumentationReviewStale(stale)).toBe(true)
    expect(classifyForReview(stale).bucket).toBe(REVIEW_BUCKET.ELIGIBLE)
  })

  it('RV-4 an empty fingerprint (nothing missing) is ineligible', () => {
    expect(documentationReviewFingerprint(withForm)).toBe('')
    expect(classifyForReview(withForm)).toEqual({ bucket: REVIEW_BUCKET.CANNOT, reason: 'nothing_missing' })
  })

  it('RV-5 Not Attending is ineligible even when information is missing', () => {
    expect(classifyForReview({ ...base, participation_status: 'not_attending' })).toEqual({ bucket: REVIEW_BUCKET.CANNOT, reason: 'not_attending' })
  })

  it('RV-6 participants who are not confirmed or likely have nothing to review', () => {
    expect(classifyForReview({ ...base, participation_status: 'tracking' })).toEqual({ bucket: REVIEW_BUCKET.CANNOT, reason: 'not_committed' })
  })

  it('RV-7 a mixed selection is split three ways, none counted twice', () => {
    const rows = [
      base,
      { ...base, id: 'p2' },
      reviewed({ ...base, id: 'p3' }),
      withForm,
      { ...base, id: 'p5', participation_status: 'not_attending' },
    ]
    const part = partitionForReview(rows)
    expect(part.eligible.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(part.already_reviewed.map((p) => p.id)).toEqual(['p3'])
    expect(part.cannot_review.map((p) => p.id)).toEqual(['p1', 'p5'])
    expect(part.eligible.length + part.already_reviewed.length + part.cannot_review.length).toBe(rows.length)
  })
})

describe('canonical fingerprint', () => {
  it('RV-8 the bulk payload fingerprint IS documentationReviewFingerprint (what a single review writes)', () => {
    const [item] = buildReviewItems([base])
    expect(item.fingerprint).toBe(documentationReviewFingerprint(base))
    expect(item.fingerprint).not.toBe('')
  })

  it('RV-9 the single-review path in the drawer still uses that same function', () => {
    const src = readFileSync(new URL('../../features/icplc/components/tabs/DocumentationTab.jsx', import.meta.url), 'utf8')
    expect(src).toContain('documentation_review_fingerprint: documentationReviewFingerprint(participant)')
  })

  it('RV-10 the payload carries the row updated_at untouched (microseconds survive) for the concurrency guard', () => {
    const [item] = buildReviewItems([base])
    expect(item).toEqual({ id: 'p1', fingerprint: documentationReviewFingerprint(base), expected_updated_at: '2026-10-01T12:00:00.123456+00:00' })
  })

  it('RV-11 only id, fingerprint and expected_updated_at are sent (no participant object)', () => {
    expect(Object.keys(buildReviewItems([base])[0]).sort()).toEqual(['expected_updated_at', 'fingerprint', 'id'])
  })
})

describe('attention semantics after a bulk review', () => {
  it('RV-12 a participant whose only issue is missing information leaves Needs Attention', () => {
    expect(needsAttentionNow(base)).toBe(true)
    const after = reviewed(base)
    expect(isDocumentationReviewAcknowledged(after)).toBe(true)
    expect(needsAttentionNow(after)).toBe(false)
  })

  it('RV-13 a known passport problem stays after review', () => {
    const blocked = { ...base, passport_readiness: 'issue' }
    const after = reviewed(blocked)
    expect(isDocumentationReviewAcknowledged(after)).toBe(true)
    expect(needsAttentionNow(after)).toBe(true)
    expect(attentionCategoryKeys(after)).toContain('passport_incomplete')
  })

  it('RV-14 a missing registration stays after review (urgent, never acknowledged)', () => {
    const noReg = { ...base, registration_status: 'not_registered', registration_link_status: 'not_registered' }
    const after = reviewed(noReg)
    expect(needsAttentionNow(after)).toBe(true)
    expect(operationalSummary(after).urgent).toBe(true)
    expect(attentionCategoryKeys(after).some((k) => k === 'not_registered' || k === 'registration_missing')).toBe(true)
  })

  it('RV-15 a known visa problem stays after review', () => {
    const visaIssue = { ...base, visa_process_status: 'issue' }
    const after = reviewed(visaIssue)
    expect(needsAttentionNow(after)).toBe(true)
  })

  it('RV-16 a travel problem stays after review', () => {
    const noTravel = { ...base, arrival_date: null, arrival_flight: null, departure_date: null, departure_flight: null }
    expect(attentionCategoryKeys(noTravel)).toContain('travel_incomplete')
    const after = reviewed(noTravel)
    expect(isDocumentationReviewAcknowledged(after)).toBe(true)
    expect(attentionCategoryKeys(after)).toContain('travel_incomplete')
    expect(needsAttentionNow(after)).toBe(true)
  })
})

describe('review expiration', () => {
  it('RV-17 when documentation state changes after review, the review stops applying', () => {
    const after = reviewed(base)
    expect(isDocumentationReviewAcknowledged(after)).toBe(true)
    // The passport is recorded as unknown later: a new thing is missing, so the old fingerprint no longer matches.
    const changed = { ...after, passport_readiness: 'unknown' }
    expect(documentationReviewFingerprint(changed)).not.toBe(after.documentation_review_fingerprint)
    expect(isDocumentationReviewAcknowledged(changed)).toBe(false)
    expect(isDocumentationReviewStale(changed)).toBe(true)
    expect(needsAttentionNow(changed)).toBe(true)
    expect(classifyForReview(changed).bucket).toBe(REVIEW_BUCKET.ELIGIBLE)
  })

  it('RV-18 when the missing information is resolved (CMP form arrives) the review no longer applies and nothing is missing', () => {
    const after = reviewed(base)
    const resolved = { ...after, source_values: { cmp_documentation: { submission_id: 'form-9' } } }
    expect(documentationReviewFingerprint(resolved)).toBe('')
    expect(isDocumentationReviewAcknowledged(resolved)).toBe(false)
    expect(classifyForReview(resolved).bucket).toBe(REVIEW_BUCKET.CANNOT)
  })
})

describe('result summary', () => {
  it('RV-19 counts every status and explains non-updates', () => {
    const summary = summarizeBulkResults([
      ...Array.from({ length: 18 }, (_, i) => ({ id: `u${i}`, status: 'updated', reason: null })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, status: 'already_reviewed', reason: 'same_state_already_reviewed' })),
      { id: 's1', status: 'skipped_stale', reason: 'changed_since_loaded' },
      { id: 'i1', status: 'skipped_ineligible', reason: 'not_attending' },
      { id: 'f1', status: 'failed', reason: 'not_found' },
    ])
    expect(summary.total).toBe(24)
    expect(summary.counts).toEqual({ updated: 18, already_reviewed: 3, skipped_stale: 1, skipped_ineligible: 1, failed: 1 })
    expect(summary.reasons.map((r) => r.label)).toEqual(
      expect.arrayContaining(['Already reviewed', 'Changed since you loaded the list', 'Not attending', 'Not found or no access']),
    )
  })
})
