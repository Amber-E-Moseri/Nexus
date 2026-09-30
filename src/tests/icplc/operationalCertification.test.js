import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { operationalSummary, isRegistrationMissing } from '../../features/icplc/lib/attentionModel.js'
import {
  attentionCategoryKeys, attentionTier, documentationMissingInfo, documentationReviewFingerprint,
  isDocumentationReviewAcknowledged, isDocumentationReviewStale,
} from '../../features/icplc/lib/documentationRules.js'
import { deriveReadiness, deriveItineraryStatus, isConfirmedOrReady } from '../../features/icplc/lib/readinessEngine.js'
import { flightNotRequired, FLIGHT_NOT_REQUIRED_REASONS, flightNotRequiredReasonLabel } from '../../features/icplc/lib/flightRequirement.js'

// Independent certification of the operational-rules matrix, written against the real modules with its own
// fixtures. Pure functions only (the database side is certified by operationalRulesDb.test.js).

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o) }

// Confirmed, registered, form received, documentation complete, flight submitted.
const base = (over = {}) => ({
  id: 'p', full_name: 'Test Person',
  participation_status: 'confirmed', registration_status: 'registered', registration_link_status: 'registered',
  source_values: { cmp_documentation: { submission_id: 's1', canadian_doc_valid_through_nov: 'Yes' } },
  canada_residency_status: 'CANADIAN_CITIZEN', canada_status_document_readiness: 'NOT_APPLICABLE',
  passport_country: 'Nigeria', passport_readiness: 'ready',
  visa_requirement: 'not_required', visa_process_status: 'not_applicable',
  arrival_date: '2027-01-15', arrival_flight: 'AC1', departure_date: '2027-01-20', departure_flight: 'AC2',
  override_fields: {}, ...over,
})
const unregistered = { registration_status: 'not_registered', registration_link_status: 'not_registered' }
const noFlight = { arrival_date: null, arrival_flight: null, departure_date: null, departure_flight: null }
const inNigeria = { flight_not_required_reason: 'already_in_nigeria', flight_not_required_by: 'staff-1', flight_not_required_at: '2026-09-30T12:00:00Z' }
// Information is missing (no form, unknown Canadian status, unknown passport) but nothing is known to be wrong.
const infoMissing = { source_values: {}, canada_residency_status: null, canada_status_document_readiness: null, passport_readiness: 'unknown', passport_country: null, visa_requirement: 'review' }
const reviewed = (p, by = 'staff-2', at = '2026-09-30T15:00:00Z') => ({
  ...p, documentation_review_by: by, documentation_review_at: at, documentation_review_fingerprint: documentationReviewFingerprint(p),
})
const has = (p, key) => attentionCategoryKeys(p).includes(key)

describe('1-3. registration is mandatory, cannot be waived, and is urgent', () => {
  it('1. a confirmed participant without a registration needs registration', () => {
    const p = base(unregistered)
    expect(isRegistrationMissing(p)).toBe(true)
    expect(has(p, 'not_registered')).toBe(true)
  })

  it('2. nothing waives it: not Flight Not Required, not a staff override, not Mark reviewed, not a made-up status', () => {
    expect(isRegistrationMissing(base({ ...unregistered, ...noFlight, ...inNigeria }))).toBe(true)
    expect(isRegistrationMissing(base({ ...unregistered, override_fields: { registration_status: { overridden: true } } }))).toBe(true)
    expect(isRegistrationMissing(reviewed(base({ ...unregistered, ...infoMissing })))).toBe(true)
    for (const status of ['not_required', 'waived', 'exempt', 'n/a', '']) {
      expect(isRegistrationMissing(base({ registration_status: status, registration_link_status: undefined }))).toBe(true)
    }
    expect(isRegistrationMissing(base({ registration_status: 'registered', registration_link_status: undefined }))).toBe(false)
  })

  it('2b. no "registration not required" value exists in the schema, the rules, or the registration UI', () => {
    const migrations = readdirSync(new URL('../../../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql'))
    for (const f of migrations) {
      const sql = readFileSync(new URL(`../../../supabase/migrations/${f}`, import.meta.url), 'utf8')
      const constraint = sql.match(/registration_status[^;]{0,200}check[^;]{0,200}/gi) || []
      for (const c of constraint) expect(c, f).not.toMatch(/not_required|waived|exempt/i)
    }
    for (const file of ['src/features/icplc/components/tabs/RegistrationTab.jsx', 'src/features/icplc/lib/documentationRules.js', 'src/features/icplc/lib/attentionModel.js', 'src/features/icplc/lib/flightRequirement.js']) {
      // Prose may say "cannot be waived"; what must not exist is a waiver VALUE or KEY (registration_not_required, registration_status: 'waived', ...).
      const src = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')
      expect(src, file).not.toMatch(/registration_(not_required|waived|exempt|waiver)/i)
      expect(src, file).not.toMatch(/registration_status['"]?\s*[:=]\s*['"](not_required|waived|exempt)['"]/i)
      expect(src, file).not.toMatch(/value:\s*['"](not_required|waived|exempt)['"][^\n]{0,60}registration/i)
    }
  })

  it('3. missing registration is the URGENT, top-priority reason, ahead of any other problem', () => {
    const p = base({ ...unregistered, visa_requirement: 'required', visa_process_status: 'issue', passport_readiness: 'no_passport' })
    const s = operationalSummary(p)
    expect(s.urgent).toBe(true)
    expect(s.attention[0]).toBe('not_registered')
    expect(attentionTier('not_registered')).toBe(0)
    expect(attentionTier('visa_blocked')).toBeGreaterThan(0)
  })
})

describe('4-5. Confirmed and Needs Attention coexist', () => {
  it('a Confirmed participant with missing registration stays Confirmed AND needs attention', () => {
    const p = base(unregistered)
    const s = operationalSummary(p)
    expect(s.confirmed).toBe(true)
    expect(s.needsAttention).toBe(true)
    expect(isConfirmedOrReady(p)).toBe(true)
    expect(p.participation_status).toBe('confirmed')
  })

  it('a fully complete confirmed participant is Confirmed with nothing needing attention', () => {
    const s = operationalSummary(base())
    expect(s.confirmed).toBe(true)
    expect(s.needsAttention).toBe(false)
    expect(s.urgent).toBe(false)
  })

  it('missing documentation information never downgrades the confirmation', () => {
    const s = operationalSummary(base(infoMissing))
    expect(s.confirmed).toBe(true)
    expect(s.needsAttention).toBe(true)
  })
})

describe('6-10. Flight Not Required', () => {
  it('6/7. exists, with "Already in Nigeria" as a reason', () => {
    expect(FLIGHT_NOT_REQUIRED_REASONS.map((r) => r.value)).toContain('already_in_nigeria')
    expect(flightNotRequiredReasonLabel('already_in_nigeria')).toBe('Already in Nigeria')
    expect(flightNotRequired(base({ ...noFlight, ...inNigeria }))).toBe(true)
  })

  it('8. prevents a false missing-flight warning, while an unexcused missing flight still warns', () => {
    const excused = base({ ...noFlight, ...inNigeria })
    expect(has(excused, 'travel_incomplete')).toBe(false)
    expect(deriveReadiness(excused).reasons.join('|')).not.toMatch(/itinerary missing/i)
    const unexcused = base({ ...noFlight })
    expect(has(unexcused, 'travel_incomplete')).toBe(true)
  })

  it('9. fabricates no itinerary: the participant record is not written to and reads as having no flight', () => {
    const p = deepFreeze(base({ ...noFlight, ...inNigeria }))
    expect(() => { operationalSummary(p); attentionCategoryKeys(p); deriveReadiness(p) }).not.toThrow() // frozen = any write would throw
    expect(deriveItineraryStatus(p)).toBe('missing')
    expect(p.arrival_date).toBeNull()
    expect(p.arrival_flight).toBeNull()
    expect(p.departure_flight).toBeNull()
  })

  it('9b. a submitted flight always wins over the exception', () => {
    expect(flightNotRequired(base({ ...inNigeria }))).toBe(false)
  })

  it('10. does not waive registration (and registration does not depend on flights)', () => {
    const p = base({ ...unregistered, ...noFlight, ...inNigeria })
    const s = operationalSummary(p)
    expect(s.urgent).toBe(true)
    expect(s.attention[0]).toBe('not_registered')
    expect(s.confirmed).toBe(true)
  })
})

describe('11-16. documentation information and Mark reviewed', () => {
  it('11. missing documentation information creates Needs Attention (and lists what is missing)', () => {
    const p = base(infoMissing)
    expect(has(p, 'documentation_incomplete')).toBe(true)
    const keys = documentationMissingInfo(p).map((m) => m.key)
    expect(keys).toEqual(expect.arrayContaining(['form_not_received', 'canadian_status', 'passport_status']))
  })

  it('11b. documentation information gaps are not chased for people staff are not counting on', () => {
    expect(documentationMissingInfo(base({ ...infoMissing, participation_status: 'tracking' }))).toEqual([])
  })

  it('12/13. Mark reviewed clears the missing-information reason and keeps who + when', () => {
    const p = reviewed(base(infoMissing), 'staff-2', '2026-09-30T15:00:00Z')
    expect(isDocumentationReviewAcknowledged(p)).toBe(true)
    expect(has(p, 'documentation_incomplete')).toBe(false)
    expect(has(p, 'canadian_status_unknown')).toBe(false)
    expect(has(p, 'visa_unknown')).toBe(false)
    expect(p.documentation_review_by).toBe('staff-2')
    expect(p.documentation_review_at).toBe('2026-09-30T15:00:00Z')
    expect(operationalSummary(p).confirmed).toBe(true)
  })

  it('14. missing data stays missing and readiness facts are unchanged by the checkmark', () => {
    const before = base(infoMissing)
    const after = reviewed(before)
    expect(documentationMissingInfo(after)).toEqual(documentationMissingInfo(before))
    expect(operationalSummary(after).missingInfo).toEqual(operationalSummary(before).missingInfo)
    expect(deriveReadiness(after)).toEqual(deriveReadiness(before))
    // every documentation fact is exactly what it was
    for (const f of ['canada_residency_status', 'canada_status_document_readiness', 'passport_readiness', 'passport_country', 'passport_region', 'visa_requirement', 'visa_process_status', 'registration_status', 'participation_status', 'source_values']) {
      expect(after[f], f).toEqual(before[f])
    }
    // it only adds the three review fields
    const added = Object.keys(after).filter((k) => !(k in before))
    expect(added.sort()).toEqual(['documentation_review_at', 'documentation_review_by', 'documentation_review_fingerprint'])
  })

  it('15. never clears a known problem or a missing registration', () => {
    const keep = (over, key) => {
      const p = reviewed(base({ ...infoMissing, ...over }))
      expect(has(p, key), key).toBe(true)
      expect(isDocumentationReviewAcknowledged(p)).toBe(true) // the review itself is fine; it just cannot cover this
    }
    keep({ visa_requirement: 'required', visa_process_status: 'issue' }, 'visa_blocked')
    keep({ passport_readiness: 'no_passport' }, 'passport_incomplete')
    keep({ passport_readiness: 'renewal_in_progress' }, 'passport_incomplete')
    keep({ canada_residency_status: 'PERMANENT_RESIDENT', source_values: { cmp_documentation: { submission_id: 's', canadian_doc_valid_through_nov: 'No' } } }, 'canadian_docs_review')
    keep({ ...unregistered }, 'not_registered')
    keep({ ...noFlight }, 'travel_incomplete')
  })

  it('15b. a review made while a real problem existed does not hide that problem later either', () => {
    const problem = base({ ...infoMissing, passport_readiness: 'no_passport' })
    const r = reviewed(problem)
    expect(has(r, 'passport_incomplete')).toBe(true)
    expect(deriveReadiness(r).readiness).not.toBe('ready')
  })

  it('16. a materially new missing-information state reopens attention', () => {
    const first = reviewed(base({ ...infoMissing }))
    expect(has(first, 'documentation_incomplete')).toBe(false)

    // something new goes missing (passport region can't be classified when the country is cleared)
    const worse = { ...first, source_values: {}, passport_country: null, canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: null }
    expect(documentationReviewFingerprint(worse)).not.toBe(first.documentation_review_fingerprint)
    expect(isDocumentationReviewAcknowledged(worse)).toBe(false)
    expect(isDocumentationReviewStale(worse)).toBe(true)
    expect(has(worse, 'documentation_incomplete')).toBe(true)

    // complete then broken again is not silently exempt
    const completed = { ...first, ...base(), documentation_review_by: first.documentation_review_by, documentation_review_at: first.documentation_review_at, documentation_review_fingerprint: first.documentation_review_fingerprint }
    expect(has(completed, 'documentation_incomplete')).toBe(false)
    const broken = { ...completed, passport_readiness: 'unknown' }
    expect(has(broken, 'documentation_incomplete')).toBe(true)
  })

  it('16b. a new genuine issue after a review surfaces normally', () => {
    const r = reviewed(base({ ...infoMissing }))
    expect(has({ ...r, visa_requirement: 'required', visa_process_status: 'issue' }, 'visa_blocked')).toBe(true)
    expect(has({ ...r, passport_readiness: 'no_passport' }, 'passport_incomplete')).toBe(true)
  })
})

describe('semantic separation: CONFIRMED / READINESS / NEEDS ATTENTION / MARK REVIEWED', () => {
  it('reviewing changes attention only: participation, readiness and every underlying fact are untouched', () => {
    const before = base(infoMissing)
    const after = reviewed(before)
    expect(after.participation_status).toBe(before.participation_status)
    expect(isConfirmedOrReady(after)).toBe(isConfirmedOrReady(before))
    expect(deriveReadiness(after)).toEqual(deriveReadiness(before))
    expect(operationalSummary(before).needsAttention).toBe(true)
    expect(operationalSummary(after).needsAttention).toBe(false)
  })

  it('readiness is derived from data alone: it does not read the acknowledgement', () => {
    const r1 = deriveReadiness(base(infoMissing))
    const r2 = deriveReadiness(reviewed(base(infoMissing)))
    expect(r2).toEqual(r1)
  })

  it('confirmation is not readiness: confirmed people can be blocked or action-required', () => {
    const p = base({ passport_readiness: 'no_passport', visa_requirement: 'required', visa_process_status: 'not_started' })
    expect(operationalSummary(p).confirmed).toBe(true)
    expect(deriveReadiness(p).readiness).toBe('blocked')
  })
})
