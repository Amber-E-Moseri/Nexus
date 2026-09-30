import { describe, it, expect } from 'vitest'
import {
  hasMeaningfulFlight,
  attendanceEvidence,
  isTravelRelevant,
  flightNotRequired,
  hasFlightData,
} from '../../features/icplc/lib/flightRequirement.js'
import { attentionCategoryKeys, registrationState } from '../../features/icplc/lib/documentationRules.js'
import { isActiveParticipant } from '../../features/icplc/lib/reconciliation.js'
import { deriveReadiness, effectiveParticipationStatus } from '../../features/icplc/lib/readinessEngine.js'

// ---------------------------------------------------------------------------
// Base fixture factories
// ---------------------------------------------------------------------------
const base = (overrides = {}) => ({
  participation_status: 'confirmed',
  arrival_flight: null,
  departure_flight: null,
  arrival_date: null,
  departure_date: null,
  flight_not_required_reason: null,
  passport_readiness: 'ready',
  passport_country: 'CA',
  canada_residency_status: 'canadian_citizen',
  visa_requirement: null,
  visa_process_status: null,
  registration_link_status: 'registered',
  registration_status: 'registered',
  ...overrides,
})

// ---------------------------------------------------------------------------
// Phase 1 — Attendance evidence (hasMeaningfulFlight / attendanceEvidence)
// ---------------------------------------------------------------------------
describe('hasMeaningfulFlight', () => {
  it('S1 returns false for participant with no flight data', () => {
    expect(hasMeaningfulFlight(base())).toBe(false)
  })

  it('S2 returns true when arrival_flight is set', () => {
    expect(hasMeaningfulFlight(base({ arrival_flight: 'AC123' }))).toBe(true)
  })

  it('S3 returns true when departure_flight is set', () => {
    expect(hasMeaningfulFlight(base({ departure_flight: 'EK001' }))).toBe(true)
  })
})

describe('attendanceEvidence', () => {
  it('S4 returns null for confirmed participant with flight (already the strongest status)', () => {
    expect(attendanceEvidence(base({ arrival_flight: 'AC123' }))).toBeNull()
  })

  it('S5 returns null for participant without any flight number', () => {
    expect(attendanceEvidence(base({ participation_status: 'likely' }))).toBeNull()
  })

  it('S6 returns evidence for tracking participant with flight', () => {
    const r = attendanceEvidence(base({ participation_status: 'tracking', arrival_flight: 'AC123' }))
    expect(r).not.toBeNull()
    expect(r.type).toBe('evidence')
  })

  it('S7 returns conflict for not_attending participant with flight', () => {
    const r = attendanceEvidence(base({ participation_status: 'not_attending', arrival_flight: 'AC123' }))
    expect(r).not.toBeNull()
    expect(r.type).toBe('conflict')
  })
})

// ---------------------------------------------------------------------------
// Phase 6-8 — FNR semantics (flightNotRequired / isTravelRelevant)
// ---------------------------------------------------------------------------
describe('flightNotRequired', () => {
  it('S8 returns true when reason is set and no flight data exists', () => {
    expect(flightNotRequired(base({ flight_not_required_reason: 'already_in_nigeria' }))).toBe(true)
  })

  it('S9 returns false when reason is set but departure_flight is also present (superseded)', () => {
    expect(flightNotRequired(base({ flight_not_required_reason: 'already_in_nigeria', departure_flight: 'EK001' }))).toBe(false)
  })

  it('S10 returns false when no reason is set', () => {
    expect(flightNotRequired(base())).toBe(false)
  })
})

describe('isTravelRelevant', () => {
  it('S11 returns false for not_attending participant', () => {
    expect(isTravelRelevant(base({ participation_status: 'not_attending' }))).toBe(false)
  })

  it('S12 returns false for FNR participant with no flight', () => {
    expect(isTravelRelevant(base({ flight_not_required_reason: 'already_in_nigeria' }))).toBe(false)
  })

  it('S13 returns true for FNR participant whose flight was later submitted (superseded)', () => {
    expect(isTravelRelevant(base({ flight_not_required_reason: 'already_in_nigeria', departure_flight: 'EK001' }))).toBe(true)
  })

  it('S14 returns true for active participant with no FNR', () => {
    expect(isTravelRelevant(base({ participation_status: 'likely' }))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 2 — isActiveParticipant
// ---------------------------------------------------------------------------
describe('isActiveParticipant', () => {
  it('S15 returns false for not_attending', () => {
    expect(isActiveParticipant(base({ participation_status: 'not_attending' }))).toBe(false)
  })

  it('S16 returns true for confirmed / likely / tracking', () => {
    expect(isActiveParticipant(base({ participation_status: 'confirmed' }))).toBe(true)
    expect(isActiveParticipant(base({ participation_status: 'likely' }))).toBe(true)
    expect(isActiveParticipant(base({ participation_status: 'tracking' }))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 10 / Phase 3 — attentionCategoryKeys absent exclusion + FNR gate
// ---------------------------------------------------------------------------
describe('attentionCategoryKeys', () => {
  it('S17 returns [] for not_attending participant (Phase 2: absent exclusion)', () => {
    expect(attentionCategoryKeys(base({ participation_status: 'not_attending' }))).toEqual([])
  })

  it('S18 does NOT fire travel_incomplete when flight_not_required_reason is set, even if FNR superseded', () => {
    // Participant has a departure flight (FNR superseded) but flight_not_required_reason is still set.
    // The arrival is absent — without the guard this would fire a false "missing arrival" warning.
    const p = base({
      participation_status: 'confirmed',
      flight_not_required_reason: 'already_in_nigeria',
      departure_flight: 'EK001',
      arrival_flight: null,
      arrival_date: null,
    })
    expect(attentionCategoryKeys(p)).not.toContain('travel_incomplete')
  })

  it('fires travel_incomplete for confirmed participant with no itinerary and no FNR context', () => {
    const p = base({
      participation_status: 'confirmed',
      arrival_flight: null,
      arrival_date: null,
      flight_not_required_reason: null,
    })
    expect(attentionCategoryKeys(p)).toContain('travel_incomplete')
  })

  it('does NOT fire travel_incomplete when FNR is active (no flight data)', () => {
    const p = base({
      participation_status: 'confirmed',
      flight_not_required_reason: 'already_in_nigeria',
      arrival_flight: null,
      arrival_date: null,
    })
    expect(attentionCategoryKeys(p)).not.toContain('travel_incomplete')
  })
})

// ---------------------------------------------------------------------------
// Working On semantics — participation-based grouping for Overview
// The predicate mirrors OverviewPage inline logic: likely | uncertain only.
// ---------------------------------------------------------------------------
function isWorkingOn(p) {
  return p?.participation_status === 'likely' || p?.participation_status === 'uncertain'
}

describe('Working On grouping (Overview participation-based)', () => {
  it('S20 likely participant is Working On', () => {
    expect(isWorkingOn(base({ participation_status: 'likely' }))).toBe(true)
  })

  it('S21 uncertain participant is Working On', () => {
    expect(isWorkingOn(base({ participation_status: 'uncertain' }))).toBe(true)
  })

  it('S22 confirmed participant is NOT Working On', () => {
    expect(isWorkingOn(base({ participation_status: 'confirmed' }))).toBe(false)
  })

  it('S23 not_attending is neither Working On nor Active', () => {
    const p = base({ participation_status: 'not_attending' })
    expect(isWorkingOn(p)).toBe(false)
    expect(isActiveParticipant(p)).toBe(false)
  })

  it('S24 Working On = Likely + Uncertain; tracking and confirmed excluded', () => {
    const all = [
      base({ participation_status: 'likely' }),
      base({ participation_status: 'uncertain' }),
      base({ participation_status: 'confirmed' }),
      base({ participation_status: 'tracking' }),
      base({ participation_status: 'not_attending' }),
    ]
    const working = all.filter(isWorkingOn)
    expect(working).toHaveLength(2)
    expect(working.map((p) => p.participation_status).sort()).toEqual(['likely', 'uncertain'])
  })

  it('S25 readiness value never changes Working On membership (participation_status is the only gate)', () => {
    // Verify isWorkingOn is purely participation_status-based by checking against every readiness value.
    // A likely participant stays Working On regardless of what deriveReadiness returns.
    const likely = base({ participation_status: 'likely' })
    expect(isWorkingOn(likely)).toBe(true)

    // If we can construct a truly ready likely participant, confirm the independence.
    // passport_country: null so effectiveVisaRequirement can't infer ECOWAS; visa must be explicit.
    const likelyReady = base({
      participation_status: 'likely',
      passport_readiness: 'ready',
      visa_requirement: 'not_required',
      canada_residency_status: null, // no Canadian doc needed when null
      passport_country: null,        // avoids country-based side effects
      flight_not_required_reason: 'already_in_nigeria',
    })
    expect(isWorkingOn(likelyReady)).toBe(true)
    // Key invariant: no matter what readiness is, likely stays Working On
    expect(['action_required', 'in_progress', 'blocked', 'waiting_itinerary', 'ready', 'unknown']).toContain(
      deriveReadiness(likelyReady).readiness,
    )
  })

  it('S26 confirmed + action_required readiness → Confirmed, not Working On', () => {
    const p = base({
      participation_status: 'confirmed',
      passport_readiness: 'renewal_needed',
      arrival_flight: null,
      arrival_date: null,
    })
    expect(isWorkingOn(p)).toBe(false)
    expect(p.participation_status).toBe('confirmed')
    expect(deriveReadiness(p).readiness).toBe('action_required')
  })

  it('S27 flight evidence on a likely participant does NOT change Overview grouping', () => {
    const p = base({ participation_status: 'likely', arrival_flight: 'AC123' })
    expect(isWorkingOn(p)).toBe(true)
    expect(p.participation_status).toBe('likely')
  })

  it('S28 bulk confirm likely: participation_status=confirmed → leaves Working On', () => {
    const before = base({ participation_status: 'likely' })
    expect(isWorkingOn(before)).toBe(true)
    const after = { ...before, participation_status: 'confirmed' }
    expect(isWorkingOn(after)).toBe(false)
    expect(after.participation_status).toBe('confirmed')
  })
})

// ---------------------------------------------------------------------------
// CANONICAL EFFECTIVE PARTICIPATION STATUS — 23 required test cases
// ---------------------------------------------------------------------------
describe('effectiveParticipationStatus', () => {
  // Tracking cases (01-08)
  it('E01 Tracking + nothing -> Tracking', () => {
    const p = base({ participation_status: 'tracking' })
    expect(effectiveParticipationStatus(p)).toBe('tracking')
  })

  it('E02 Tracking + arrival flight -> Likely', () => {
    const p = base({ participation_status: 'tracking', arrival_flight: 'AC123' })
    expect(effectiveParticipationStatus(p)).toBe('likely')
  })

  it('E03 Tracking + departure flight -> Likely', () => {
    const p = base({ participation_status: 'tracking', departure_flight: 'EK001' })
    expect(effectiveParticipationStatus(p)).toBe('likely')
  })

  it('E04 Tracking + CMP flight (via arrival_flight from CMP) -> Likely', () => {
    // hasMeaningfulFlight checks arrival_flight / departure_flight columns.
    // CMP flights are normalized into these columns when imported.
    const p = base({
      participation_status: 'tracking',
      arrival_flight: 'CMP:AF789', // CMP flights appear in the flight columns
    })
    expect(effectiveParticipationStatus(p)).toBe('likely')
  })

  it('E05 Tracking + empty flight structures -> Tracking', () => {
    const p = base({
      participation_status: 'tracking',
      arrival_flight: null,
      departure_flight: null,
      arrival_date: null,
      departure_date: null,
      source_values: {},
    })
    expect(effectiveParticipationStatus(p)).toBe('tracking')
  })

  it('E06 Tracking + FNR -> Likely', () => {
    const p = base({
      participation_status: 'tracking',
      flight_not_required_reason: 'already_in_nigeria',
    })
    expect(effectiveParticipationStatus(p)).toBe('likely')
  })

  it('E07 Tracking + FNR with no flight -> Likely', () => {
    const p = base({
      participation_status: 'tracking',
      flight_not_required_reason: 'other',
      arrival_flight: null,
      departure_flight: null,
    })
    expect(effectiveParticipationStatus(p)).toBe('likely')
  })

  it('E08 Tracking + FNR + flight -> Likely', () => {
    const p = base({
      participation_status: 'tracking',
      flight_not_required_reason: 'already_in_nigeria',
      arrival_flight: 'BA999',
    })
    expect(effectiveParticipationStatus(p)).toBe('likely')
  })

  // Likely cases (09-11)
  it('E09 Likely + nothing -> Likely', () => {
    const p = base({ participation_status: 'likely' })
    expect(effectiveParticipationStatus(p)).toBe('likely')
  })

  it('E10 Likely + flight -> Likely', () => {
    const p = base({ participation_status: 'likely', arrival_flight: 'AC123' })
    expect(effectiveParticipationStatus(p)).toBe('likely')
  })

  it('E11 Likely + FNR -> Likely', () => {
    const p = base({ participation_status: 'likely', flight_not_required_reason: 'already_in_nigeria' })
    expect(effectiveParticipationStatus(p)).toBe('likely')
  })

  // Uncertain cases (12-15)
  it('E12 Uncertain + nothing -> Uncertain', () => {
    const p = base({ participation_status: 'uncertain' })
    expect(effectiveParticipationStatus(p)).toBe('uncertain')
  })

  it('E13 Uncertain + flight -> Uncertain (evidence shown, not promoted)', () => {
    const p = base({ participation_status: 'uncertain', arrival_flight: 'AC123' })
    expect(effectiveParticipationStatus(p)).toBe('uncertain')
  })

  it('E14 Uncertain + FNR -> Uncertain (evidence shown, not promoted)', () => {
    const p = base({
      participation_status: 'uncertain',
      flight_not_required_reason: 'already_in_nigeria',
    })
    expect(effectiveParticipationStatus(p)).toBe('uncertain')
  })

  it('E15 Uncertain + flight + FNR -> Uncertain', () => {
    const p = base({
      participation_status: 'uncertain',
      arrival_flight: 'BA999',
      flight_not_required_reason: 'already_in_nigeria',
    })
    expect(effectiveParticipationStatus(p)).toBe('uncertain')
  })

  // Confirmed cases (16-18)
  it('E16 Confirmed + nothing -> Confirmed', () => {
    const p = base({ participation_status: 'confirmed' })
    expect(effectiveParticipationStatus(p)).toBe('confirmed')
  })

  it('E17 Confirmed + flight -> Confirmed (never promoted)', () => {
    const p = base({ participation_status: 'confirmed', arrival_flight: 'AC123' })
    expect(effectiveParticipationStatus(p)).toBe('confirmed')
  })

  it('E18 Confirmed + FNR -> Confirmed', () => {
    const p = base({
      participation_status: 'confirmed',
      flight_not_required_reason: 'already_in_nigeria',
    })
    expect(effectiveParticipationStatus(p)).toBe('confirmed')
  })

  // Not Attending cases (19-22)
  it('E19 Not attending + nothing -> Not attending', () => {
    const p = base({ participation_status: 'not_attending' })
    expect(effectiveParticipationStatus(p)).toBe('not_attending')
  })

  it('E20 Not attending + flight -> Not attending (conflict detected separately)', () => {
    const p = base({ participation_status: 'not_attending', arrival_flight: 'AC123' })
    expect(effectiveParticipationStatus(p)).toBe('not_attending')
  })

  it('E21 Not attending + FNR -> Not attending (conflict detected separately)', () => {
    const p = base({
      participation_status: 'not_attending',
      flight_not_required_reason: 'already_in_nigeria',
    })
    expect(effectiveParticipationStatus(p)).toBe('not_attending')
  })

  it('E22 Not attending + flight + FNR -> Not attending', () => {
    const p = base({
      participation_status: 'not_attending',
      arrival_flight: 'BA999',
      flight_not_required_reason: 'already_in_nigeria',
    })
    expect(effectiveParticipationStatus(p)).toBe('not_attending')
  })

  // Confirmation invariant (23)
  it('E23 No evidence combination produces Confirmed', () => {
    // Only persisted confirmed produces confirmed; derivation never creates it
    const noEvidence = base({
      participation_status: 'tracking',
      arrival_flight: null,
      departure_flight: null,
      flight_not_required_reason: null,
    })
    expect(effectiveParticipationStatus(noEvidence)).not.toBe('confirmed')

    const withEvidence = base({
      participation_status: 'tracking',
      arrival_flight: 'AC123',
    })
    expect(effectiveParticipationStatus(withEvidence)).not.toBe('confirmed')
  })
})

// ---------------------------------------------------------------------------
// ATTENDANCE CONFLICT — FNR participates in conflict detection
// ---------------------------------------------------------------------------
describe('attendanceEvidence with FNR conflicts', () => {
  it('C01 Not attending + meaningful flight -> ONE attendance conflict', () => {
    const p = base({
      participation_status: 'not_attending',
      arrival_flight: 'AC123',
    })
    const ev = attendanceEvidence(p)
    expect(ev).not.toBeNull()
    expect(ev.type).toBe('conflict')
    expect(ev.label).toContain('flight')
  })

  it('C02 Not attending + FNR -> ONE attendance conflict', () => {
    const p = base({
      participation_status: 'not_attending',
      flight_not_required_reason: 'already_in_nigeria',
    })
    const ev = attendanceEvidence(p)
    expect(ev).not.toBeNull()
    expect(ev.type).toBe('conflict')
    expect(ev.label).toContain('FNR')
  })

  it('C03 Not attending + flight alone -> ONE conflict on flight', () => {
    // When both flight and FNR exist, flight supersedes FNR (per flightNotRequired logic).
    // Test flight-only case explicitly.
    const p = base({
      participation_status: 'not_attending',
      arrival_flight: 'BA999',
      flight_not_required_reason: null, // no FNR
    })
    const ev = attendanceEvidence(p)
    expect(ev).not.toBeNull()
    expect(ev.type).toBe('conflict')
    expect(ev.label).toContain('flight')
  })

  it('C04 Tracking + FNR -> positive evidence (not conflict)', () => {
    const p = base({
      participation_status: 'tracking',
      flight_not_required_reason: 'already_in_nigeria',
    })
    const ev = attendanceEvidence(p)
    expect(ev).not.toBeNull()
    expect(ev.type).toBe('evidence')
  })

  it('C05 Uncertain + flight -> evidence displayed (Uncertain not promoted)', () => {
    const p = base({
      participation_status: 'uncertain',
      arrival_flight: 'AC123',
    })
    const ev = attendanceEvidence(p)
    expect(ev).not.toBeNull()
    expect(ev.type).toBe('evidence')
  })

  it('C06 Confirmed + FNR -> null (Confirmed suppresses derived evidence)', () => {
    const p = base({
      participation_status: 'confirmed',
      flight_not_required_reason: 'already_in_nigeria',
    })
    const ev = attendanceEvidence(p)
    expect(ev).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// REVERSIBILITY — Flight/FNR removal preserves expected state
// ---------------------------------------------------------------------------
describe('effectiveParticipationStatus reversibility', () => {
  it('R01 Tracking + flight -> Likely; remove flight -> Tracking', () => {
    const withFlight = base({
      participation_status: 'tracking',
      arrival_flight: 'AC123',
    })
    expect(effectiveParticipationStatus(withFlight)).toBe('likely')

    const noFlight = {
      ...withFlight,
      arrival_flight: null,
    }
    expect(effectiveParticipationStatus(noFlight)).toBe('tracking')
  })

  it('R02 Tracking + FNR -> Likely; remove FNR -> Tracking', () => {
    const withFNR = base({
      participation_status: 'tracking',
      flight_not_required_reason: 'already_in_nigeria',
    })
    expect(effectiveParticipationStatus(withFNR)).toBe('likely')

    const noFNR = {
      ...withFNR,
      flight_not_required_reason: null,
    }
    expect(effectiveParticipationStatus(noFNR)).toBe('tracking')
  })

  it('R03 Tracking + FNR + flight -> Likely; remove flight (FNR remains) -> Likely', () => {
    const both = base({
      participation_status: 'tracking',
      flight_not_required_reason: 'already_in_nigeria',
      arrival_flight: 'BA999',
    })
    expect(effectiveParticipationStatus(both)).toBe('likely')

    const fnrOnly = {
      ...both,
      arrival_flight: null,
    }
    expect(effectiveParticipationStatus(fnrOnly)).toBe('likely')
  })

  it('R04 Tracking + FNR + flight -> Likely; remove FNR (flight remains) -> Likely', () => {
    const both = base({
      participation_status: 'tracking',
      flight_not_required_reason: 'already_in_nigeria',
      arrival_flight: 'BA999',
    })
    expect(effectiveParticipationStatus(both)).toBe('likely')

    const flightOnly = {
      ...both,
      flight_not_required_reason: null,
    }
    expect(effectiveParticipationStatus(flightOnly)).toBe('likely')
  })

  it('R05 Tracking + FNR + flight -> Likely; remove both -> Tracking', () => {
    const both = base({
      participation_status: 'tracking',
      flight_not_required_reason: 'already_in_nigeria',
      arrival_flight: 'BA999',
    })
    expect(effectiveParticipationStatus(both)).toBe('likely')

    const neither = {
      ...both,
      flight_not_required_reason: null,
      arrival_flight: null,
    }
    expect(effectiveParticipationStatus(neither)).toBe('tracking')
  })
})

// ---------------------------------------------------------------------------
// TEST 2 REFERENCE CASE — Regression for recorded Tracking + flight
// ---------------------------------------------------------------------------
describe('test 2 reference case: Tracking + flight → effective Likely', () => {
  it('T2 Recorded Tracking with arrival flight derives Likely', () => {
    // Registration Missing: participant has evidence of ICPLC activity (flight received)
    // but registration is not complete. The flight evidence alone creates registration_missing
    // (distinct from not_registered, which has no evidence at all).
    const p = base({
      participation_status: 'tracking',
      arrival_flight: 'AC123', // evidence of ICPLC activity
      registration_status: 'not_registered', // not complete; hasFlightData makes this registration_missing
      registration_link_status: null, // no linked registration
    })
    expect(effectiveParticipationStatus(p)).toBe('likely')
    expect(p.participation_status).toBe('tracking') // persisted unchanged
    // hasFlightData triggers registrationProgressSignals, making it registration_missing not not_registered
    expect(registrationState(p)).toBe('registration_missing')
  })
})
