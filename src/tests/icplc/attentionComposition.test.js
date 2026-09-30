/**
 * Attention composition — Phase 1 D1 closure tests.
 *
 * Tests the integration of deriveFlightStatus() + attentionCategoryKeys()
 * through deriveAttentionItems() to verify that the Attention column
 * composes the flight warning with other categories rather than replacing them.
 */

import { describe, it, expect } from 'vitest'
import { deriveFlightStatus } from '../../features/icplc/lib/readinessEngine.js'
import { attentionCategoryKeys } from '../../features/icplc/lib/documentationRules.js'
import { deriveAttentionItems } from '../../features/icplc/components/ParticipantTable.jsx'

// Minimal confirmed participant — all optional fields omitted (null/undefined = not set)
function confirmed(overrides = {}) {
  return {
    source_values: { cmp_documentation: { submission_id: 'form-1' } }, // Immigration Form received
    participation_status: 'confirmed',
    registration_status: 'not_registered',
    registration_link_status: 'registered', // registered so not_registered doesn't fire
    passport_readiness: 'ready',
    passport_country: 'Nigeria', // ECOWAS — no supporting-doc alert
    visa_requirement: 'not_required',
    visa_process_status: null,
    canada_residency_status: 'CANADIAN_CITIZEN', // citizen — no Canadian doc required
    canada_status_document_readiness: null,
    arrival_flight: null,
    departure_flight: null,
    arrival_date: null,
    departure_date: null,
    ...overrides,
  }
}

// ── A. confirmed + missing flight only ─────────────────────────────────────

describe('A. confirmed + missing flight only', () => {
  it('deriveFlightStatus returns missing', () => {
    const p = confirmed()
    expect(deriveFlightStatus(p)).toBe('missing')
  })

  it('attentionCategoryKeys includes travel_incomplete', () => {
    const p = confirmed() // no arrival_flight, no arrival_date
    const keys = attentionCategoryKeys(p)
    expect(keys).toContain('travel_incomplete')
  })

  it('deriveAttentionItems: only Flight details missing (travel_incomplete deduplicated)', () => {
    const p = confirmed()
    const keys = attentionCategoryKeys(p)
    const flightMissing = deriveFlightStatus(p) === 'missing'
    const items = deriveAttentionItems(keys, flightMissing)
    expect(items).toEqual(['__flight__'])
  })
})

// ── B. confirmed + missing flight + another attention category ──────────────

describe('B. confirmed + missing flight + unrelated attention category', () => {
  it('deriveAttentionItems: both flight warning and other category present', () => {
    // Give them an incomplete passport (not ready), which will fire passport_incomplete
    const p = confirmed({
      passport_readiness: 'renewal_needed',
      passport_country: 'Nigeria',
    })
    const keys = attentionCategoryKeys(p)
    const flightMissing = deriveFlightStatus(p) === 'missing'

    expect(flightMissing).toBe(true)
    expect(keys).toContain('passport_incomplete')

    const items = deriveAttentionItems(keys, flightMissing)
    expect(items).toContain('__flight__')
    expect(items).toContain('passport_incomplete')
    // flight warning is first
    expect(items.indexOf('__flight__')).toBe(0)
    // travel_incomplete is NOT in items (deduplicated by flight warning)
    expect(items).not.toContain('travel_incomplete')
  })
})

// ── C. confirmed + booked + another attention category ─────────────────────

describe('C. confirmed + booked + another attention category', () => {
  it('no Flight details missing; other category still present', () => {
    const p = confirmed({
      arrival_flight: 'AC101',
      departure_flight: 'AC102',
      passport_readiness: 'renewal_needed',
    })
    const keys = attentionCategoryKeys(p)
    const flightMissing = deriveFlightStatus(p) === 'missing'

    expect(flightMissing).toBe(false)
    expect(keys).toContain('passport_incomplete')

    const items = deriveAttentionItems(keys, flightMissing)
    expect(items).not.toContain('__flight__')
    expect(items).toContain('passport_incomplete')
  })
})

// ── D. likely / tracking + no flight ───────────────────────────────────────

describe('D. likely/tracking + no flight', () => {
  it('likely: deriveFlightStatus returns awaiting, no flight warning', () => {
    const p = { ...confirmed(), participation_status: 'likely' }
    const flightMissing = deriveFlightStatus(p) === 'missing'
    expect(flightMissing).toBe(false)
    const items = deriveAttentionItems(attentionCategoryKeys(p), flightMissing)
    expect(items).not.toContain('__flight__')
  })

  it('tracking: deriveFlightStatus returns awaiting, no flight warning', () => {
    const p = { ...confirmed(), participation_status: 'tracking' }
    const flightMissing = deriveFlightStatus(p) === 'missing'
    expect(flightMissing).toBe(false)
    const items = deriveAttentionItems(attentionCategoryKeys(p), flightMissing)
    expect(items).not.toContain('__flight__')
  })

  it('uncertain: awaiting, no flight warning', () => {
    const p = { ...confirmed(), participation_status: 'uncertain' }
    expect(deriveFlightStatus(p)).toBe('awaiting')
    const items = deriveAttentionItems(attentionCategoryKeys(p), false)
    expect(items).not.toContain('__flight__')
  })

  it('not_attending: awaiting; attentionCategoryKeys returns empty (suppressed)', () => {
    const p = { ...confirmed(), participation_status: 'not_attending' }
    expect(deriveFlightStatus(p)).toBe('awaiting')
    expect(attentionCategoryKeys(p)).toEqual([])
    const items = deriveAttentionItems([], false)
    expect(items).toEqual([])
  })
})

// ── E. no attention categories + no flight warning ─────────────────────────

describe('E. no attention categories, no flight warning', () => {
  it('deriveAttentionItems returns empty array; cell shows dash', () => {
    // Fully booked, all docs clean
    const p = confirmed({
      arrival_flight: 'AC101',
      departure_flight: 'AC102',
      arrival_date: '2025-11-10',
      departure_date: '2025-11-15',
    })
    const keys = attentionCategoryKeys(p)
    const flightMissing = deriveFlightStatus(p) === 'missing'
    const items = deriveAttentionItems(keys, flightMissing)
    expect(items).toEqual([])
  })
})

// ── Extra: partial flight (one of two flights present) ─────────────────────

describe('Partial flight booking (one flight present)', () => {
  it('confirmed + arrival_flight only → missing (departure absent)', () => {
    const p = confirmed({ arrival_flight: 'AC101' })
    expect(deriveFlightStatus(p)).toBe('missing')
    const items = deriveAttentionItems(attentionCategoryKeys(p), true)
    expect(items).toContain('__flight__')
  })

  it('confirmed + departure_flight only → missing (arrival absent)', () => {
    const p = confirmed({ departure_flight: 'AC102' })
    expect(deriveFlightStatus(p)).toBe('missing')
    const items = deriveAttentionItems(attentionCategoryKeys(p), true)
    expect(items).toContain('__flight__')
  })
})

// ── Composition invariant ──────────────────────────────────────────────────

describe('Composition invariant', () => {
  it('travel_incomplete is never present in deriveAttentionItems output', () => {
    // Even if attentionCategoryKeys produces it, it must be filtered out
    const p = confirmed() // confirmed, no flight info, no arrival_date → both flightMissing AND travel_incomplete
    const keys = attentionCategoryKeys(p)
    expect(keys).toContain('travel_incomplete') // confirm the input has it

    const items = deriveAttentionItems(keys, true)
    expect(items).not.toContain('travel_incomplete')
  })

  it('__flight__ is always first when flightMissing is true', () => {
    const p = confirmed({
      passport_readiness: 'renewal_needed',
      visa_requirement: 'required',
      visa_process_status: 'not_started',
    })
    const keys = attentionCategoryKeys(p)
    const items = deriveAttentionItems(keys, true)
    expect(items[0]).toBe('__flight__')
    expect(items.length).toBeGreaterThan(1) // plus other categories
  })
})
