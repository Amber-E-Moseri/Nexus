/**
 * Readiness Engine — RELEASE GATE
 *
 * 3 tests: BLOCKED scenario, READY scenario, unrelated state change isolation.
 * CRITICAL is not in V1 — it is not tested here.
 */

import { describe, it, expect } from 'vitest'
import { deriveReadiness } from '../../features/icplc/lib/readinessEngine.js'

describe('Readiness Engine (release gate)', () => {
  // ── Test 10: BLOCKED — passport issue + visa required ──
  it('10. Returns BLOCKED with reasons when passport is invalid and visa is required', () => {
    const participant = {
      passport_readiness: 'renewal_needed',
      visa_requirement: 'required',
      visa_process_status: 'not_started',
      registration_status: 'registered',
      participation_status: 'confirmed',
      arrival_flight: 'AC123',
      arrival_date: '2027-01-15',
    }
    const { readiness, reasons } = deriveReadiness(participant)
    expect(readiness).toBe('blocked')
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.some((r) => /passport/i.test(r))).toBe(true)
  })

  // ── Test 11: READY — all gates pass ──
  it('11. Returns READY when passport, visa, and itinerary are all clear', () => {
    const participant = {
      passport_readiness: 'ready',
      visa_requirement: 'not_required',
      visa_process_status: 'not_applicable',
      registration_status: 'registered',
      participation_status: 'confirmed',
      arrival_flight: 'WS001',
      arrival_date: '2027-01-15',
      departure_date: '2027-01-20',
      canada_residency_status: 'CANADIAN_CITIZEN',
      canada_status_document_readiness: 'NOT_APPLICABLE',
    }
    const { readiness } = deriveReadiness(participant)
    expect(readiness).toBe('ready')
  })

  it('11b. Returns READY when visa is required and approved, passport ready, itinerary received', () => {
    const participant = {
      passport_readiness: 'ready',
      visa_requirement: 'required',
      visa_process_status: 'approved',
      registration_status: 'registered',
      participation_status: 'confirmed',
      arrival_flight: 'AC456',
      arrival_date: '2027-01-15',
      departure_date: '2027-01-22',
      canada_residency_status: 'CANADIAN_CITIZEN',
      canada_status_document_readiness: 'NOT_APPLICABLE',
    }
    const { readiness } = deriveReadiness(participant)
    expect(readiness).toBe('ready')
  })

  // ── Test 12: Unrelated state change does not affect readiness ──
  it('12. Changing notes or subgroup does not change derived readiness', () => {
    const base = {
      passport_readiness: 'ready',
      visa_requirement: 'not_required',
      visa_process_status: 'not_applicable',
      registration_status: 'registered',
      participation_status: 'confirmed',
      arrival_flight: 'WS100',
      arrival_date: '2027-01-15',
      departure_date: '2027-01-22',
      canada_residency_status: 'CANADIAN_CITIZEN',
      canada_status_document_readiness: 'NOT_APPLICABLE',
    }
    const withNotes = { ...base, notes: 'Changed the notes field', subgroup: 'Group A' }
    const { readiness: r1 } = deriveReadiness(base)
    const { readiness: r2 } = deriveReadiness(withNotes)
    expect(r1).toBe(r2)
  })

  // ── Sanity: CRITICAL is not in V1 ──
  it('V1: CRITICAL readiness tier is not returned by deriveReadiness', () => {
    const participant = {
      passport_readiness: 'no_passport',
      visa_requirement: 'required',
      visa_process_status: 'not_started',
      registration_status: 'not_registered',
      participation_status: 'confirmed',
      arrival_flight: null,
      arrival_date: null,
    }
    const { readiness } = deriveReadiness(participant)
    expect(readiness).not.toBe('critical')
    // Should be blocked (passport + visa required)
    expect(readiness).toBe('blocked')
  })
})
