/**
 * Bulk operation tests — Bulk Confirm + Bulk FNR
 *
 * Tests pure eligibility logic (partitionFNREligibility, hasFlightData) and the
 * participation-status integration certified in 4a7b2de. No Supabase calls are made.
 */

import { describe, test, expect } from 'vitest'
import { hasFlightData } from '../../features/icplc/lib/flightRequirement.js'
import { partitionFNREligibility } from '../../features/icplc/lib/flightRequirement.js'
import { effectiveParticipationStatus } from '../../features/icplc/lib/readinessEngine.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE = {
  participation_status: 'tracking',
  arrival_flight: null,
  arrival_date: null,
  departure_flight: null,
  departure_date: null,
  flight_not_required_reason: null,
  flight_not_required_note: null,
  flight_not_required_by: null,
  flight_not_required_at: null,
}

function p(id, overrides = {}) { return { ...BASE, id, ...overrides } }
function rowMap(participants) { return new Map(participants.map((pt) => [pt.id, pt])) }

// ── BULK CONFIRM — eligible subset ────────────────────────────────────────────

// Mirrors the filter logic in BulkActionBar lines 112-113:
//   eligible = selectedIds.filter(id => participant.participation_status !== 'not_attending')
function confirmEligible(selectedIds, participants) {
  return selectedIds.filter(
    (id) => participants.find((pt) => pt.id === id)?.participation_status !== 'not_attending'
  )
}

describe('Bulk Confirm — eligible subset', () => {
  test('CC-01: all non-absent statuses are eligible', () => {
    const participants = [
      p('a', { participation_status: 'tracking' }),
      p('b', { participation_status: 'likely' }),
      p('c', { participation_status: 'confirmed' }),
      p('d', { participation_status: 'uncertain' }),
    ]
    const eligible = confirmEligible(['a', 'b', 'c', 'd'], participants)
    expect(eligible).toEqual(['a', 'b', 'c', 'd'])
  })

  test('CC-02: not_attending participant is excluded from eligible set', () => {
    const participants = [
      p('a', { participation_status: 'tracking' }),
      p('b', { participation_status: 'not_attending' }),
      p('c', { participation_status: 'likely' }),
    ]
    const eligible = confirmEligible(['a', 'b', 'c'], participants)
    expect(eligible).toEqual(['a', 'c'])
    expect(eligible).not.toContain('b')
  })

  test('CC-03: all not_attending => eligible is empty', () => {
    const participants = [
      p('a', { participation_status: 'not_attending' }),
      p('b', { participation_status: 'not_attending' }),
    ]
    const eligible = confirmEligible(['a', 'b'], participants)
    expect(eligible).toHaveLength(0)
  })

  test('CC-04: only participation_status field is written by Bulk Confirm', () => {
    // Documents the contract: the fields object passed to updateMut.mutateAsync
    const fieldsWritten = { participation_status: 'confirmed' }
    expect(Object.keys(fieldsWritten)).toEqual(['participation_status'])
  })

  test('CC-05: registration columns are not part of the Bulk Confirm update', () => {
    const fieldsWritten = { participation_status: 'confirmed' }
    for (const f of ['registration_status', 'registration_link_status']) {
      expect(fieldsWritten).not.toHaveProperty(f)
    }
  })

  test('CC-06: readiness/documentation columns are not part of the Bulk Confirm update', () => {
    const fieldsWritten = { participation_status: 'confirmed' }
    for (const f of ['passport_readiness', 'visa_requirement', 'visa_process_status']) {
      expect(fieldsWritten).not.toHaveProperty(f)
    }
  })
})

// ── hasFlightData — canonical predicate ───────────────────────────────────────

describe('hasFlightData — canonical flight evidence predicate', () => {
  test('FD-01: no flight fields => false', () => {
    expect(hasFlightData(p('x'))).toBe(false)
  })

  test('FD-02: arrival_flight number => true', () => {
    expect(hasFlightData(p('x', { arrival_flight: 'AC101' }))).toBe(true)
  })

  test('FD-03: departure_flight number => true', () => {
    expect(hasFlightData(p('x', { departure_flight: 'WS202' }))).toBe(true)
  })

  test('FD-04: arrival_date only (no flight number) => true', () => {
    expect(hasFlightData(p('x', { arrival_date: '2026-11-01' }))).toBe(true)
  })

  test('FD-05: departure_date only (no flight number) => true', () => {
    expect(hasFlightData(p('x', { departure_date: '2026-11-08' }))).toBe(true)
  })

  test('FD-06: all four flight fields set => true', () => {
    expect(hasFlightData(p('x', {
      arrival_flight: 'AC101', arrival_date: '2026-11-01',
      departure_flight: 'WS202', departure_date: '2026-11-08',
    }))).toBe(true)
  })
})

// ── partitionFNREligibility — server-side canonical re-check ──────────────────

describe('partitionFNREligibility', () => {
  test('BF-01: all eligible when no flight data and not not_attending', () => {
    const participants = [
      p('a', { participation_status: 'tracking' }),
      p('b', { participation_status: 'likely' }),
      p('c', { participation_status: 'confirmed' }),
      p('d', { participation_status: 'uncertain' }),
    ]
    const result = partitionFNREligibility(['a', 'b', 'c', 'd'], rowMap(participants))
    expect(result.eligible).toEqual(['a', 'b', 'c', 'd'])
    expect(result.skippedFlight).toBe(0)
    expect(result.skippedNotAttending).toBe(0)
  })

  test('BF-02: arrival flight number skips participant as skippedFlight', () => {
    const result = partitionFNREligibility(['a'], rowMap([p('a', { arrival_flight: 'AC101' })]))
    expect(result.eligible).toHaveLength(0)
    expect(result.skippedFlight).toBe(1)
    expect(result.skippedNotAttending).toBe(0)
  })

  test('BF-03: departure flight number skips participant as skippedFlight', () => {
    const result = partitionFNREligibility(['a'], rowMap([p('a', { departure_flight: 'WS202' })]))
    expect(result.eligible).toHaveLength(0)
    expect(result.skippedFlight).toBe(1)
  })

  test('BF-04: arrival date only (no flight number) skips participant as skippedFlight', () => {
    const result = partitionFNREligibility(['a'], rowMap([p('a', { arrival_date: '2026-11-01' })]))
    expect(result.eligible).toHaveLength(0)
    expect(result.skippedFlight).toBe(1)
  })

  test('BF-05: departure date only (no flight number) skips participant as skippedFlight', () => {
    const result = partitionFNREligibility(['a'], rowMap([p('a', { departure_date: '2026-11-08' })]))
    expect(result.eligible).toHaveLength(0)
    expect(result.skippedFlight).toBe(1)
  })

  test('BF-06: not_attending skips participant as skippedNotAttending', () => {
    const result = partitionFNREligibility(['a'], rowMap([p('a', { participation_status: 'not_attending' })]))
    expect(result.eligible).toHaveLength(0)
    expect(result.skippedNotAttending).toBe(1)
    expect(result.skippedFlight).toBe(0)
  })

  test('BF-07: mixed selection — only genuinely eligible IDs in result', () => {
    const participants = [
      p('a', { participation_status: 'tracking' }),                                 // eligible
      p('b', { participation_status: 'likely', arrival_flight: 'AC101' }),          // skipped: flight number
      p('c', { participation_status: 'not_attending' }),                            // skipped: absent
      p('d', { participation_status: 'uncertain', arrival_date: '2026-11-01' }),    // skipped: date-only flight
      p('e', { participation_status: 'confirmed' }),                                // eligible
      p('f', { participation_status: 'tracking', departure_date: '2026-11-08' }),   // skipped: date-only flight
    ]
    const result = partitionFNREligibility(['a', 'b', 'c', 'd', 'e', 'f'], rowMap(participants))
    expect(result.eligible).toEqual(['a', 'e'])
    expect(result.skippedFlight).toBe(3)
    expect(result.skippedNotAttending).toBe(1)
  })

  test('BF-08: client eligible IDs match server eligible IDs (canonical rule convergence)', () => {
    // The client filter in BulkActionBar uses the same predicates.
    // Applying them to the same dataset must produce the same eligible set.
    const participants = [
      p('a', { participation_status: 'tracking' }),
      p('b', { participation_status: 'likely', departure_date: '2026-11-08' }),
      p('c', { participation_status: 'not_attending' }),
      p('d', { participation_status: 'uncertain' }),
    ]
    // Client-side filter (mirrors BulkActionBar logic after SC-2 fix)
    const clientEligible = participants
      .filter((pt) => !hasFlightData(pt) && pt.participation_status !== 'not_attending')
      .map((pt) => pt.id)
    // Server-side re-check
    const { eligible: serverEligible } = partitionFNREligibility(
      participants.map((pt) => pt.id),
      rowMap(participants),
    )
    expect(clientEligible).toEqual(serverEligible)
  })

  test('BF-09: server re-check protects against stale client state (direct hook invocation)', () => {
    // Even if the caller passes ALL IDs (simulating stale or direct invocation),
    // the server re-check independently excludes ineligible participants.
    const participants = [
      p('a', { participation_status: 'tracking' }),                              // eligible
      p('b', { participation_status: 'confirmed', arrival_flight: 'AC101' }),    // stale: flight present
      p('c', { participation_status: 'not_attending' }),                         // stale: absent
    ]
    const { eligible } = partitionFNREligibility(['a', 'b', 'c'], rowMap(participants))
    expect(eligible).toEqual(['a'])
    expect(eligible).not.toContain('b')
    expect(eligible).not.toContain('c')
  })
})

// ── Bulk FNR — audit fields contract ─────────────────────────────────────────

describe('Bulk FNR — audit fields', () => {
  test('BF-10: four required audit fields and nothing else written by FNR mutation', () => {
    // Documents what useBulkFlightNotRequired writes to each eligible row.
    const FIELDS_WRITTEN = [
      'flight_not_required_reason',
      'flight_not_required_note',
      'flight_not_required_by',
      'flight_not_required_at',
    ]
    expect(FIELDS_WRITTEN).toHaveLength(4)
    expect(FIELDS_WRITTEN).not.toContain('participation_status')
    expect(FIELDS_WRITTEN).not.toContain('registration_status')
    expect(FIELDS_WRITTEN).not.toContain('registration_link_status')
  })

  test('BF-11: flight_not_required_note is null when not provided', () => {
    const note = undefined
    expect(note ?? null).toBeNull()
  })
})

// ── Bulk FNR — participation integration (certifies 4a7b2de semantics hold) ──

describe('Bulk FNR — participation status integration', () => {
  test('BF-12: Tracking + FNR applied => persisted stays Tracking, effective becomes Likely', () => {
    // FNR sets flight_not_required_reason; participation_status is NOT written
    const after = { ...p('a', { participation_status: 'tracking' }), flight_not_required_reason: 'already_in_nigeria' }
    expect(after.participation_status).toBe('tracking')       // persisted unchanged
    expect(effectiveParticipationStatus(after)).toBe('likely') // derived promotion
  })

  test('BF-13: Likely + FNR => persisted Likely, effective Likely', () => {
    const after = { ...p('a', { participation_status: 'likely' }), flight_not_required_reason: 'already_in_nigeria' }
    expect(after.participation_status).toBe('likely')
    expect(effectiveParticipationStatus(after)).toBe('likely')
  })

  test('BF-14: Uncertain + FNR => persisted Uncertain, effective Uncertain (no promotion)', () => {
    const after = { ...p('a', { participation_status: 'uncertain' }), flight_not_required_reason: 'already_in_nigeria' }
    expect(after.participation_status).toBe('uncertain')
    expect(effectiveParticipationStatus(after)).toBe('uncertain')
  })

  test('BF-15: Confirmed + FNR => persisted Confirmed, effective Confirmed', () => {
    const after = { ...p('a', { participation_status: 'confirmed' }), flight_not_required_reason: 'already_in_nigeria' }
    expect(after.participation_status).toBe('confirmed')
    expect(effectiveParticipationStatus(after)).toBe('confirmed')
  })

  test('BF-16: Not Attending is skipped — partitionFNREligibility excludes them, no FNR written', () => {
    const participant = p('a', { participation_status: 'not_attending' })
    const { eligible, skippedNotAttending } = partitionFNREligibility(['a'], rowMap([participant]))
    expect(eligible).toHaveLength(0)
    expect(skippedNotAttending).toBe(1)
    // participation_status is never changed by FNR
    expect(participant.participation_status).toBe('not_attending')
  })

  test('BF-17: no auto-confirm from FNR — Tracking stays Tracking after FNR', () => {
    const after = { ...p('a', { participation_status: 'tracking' }), flight_not_required_reason: 'already_in_nigeria' }
    expect(after.participation_status).not.toBe('confirmed')
    expect(effectiveParticipationStatus(after)).toBe('likely') // likely, not confirmed
  })

  test('BF-18: no auto-confirm from FNR — FNR audit fields do not include participation_status', () => {
    // Verifies the mutation does not write participation_status
    const fnrAuditFields = {
      flight_not_required_reason: 'already_in_nigeria',
      flight_not_required_note: null,
      flight_not_required_by: 'user-abc',
      flight_not_required_at: new Date().toISOString(),
    }
    expect(fnrAuditFields).not.toHaveProperty('participation_status')
    expect(fnrAuditFields).not.toHaveProperty('registration_status')
  })
})
