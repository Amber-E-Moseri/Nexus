// Regression tests for the certification defects:
//   1. Registration was not a real readiness gate (status "unknown" derived Ready and could auto-confirm).
//   2. Two divergent "Needs Attention" predicates.
//   3. Mark reviewed did not cover missing-information-derived PR card / study permit / PGWP attention.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { needsAttentionNow, operationalSummary, attentionItems } from '../../features/icplc/lib/attentionModel.js'
import { attentionCategoryKeys, documentationReviewFingerprint, documentationMissingInfo, isRegistered } from '../../features/icplc/lib/documentationRules.js'
import { deriveReadiness, isConfirmedOrReady } from '../../features/icplc/lib/readinessEngine.js'
import { applyClientFilters } from '../../features/icplc/lib/participantFilters.js'
import { filterParticipantsByWorkingListView } from '../../features/icplc/lib/reconciliation.js'

const complete = (over = {}) => ({
  id: 'p1', full_name: 'Ada Obi',
  participation_status: 'confirmed', registration_status: 'registered',
  source_values: { cmp_documentation: { submission_id: 'form-1', canadian_doc_valid_through_nov: 'Yes' } },
  canada_residency_status: 'CANADIAN_CITIZEN', canada_status_document_readiness: 'NOT_APPLICABLE',
  passport_country: 'Nigeria', passport_readiness: 'ready',
  visa_requirement: 'not_required', visa_process_status: 'not_applicable',
  arrival_date: '2027-01-15', arrival_flight: 'AC1', departure_date: '2027-01-20', departure_flight: 'AC2',
  override_fields: {}, ...over,
})
const review = (p) => ({ ...p, documentation_review_by: 's', documentation_review_at: '2026-09-30T15:00:00Z', documentation_review_fingerprint: documentationReviewFingerprint(p) })

describe('A-E. registration is a real readiness gate', () => {
  it('D. registered + everything else satisfied is Ready, with no attention', () => {
    expect(deriveReadiness(complete()).readiness).toBe('ready')
    expect(needsAttentionNow(complete())).toBe(false)
  })

  for (const [label, over] of [
    ['A. registration_status = unknown', { registration_status: 'unknown' }],
    ['B. registration_status missing (null)', { registration_status: null }],
    ['B. registration_status missing (undefined)', { registration_status: undefined }],
    ['C. registration_status = not_registered', { registration_status: 'not_registered' }],
    ['issue', { registration_status: 'issue' }],
    ['unrecognised value', { registration_status: 'waived' }],
    ['link status not_registered wins over a stored "registered"', { registration_status: 'registered', registration_link_status: 'not_registered' }],
  ]) {
    it(`${label}: NOT Ready, and registration is the urgent top-priority reason`, () => {
      const p = complete(over)
      expect(isRegistered(p)).toBe(false)
      expect(deriveReadiness(p).readiness).not.toBe('ready')
      expect(deriveReadiness(p).reasons).toContain('Registration outstanding')
      expect(attentionCategoryKeys(p)[0]).toBe('not_registered')
      expect(attentionItems(p)[0]).toBe('URGENT — Registration Required')
      expect(needsAttentionNow(p)).toBe(true)
    })
  }

  it('source precedence: link status wins; stored status is the fallback; anything else is not registered', () => {
    expect(isRegistered({ registration_link_status: 'registered', registration_status: 'unknown' })).toBe(true)
    expect(isRegistered({ registration_link_status: 'not_registered', registration_status: 'registered' })).toBe(false)
    expect(isRegistered({ registration_status: 'registered' })).toBe(true)
    expect(isRegistered({})).toBe(false)
    expect(isRegistered({ registration_status: 'unknown' })).toBe(false)
    expect(isRegistered(null)).toBe(false)
  })

  it('the registration link status satisfies registration when the stored status is still unknown', () => {
    const p = complete({ registration_status: 'unknown', registration_link_status: 'registered' })
    expect(isRegistered(p)).toBe(true)
    expect(deriveReadiness(p).readiness).toBe('ready')
  })

  it('E. Confirmed + registration unknown: stays Confirmed, is not Ready, needs attention, registration first', () => {
    const p = complete({ registration_status: 'unknown', registration_link_status: 'not_registered' })
    const s = operationalSummary(p)
    expect(p.participation_status).toBe('confirmed')
    expect(s.confirmed).toBe(true)
    expect(deriveReadiness(p).readiness).not.toBe('ready')
    expect(s.needsAttention).toBe(true)
    expect(s.urgent).toBe(true)
    expect(s.attention[0]).toBe('not_registered')
  })

  it('Flight Not Required does not waive it, and unknown registration is still not Ready', () => {
    const p = complete({ registration_status: 'unknown', arrival_flight: null, arrival_date: null, departure_flight: null, departure_date: null, flight_not_required_reason: 'already_in_nigeria' })
    expect(deriveReadiness(p).readiness).not.toBe('ready')
    expect(attentionCategoryKeys(p)).toEqual(['not_registered'])
  })

  it('a person not attending is not chased for registration', () => {
    expect(needsAttentionNow(complete({ participation_status: 'not_attending', registration_status: 'unknown' }))).toBe(false)
  })
})

describe('F. auto-confirm guard', () => {
  // useICPLCWorkingList promotes tracking/likely people whose derived readiness is 'ready'. Fixing the readiness gate fixes it at the root.
  const promotable = (p) => (p.participation_status === 'tracking' || p.participation_status === 'likely') && deriveReadiness(p).readiness === 'ready'

  it('an unregistered / unknown-registration likely or tracking participant with everything else complete is NOT promotable', () => {
    for (const status of ['likely', 'tracking']) {
      for (const reg of ['unknown', null, 'not_registered']) {
        const p = complete({ participation_status: status, registration_status: reg, registration_link_status: 'not_registered' })
        expect(promotable(p)).toBe(false)
        expect(isConfirmedOrReady(p)).toBe(false)
      }
    }
  })

  it('a registered participant with everything else complete is still promotable (intended behaviour kept)', () => {
    expect(promotable(complete({ participation_status: 'likely' }))).toBe(true)
  })

  it('the hook still promotes from derived readiness only (no separate registration exception)', () => {
    const src = readFileSync(new URL('../../features/icplc/hooks/useICPLCWorkingList.js', import.meta.url), 'utf8')
    expect(src).toMatch(/deriveReadiness\(p\)\.readiness === 'ready'/)
  })
})

describe('G-I. Mark reviewed covers missing-information document attention', () => {
  const missingOnly = { source_values: { cmp_documentation: { submission_id: 'f' } }, passport_readiness: 'unknown', passport_region: null }
  const cases = [
    ['G. PR card', 'PERMANENT_RESIDENT', 'pr_card'],
    ['H. study permit', 'INTERNATIONAL_STUDENT', 'study_permit'],
    ['I. PGWP', 'POST_GRADUATION_WORKER', 'pgwp'],
    ['work permit', 'WORK_PERMIT_HOLDER', 'work_permit'],
  ]
  for (const [label, status, key] of cases) {
    it(`${label}: readiness unknown is reviewable and clears; the value and readiness facts stay unchanged`, () => {
      const before = complete({ ...missingOnly, canada_residency_status: status, canada_status_document_readiness: 'UNKNOWN' })
      if (!attentionCategoryKeys(before).includes(key)) return // status not tracked as a document type in this build
      expect(documentationMissingInfo(before).map((m) => m.key)).toContain('canadian_doc_validity')
      const after = review(before)
      expect(attentionCategoryKeys(after)).not.toContain(key)
      expect(needsAttentionNow(after)).toBe(false)
      expect(after.canada_status_document_readiness).toBe('UNKNOWN') // the underlying value is untouched
      expect(deriveReadiness(after)).toEqual(deriveReadiness(before)) // readiness facts unchanged by the review
    })
  }

  it('the covered document statuses are actually exercised (PR, study permit, PGWP)', () => {
    for (const [, status, key] of cases.slice(0, 3)) {
      const p = complete({ ...missingOnly, canada_residency_status: status, canada_status_document_readiness: 'UNKNOWN' })
      expect(attentionCategoryKeys(p)).toContain(key)
    }
  })
})

describe('J. known concerns cannot be acknowledged away', () => {
  const formMissing = { source_values: {} } // something is missing, so a review exists and applies to it

  for (const [label, status, key] of [['PR card', 'PERMANENT_RESIDENT', 'pr_card'], ['study permit', 'INTERNATIONAL_STUDENT', 'study_permit'], ['PGWP', 'POST_GRADUATION_WORKER', 'pgwp']]) {
    for (const readiness of ['ISSUE', 'RENEWAL_NEEDED']) {
      it(`${label} explicitly reported ${readiness} stays after Mark reviewed`, () => {
        const p = review(complete({ ...formMissing, canada_residency_status: status, canada_status_document_readiness: readiness }))
        expect(documentationMissingInfo(p).length).toBeGreaterThan(0) // the review is genuinely in effect
        expect(attentionCategoryKeys(p)).toContain(key)
        expect(needsAttentionNow(p)).toBe(true)
      })
    }
  }

  it('a self-reported Canadian-document concern stays after Mark reviewed', () => {
    const p = review(complete({ source_values: { cmp_documentation: { submission_id: 'f', canadian_doc_valid_through_nov: 'No' } }, canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: null, passport_readiness: 'unknown' }))
    expect(attentionCategoryKeys(p)).toContain('canadian_docs_review')
    expect(needsAttentionNow(p)).toBe(true)
  })

  it('no valid passport, a visa issue, missing registration and a missing flight all stay after Mark reviewed', () => {
    const base = { source_values: {} }
    expect(attentionCategoryKeys(review(complete({ ...base, passport_readiness: 'no_passport' })))).toContain('passport_incomplete')
    expect(attentionCategoryKeys(review(complete({ ...base, visa_requirement: 'required', visa_process_status: 'issue' })))).toContain('visa_blocked')
    expect(attentionCategoryKeys(review(complete({ ...base, registration_status: 'unknown' })))[0]).toBe('not_registered')
    expect(attentionCategoryKeys(review(complete({ ...base, arrival_flight: null, arrival_date: null, departure_flight: null, departure_date: null })))).toContain('travel_incomplete')
  })
})

describe('K. the review is state-sensitive', () => {
  const pr = () => complete({ source_values: {}, canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'UNKNOWN', passport_readiness: 'unknown', passport_region: null })

  it('the same missing set stays reviewed; a new missing reason brings attention back (including the document key)', () => {
    const reviewed = review(pr())
    expect(needsAttentionNow(reviewed)).toBe(false)
    expect(needsAttentionNow({ ...reviewed })).toBe(false)
    const changed = { ...reviewed, canada_residency_status: null } // Canadian status now also missing: a different set
    expect(needsAttentionNow(changed)).toBe(true)
    const changed2 = { ...reviewed, passport_country: null, visa_requirement: 'review', passport_region: null, source_values: { cmp_documentation: {} } }
    expect(needsAttentionNow(changed2)).toBe(true)
  })
})

describe('L. one Needs Attention definition everywhere', () => {
  const noFlight = { arrival_flight: null, arrival_date: null, departure_flight: null, departure_date: null }
  const people = [
    complete({ id: 'clean' }),
    complete({ id: 'reg-unknown', registration_status: 'unknown', registration_link_status: 'not_registered' }),
    complete({ id: 'reg-no', registration_status: 'not_registered', registration_link_status: 'not_registered' }),
    complete({ id: 'passport', passport_readiness: 'no_passport' }),
    complete({ id: 'info-missing', source_values: {}, passport_readiness: 'unknown', passport_region: null, visa_requirement: 'not_required' }), // readiness derives "unknown" here
    review(complete({ id: 'info-reviewed', source_values: {}, passport_readiness: 'unknown', passport_region: null, visa_requirement: 'not_required' })),
    review(complete({ id: 'pr-reviewed', source_values: {}, canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'UNKNOWN', passport_readiness: 'unknown', passport_region: null })),
    complete({ id: 'pr-issue', canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'ISSUE' }),
    complete({ id: 'no-flight', ...noFlight }),
    complete({ id: 'in-nigeria', ...noFlight, flight_not_required_reason: 'already_in_nigeria' }),
    complete({ id: 'likely-unreg', participation_status: 'likely', registration_status: 'unknown', registration_link_status: 'not_registered' }),
    complete({ id: 'assist', visa_requirement: 'required', visa_process_status: 'in_progress', documentation_assistance_requested: true }),
  ]
  const ids = (rows) => rows.map((p) => p.id).sort()

  it('canonical result = Overview headline = People filter = Confirmed + Needs Attention (for confirmed people)', () => {
    const canonical = people.filter(needsAttentionNow)
    const overview = people.filter((p) => operationalSummary(p).needsAttention) // DocumentationOverview tile logic
    const peopleFilter = filterParticipantsByWorkingListView(people, [], [], null, 'needs_attention')
    const confirmedNeeds = applyClientFilters(people, { attention_state: ['confirmed_needs_attention'] })
    const expectedConfirmed = canonical.filter((p) => operationalSummary(p).confirmed)

    expect(ids(overview)).toEqual(ids(canonical))
    expect(ids(peopleFilter)).toEqual(ids(canonical))
    expect(ids(confirmedNeeds)).toEqual(ids(expectedConfirmed))
    // spot checks so this cannot pass vacuously
    expect(ids(canonical)).toEqual(expect.arrayContaining(['reg-unknown', 'reg-no', 'passport', 'info-missing', 'pr-issue', 'no-flight', 'likely-unreg']))
    expect(ids(canonical)).not.toEqual(expect.arrayContaining(['clean']))
    for (const quiet of ['clean', 'info-reviewed', 'pr-reviewed', 'in-nigeria', 'assist']) expect(ids(canonical)).not.toContain(quiet)
  })

  it('the profile card lists exactly the canonical attention (and is empty exactly when nothing needs attention)', () => {
    for (const p of people) expect(attentionItems(p).length > 0).toBe(needsAttentionNow(p))
  })
})
