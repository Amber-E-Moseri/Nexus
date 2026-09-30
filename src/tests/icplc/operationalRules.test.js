import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { operationalSummary, matchesAttentionState, isRegistrationIncomplete, attentionReasons, needsAttentionNow } from '../../features/icplc/lib/attentionModel.js'
import { attentionCategoryKeys, attentionTier, documentationMissingInfo, documentationReviewFingerprint, sortAttentionKeys } from '../../features/icplc/lib/documentationRules.js'
import { deriveReadiness, deriveFlightStatus, deriveTravelStatus, deriveItineraryStatus } from '../../features/icplc/lib/readinessEngine.js'
import { flightNotRequired, flightNotRequiredInfo, flightNotRequiredReasonLabel, FLIGHT_NOT_REQUIRED_REASONS } from '../../features/icplc/lib/flightRequirement.js'
import { deriveDocumentationActions } from '../../features/icplc/lib/documentationRisk.js'
import { applyClientFilters } from '../../features/icplc/lib/participantFilters.js'

const NOW = new Date(2026, 9, 1)

// Confirmed, registered, Immigration Form received, documentation complete, flight submitted.
const complete = (over = {}) => ({
  id: 'p1', full_name: 'Ada Obi',
  participation_status: 'confirmed', registration_status: 'registered', registration_link_status: 'registered',
  source_values: { cmp_documentation: { submission_id: 'form-1', canadian_doc_valid_through_nov: 'Yes' } },
  canada_residency_status: 'CANADIAN_CITIZEN', canada_status_document_readiness: 'NOT_APPLICABLE',
  passport_country: 'Nigeria', passport_readiness: 'ready',
  visa_requirement: 'not_required', visa_process_status: 'not_applicable',
  arrival_date: '2027-01-15', arrival_flight: 'AC1', departure_date: '2027-01-20', departure_flight: 'AC2',
  override_fields: {}, ...over,
})
const noFlight = { arrival_date: null, arrival_flight: null, departure_date: null, departure_flight: null }
const unregistered = { registration_status: 'not_registered', registration_link_status: 'not_registered' }
const inNigeria = { flight_not_required_reason: 'already_in_nigeria', flight_not_required_note: 'At the pre-conference', flight_not_required_by: 'staff-1', flight_not_required_at: '2026-09-30T12:00:00Z' }
// Staff "Mark reviewed" of whatever is missing right now: who, when, and WHICH missing-information state.
const review = (p, at = '2026-09-30T15:00:00Z') => ({
  ...p, documentation_review_by: 'staff-2', documentation_review_at: at, documentation_review_fingerprint: documentationReviewFingerprint(p),
})
// Information missing (no form, unknown Canadian status, passport unknown) but nothing known to be wrong.
const infoMissing = { source_values: {}, canada_residency_status: null, canada_status_document_readiness: null, passport_readiness: 'unknown', passport_country: null, visa_requirement: 'review' }

describe('A. registered + flight submitted + documentation complete', () => {
  it('is Confirmed with nothing needing attention', () => {
    const s = operationalSummary(complete())
    expect(s.confirmed).toBe(true)
    expect(s.attention).toEqual([])
    expect(s.needsAttention).toBe(false)
    expect(s.urgent).toBe(false)
    expect(s.docsIncomplete).toBe(false)
  })
})

describe('B. not registered + known attending + flight submitted', () => {
  it('stays Confirmed and registration is the urgent, top-priority reason', () => {
    const p = complete(unregistered)
    const s = operationalSummary(p)
    expect(s.confirmed).toBe(true)
    expect(s.urgent).toBe(true)
    expect(s.attention[0]).toBe('registration_missing')
    expect(attentionTier('registration_missing')).toBe(0)
    expect(deriveReadiness(p).reasons).toContain('Registration outstanding')
  })
})

describe('C. not registered + Flight Not Required (already in Nigeria)', () => {
  it('stays Confirmed, urgent for registration, and has no missing-flight warning', () => {
    const p = complete({ ...unregistered, ...noFlight, ...inNigeria })
    const s = operationalSummary(p)
    expect(s.confirmed).toBe(true)
    expect(s.urgent).toBe(true)
    expect(s.attention).toContain('registration_missing')
    expect(s.attention).not.toContain('travel_incomplete')
    expect(s.flight).toBe('not_required')
    expect(deriveReadiness(p).reasons.join(' ')).not.toMatch(/itinerary/i)
  })
})

describe('D. registered + Flight Not Required', () => {
  it('is Confirmed with no missing-flight warning and no fabricated itinerary', () => {
    const p = complete({ ...noFlight, ...inNigeria })
    const s = operationalSummary(p)
    expect(s.confirmed).toBe(true)
    expect(s.attention).not.toContain('travel_incomplete')
    expect(s.needsAttention).toBe(false)
    expect(deriveTravelStatus(p)).toBe('ready')
    expect(deriveItineraryStatus(p)).toBe('missing') // still no itinerary data: nothing was invented
    expect(p.arrival_flight).toBeNull()
    expect(deriveReadiness(p).readiness).toBe('ready')
  })
})

describe('E. flight expected but absent', () => {
  it('is a Needs Attention reason and counts as a missing flight', () => {
    const p = complete(noFlight)
    expect(attentionCategoryKeys(p)).toContain('travel_incomplete')
    expect(deriveFlightStatus(p)).toBe('missing')
    expect(deriveReadiness(p).reasons).toContain('Itinerary missing for confirmed participant')
  })
})

describe('F. Flight Not Required', () => {
  it('creates no missing-flight attention and does not inflate the missing count', () => {
    const list = [complete({ id: 'expected', ...noFlight }), complete({ id: 'exempt', ...noFlight, ...inNigeria })]
    const missing = applyClientFilters(list, { flight_status: ['missing'] })
    const exempt = applyClientFilters(list, { flight_status: ['not_required'] })
    expect(missing.map((p) => p.id)).toEqual(['expected'])
    expect(exempt.map((p) => p.id)).toEqual(['exempt'])
    expect(attentionCategoryKeys(list[1])).not.toContain('travel_incomplete')
  })

  it('a submitted flight always wins: the normal workflow applies', () => {
    const p = complete({ ...inNigeria }) // has flights AND an exception on record
    expect(flightNotRequired(p)).toBe(false)
    expect(deriveFlightStatus(p)).toBe('booked')
    expect(flightNotRequiredInfo(p).superseded).toBe(true)
  })
})

describe('G. Flight Not Required record', () => {
  it('keeps reason, note, who set it and when', () => {
    const info = flightNotRequiredInfo(complete({ ...noFlight, ...inNigeria }))
    expect(info).toMatchObject({ reason: 'already_in_nigeria', label: 'Already in Nigeria', note: 'At the pre-conference', by: 'staff-1', at: '2026-09-30T12:00:00Z' })
  })

  it('reasons are open-ended: unknown values still display', () => {
    expect(FLIGHT_NOT_REQUIRED_REASONS.map((r) => r.value)).toContain('already_in_nigeria')
    expect(flightNotRequiredReasonLabel('attending_other_event')).toBe('Attending other event')
    expect(flightNotRequiredInfo(complete({ ...noFlight, flight_not_required_reason: 'attending_other_event' })).label).toBe('Attending other event')
    expect(flightNotRequiredInfo(complete())).toBeNull()
  })
})

describe('H. Confirmed + Immigration Form missing', () => {
  it('stays Confirmed and needs attention for incomplete documentation information', () => {
    const p = complete({ source_values: {} })
    const s = operationalSummary(p)
    expect(s.confirmed).toBe(true)
    expect(s.attention).toContain('documentation_incomplete')
    expect(s.docsIncomplete).toBe(true)
    expect(s.missingInfo.map((m) => m.key)).toContain('form_not_received')
  })

  it('lists each kind of missing information', () => {
    const keys = documentationMissingInfo(complete(infoMissing)).map((m) => m.key)
    expect(keys).toEqual(expect.arrayContaining(['form_not_received', 'canadian_status', 'passport_status', 'passport_region', 'visa_requirement']))
  })

  it('does not chase people staff are not yet counting on', () => {
    expect(documentationMissingInfo(complete({ ...infoMissing, participation_status: 'tracking' }))).toEqual([])
  })
})

describe('I. staff Mark reviewed: current-state acknowledgement', () => {
  it('B. clears the missing-information attention, keeps Confirmed, and keeps who/when/which state', () => {
    const before = complete(infoMissing)
    const after = review(before)
    expect(operationalSummary(before).attention).toContain('documentation_incomplete') // A
    const s = operationalSummary(after)
    expect(s.confirmed).toBe(true)
    expect(s.attention).not.toContain('documentation_incomplete')
    expect(s.attention).not.toContain('canadian_status_unknown')
    expect(s.attention).not.toContain('visa_unknown')
    expect(s.docsIncomplete).toBe(false)
    expect(s.docsReviewed).toBe(true)
    expect(needsAttentionNow(before)).toBe(true)
    expect(needsAttentionNow(after)).toBe(false)
    expect(after.documentation_review_by).toBe('staff-2')
    expect(after.documentation_review_at).toBe('2026-09-30T15:00:00Z')
    expect(after.documentation_review_fingerprint).toBe(documentationReviewFingerprint(before))
  })

  it('C. the same participant data has the same readiness before and after the checkmark; only attention changes', () => {
    const before = complete(infoMissing)
    const after = review(before)
    expect(deriveReadiness(after)).toEqual(deriveReadiness(before)) // reasons included: readiness is data only
    expect(deriveReadiness(before).readiness).toBe('action_required')
    expect(attentionReasons(before)).toEqual(deriveReadiness(before).reasons)
    expect(attentionReasons(after)).toEqual([]) // only the reasons staff must act on shrink
  })

  it('D. the missing values remain missing and nothing is fabricated', () => {
    const before = complete(infoMissing)
    const after = review(before)
    const { documentation_review_by: _by, documentation_review_at: _at, documentation_review_fingerprint: _fp, ...rest } = after
    expect(rest).toEqual(before) // the review changes no participant data at all
    expect(documentationMissingInfo(after).map((m) => m.key)).toEqual(documentationMissingInfo(before).map((m) => m.key))
    expect(after.passport_readiness).toBe('unknown')
    expect(after.canada_residency_status).toBeNull()
    expect(after.visa_requirement).toBe('review')
    expect(after.source_values).toEqual({})
  })

  it('E. an unchanged missing-information state does not reappear', () => {
    const reviewed = review(complete(infoMissing))
    // later evaluations with the same state (e.g. an unrelated edit) stay acknowledged
    const later = { ...reviewed, notes: 'unrelated note', subgroup: 'BLW West Subgroup A' }
    expect(operationalSummary(later).attention).not.toContain('documentation_incomplete')
    expect(operationalSummary(later).docsReviewed).toBe(true)
  })

  it('F. a new missing-information reason after review brings attention back', () => {
    const start = complete({ ...infoMissing, canada_residency_status: 'CANADIAN_CITIZEN', passport_readiness: 'ready', passport_country: 'Nigeria', visa_requirement: 'not_required' }) // only the form is missing
    expect(documentationMissingInfo(start).map((m) => m.key)).toEqual(['form_not_received'])
    const reviewed = review(start)
    expect(operationalSummary(reviewed).attention).not.toContain('documentation_incomplete')
    // passport status stops being known: a new missing-information reason
    const changed = { ...reviewed, passport_readiness: 'unknown' }
    expect(documentationMissingInfo(changed).map((m) => m.key)).toEqual(['form_not_received', 'passport_status'])
    const s = operationalSummary(changed)
    expect(s.attention).toContain('documentation_incomplete')
    expect(s.docsIncomplete).toBe(true)
    expect(s.docsReviewed).toBe(false)
    expect(s.docsReviewStale).toBe(true)
  })

  it('G. information that was complete and later goes missing again is not silently exempt', () => {
    const reviewed = review(complete(infoMissing)) // reviewed while several things were missing
    const filled = { ...reviewed, source_values: { cmp_documentation: { submission_id: 'f', canadian_doc_valid_through_nov: 'Yes' } }, canada_residency_status: 'CANADIAN_CITIZEN', passport_readiness: 'ready', passport_country: 'Nigeria', visa_requirement: 'not_required' }
    expect(documentationMissingInfo(filled)).toEqual([])
    expect(operationalSummary(filled).attention).not.toContain('documentation_incomplete') // nothing missing
    // later just the passport status is lost: a different state from the one that was reviewed
    const broken = { ...filled, passport_readiness: 'unknown' }
    expect(operationalSummary(broken).attention).toContain('documentation_incomplete')
    expect(operationalSummary(broken).docsReviewed).toBe(false)
  })

  it('a review never applies when nothing is missing', () => {
    const p = { ...complete(), documentation_review_at: '2026-09-30T15:00:00Z', documentation_review_fingerprint: '' }
    expect(operationalSummary(p).docsReviewed).toBe(false)
  })
})

describe('H-K, M. acknowledgement never clears a real problem or registration', () => {
  it('H. a known visa issue remains', () => {
    const p = review(complete({ ...infoMissing, visa_requirement: 'required', visa_process_status: 'issue' }))
    expect(attentionCategoryKeys(p)).toContain('visa_blocked')
    expect(attentionCategoryKeys(p)).not.toContain('documentation_incomplete')
    expect(deriveReadiness(p).reasons).toContain('Visa issue')
    expect(attentionReasons(p)).toContain('Visa issue')
    expect(needsAttentionNow(p)).toBe(true)
  })

  it('I. a known passport issue (no valid passport) remains', () => {
    const p = review(complete({ ...infoMissing, passport_readiness: 'no_passport' }))
    expect(attentionCategoryKeys(p)).toContain('passport_incomplete')
    expect(attentionReasons(p)).toContain('Passport action needed')
    expect(needsAttentionNow(p)).toBe(true)
  })

  it('J. a Canadian-documents self-reported concern remains', () => {
    const p = review(complete({
      ...infoMissing, canada_residency_status: 'PERMANENT_RESIDENT',
      source_values: { cmp_documentation: { submission_id: 'f', canadian_doc_valid_through_nov: 'No' } },
    }))
    expect(attentionCategoryKeys(p)).toContain('canadian_docs_review')
    expect(attentionReasons(p).join(' ')).toMatch(/Canadian immigration\/residency documents require review/)
    expect(needsAttentionNow(p)).toBe(true)
  })

  it('K. missing registration always remains, whatever else is reviewed', () => {
    for (const base of [complete(unregistered), complete({ ...unregistered, ...infoMissing }), complete({ ...unregistered, ...noFlight, ...inNigeria })]) {
      const p = review(base)
      expect(attentionCategoryKeys(p)[0]).toBe('registration_missing')
      expect(operationalSummary(p).urgent).toBe(true)
      expect(attentionReasons(p)).toContain('Registration outstanding')
      expect(needsAttentionNow(p)).toBe(true)
    }
  })

  it('a flight that is expected but genuinely missing remains', () => {
    const p = review(complete({ ...infoMissing, ...noFlight }))
    expect(attentionCategoryKeys(p)).toContain('travel_incomplete')
    expect(attentionReasons(p)).toContain('Itinerary missing for confirmed participant')
  })
})

describe('N-O. registration cannot be waived', () => {
  it('N. Flight Not Required does not waive registration', () => {
    const p = complete({ ...unregistered, ...noFlight, ...inNigeria })
    expect(isRegistrationIncomplete(p)).toBe(true)
  })

  it('O. only a real registration satisfies it: no "not required" value exists or is honoured', () => {
    for (const status of ['not_required', 'waived', 'unknown', 'issue', 'not_registered', undefined]) {
      expect(isRegistrationIncomplete(complete({ registration_status: status, registration_link_status: undefined }))).toBe(true)
    }
    expect(isRegistrationIncomplete(complete({ registration_status: 'registered', registration_link_status: undefined }))).toBe(false)
    // staff cannot override it away either
    expect(isRegistrationIncomplete(complete({ ...unregistered, override_fields: { registration_status: { overridden: true } } }))).toBe(true)
    // and no registration UI or rule mentions such a state
    for (const file of ['src/features/icplc/components/tabs/RegistrationTab.jsx', 'src/features/icplc/lib/documentationRules.js', 'src/features/icplc/lib/attentionModel.js']) {
      expect(readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')).not.toMatch(/registration[^\n]{0,40}not[_ ]required/i)
    }
  })

  it('not-attending people are simply not chased for registration', () => {
    expect(isRegistrationIncomplete(complete({ ...unregistered, participation_status: 'not_attending' }))).toBe(false)
  })
})

describe('P. assistance requested', () => {
  it('creates ICPLC follow-up and does not by itself change readiness or attention', () => {
    const plain = complete({ visa_requirement: 'required', visa_process_status: 'approved' })
    const asked = { ...plain, documentation_assistance_requested: true }
    expect(deriveReadiness(asked)).toEqual(deriveReadiness(plain))
    expect(attentionCategoryKeys(asked)).toEqual(attentionCategoryKeys(plain))
    const actions = deriveDocumentationActions(asked, { targets: {}, now: NOW })
    expect(actions.assistance).toBe(true)
    expect(actions.items.find((i) => i.id === 'assistance').kind).toBe('team')
  })
})

describe('attention priority and filters', () => {
  it('orders registration, then known problems, then information gaps', () => {
    const p = complete({ ...unregistered, ...infoMissing, visa_requirement: 'required', visa_process_status: 'issue', passport_readiness: 'no_passport' })
    const keys = attentionCategoryKeys(p)
    expect(keys[0]).toBe('registration_missing')
    const lastKnown = Math.max(keys.indexOf('visa_blocked'), keys.indexOf('passport_incomplete'))
    expect(lastKnown).toBeLessThan(keys.indexOf('documentation_incomplete'))
    expect(sortAttentionKeys(['documentation_incomplete', 'travel_incomplete', 'registration_missing', 'not_registered'])).toEqual(['registration_missing', 'not_registered', 'travel_incomplete', 'documentation_incomplete'])
  })

  it('an overdue target never makes anyone Blocked', () => {
    const p = complete({ visa_requirement: 'required', visa_process_status: 'not_started' })
    const risk = deriveDocumentationActions(p, { targets: { visaTarget: '2020-01-01' }, now: NOW })
    expect(risk.worst).toBe('overdue')
    expect(deriveReadiness(p).readiness).not.toBe('blocked')
  })

  it('the Working List filters find each operational state', () => {
    const list = [
      complete({ id: 'ok' }),
      complete({ id: 'reg', ...unregistered }),
      complete({ id: 'reg-tracking', ...unregistered, participation_status: 'tracking' }),
      complete({ id: 'flight', ...noFlight }),
      complete({ id: 'docs', ...infoMissing }),
      { ...review(complete({ ...infoMissing })), id: 'docs-ack' },
    ]
    const ids = (state) => applyClientFilters(list, { attention_state: [state] }).map((p) => p.id).sort()
    // these fixtures have a submitted flight and the Immigration Form, so an unregistered one is Registration Missing
    expect(ids('registration_missing')).toEqual(['reg', 'reg-tracking'])
    expect(ids('confirmed_registration_missing')).toEqual(['reg'])
    expect(ids('not_registered')).toEqual([])
    expect(ids('confirmed_not_registered')).toEqual([])
    expect(ids('confirmed_needs_attention')).toEqual(['docs', 'flight', 'reg'])
    expect(ids('docs_incomplete')).toEqual(['docs'])
    expect(ids('docs_review_acknowledged')).toEqual(['docs-ack'])
    expect(matchesAttentionState(list[0], 'nonsense')).toBe(false)
  })
})

describe('L-M. Flight Not Required satisfies the travel dependency without an itinerary', () => {
  it('L. someone already in Nigeria is not held in Waiting on itinerary, and nothing is invented', () => {
    const withException = complete({ ...noFlight, ...inNigeria })
    const without = complete({ ...noFlight })
    expect(deriveReadiness(without).readiness).not.toBe('ready')
    expect(deriveReadiness(withException).readiness).toBe('ready')
    expect(deriveReadiness(withException).readiness).not.toBe('waiting_itinerary')
    expect(withException.arrival_flight).toBeNull()
    expect(withException.arrival_date).toBeNull()
    expect(deriveItineraryStatus(withException)).toBe('missing') // still no itinerary data
  })

  it('L. a person with settled documents but no exception is held at Waiting on itinerary', () => {
    const p = complete({ ...noFlight, participation_status: 'likely' })
    expect(deriveReadiness(p).readiness).toBe('waiting_itinerary')
    expect(deriveReadiness({ ...p, ...inNigeria }).readiness).toBe('ready')
  })

  it('M. Flight Not Required + registration missing: registration stays urgent and the person is not Ready', () => {
    const p = complete({ ...unregistered, ...noFlight, ...inNigeria })
    expect(operationalSummary(p).urgent).toBe(true)
    expect(attentionCategoryKeys(p)[0]).toBe('registration_missing')
    expect(deriveReadiness(p).readiness).toBe('action_required')
  })
})
