/**
 * Registration has exactly three user-facing states, derived in ONE place (registrationState):
 *   Registered            a completed registration exists: the only state that satisfies the registration gate
 *   Registration Missing  no completed registration, but meaningful evidence the participant is already progressing
 *                         through ICPLC (a flight, the Immigration form, registration CSV / issue evidence, visa progress)
 *   Not Registered        no completed registration and no meaningful ICPLC progress
 * There is no "Unknown" state. Both non-complete states fail the gate identically and neither can become Ready.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import React from 'react'

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'user-1' } }) }))
vi.mock('../../features/icplc/hooks/useICPLCProfile.js', () => ({
  useICPLCProfile: () => ({ data: null, isLoading: true }),
  useUpdateProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClearFieldOverride: () => ({ mutateAsync: vi.fn() }),
  useICPLCActivity: () => ({ data: [], isLoading: false }),
}))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../features/icplc/ICPLCContext.jsx', () => ({
  useICPLC: () => ({ openProfile: vi.fn(), filters: { readiness: [], tags: [] }, accessTier: 'admin' }),
}))

import {
  registrationState, registrationProgressSignals, hasRegistrationProgress, isRegistered,
  REGISTRATION_STATE_LABELS, REGISTRATION_URGENT_LABELS, attentionCategoryKeys, ATTENTION_CATEGORIES,
} from '../../features/icplc/lib/documentationRules.js'
import { deriveReadiness } from '../../features/icplc/lib/readinessEngine.js'
import { operationalSummary, attentionItems, needsAttentionNow, isRegistrationIncomplete } from '../../features/icplc/lib/attentionModel.js'
import { applyClientFilters } from '../../features/icplc/lib/participantFilters.js'
import { filterParticipantsByWorkingListView } from '../../features/icplc/lib/reconciliation.js'
import { participantsToCsv, EXPORT_COLUMNS } from '../../features/icplc/lib/exportParticipants.js'
import WorkingListTable from '../../features/icplc/components/WorkingListTable.jsx'
import ParticipantTable from '../../features/icplc/components/ParticipantTable.jsx'
import { DrawerOperationalSummary } from '../../features/icplc/components/ParticipantProfileDrawer.jsx'

// Confirmed, registered, everything else complete (Immigration form received, documents settled, flight submitted).
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

// Not registered, and NOTHING has happened for them in ICPLC: no flight, no form, no registration evidence, no visa work.
const bare = (over = {}) => ({
  id: 'b1', full_name: 'Bare Person',
  participation_status: 'tracking', registration_status: 'unknown', registration_link_status: 'not_registered',
  source_values: {}, override_fields: {},
  passport_readiness: 'unknown', visa_requirement: 'review', visa_process_status: 'not_started', canada_residency_status: null,
  arrival_flight: null, arrival_date: null, departure_flight: null, departure_date: null,
  ...over,
})

// The mandatory case: a flight itinerary but no registration.
const flightNoRegistration = (over = {}) => bare({ arrival_flight: 'AC1', arrival_date: '2027-01-15', ...over })

beforeEach(() => cleanup())

describe('qualifying progress signals', () => {
  it.each([
    ['a flight number', { arrival_flight: 'AC1' }, 'flight'],
    ['an arrival date only', { arrival_date: '2027-01-15' }, 'flight'],
    ['a departure flight', { departure_flight: 'AC2' }, 'flight'],
    ['a departure date only', { departure_date: '2027-01-20' }, 'flight'],
    ['a linked CMP flight submission', { source_values: { cmp_flights: { submission_id: 'f1' } } }, 'flight'],
    ['the Immigration / documentation form', { source_values: { cmp_documentation: { submission_id: 'd1' } } }, 'documentation_form'],
    ['registration CSV Registered = No', { source_values: { registered_raw: { value: 'No', source: 'registration_csv' } } }, 'registration_csv'],
    ['registration_status = issue', { registration_status: 'issue' }, 'registration_issue'],
    ['visa in progress', { visa_process_status: 'in_progress' }, 'visa'],
    ['visa submitted', { visa_process_status: 'submitted' }, 'visa'],
    ['visa processing', { visa_process_status: 'processing' }, 'visa'],
    ['visa approved', { visa_process_status: 'approved' }, 'visa'],
    ['a visa issue', { visa_process_status: 'issue' }, 'visa'],
    ['staff-recorded Flight Not Required', { flight_not_required_reason: 'already_in_nigeria' }, 'flight_not_required'],
  ])('%s -> Registration Missing', (_label, over, signal) => {
    const p = bare(over)
    expect(registrationProgressSignals(p)).toContain(signal)
    expect(hasRegistrationProgress(p)).toBe(true)
    expect(registrationState(p)).toBe('registration_missing')
  })

  it('reports every signal that applies, so the reasons can be broken down', () => {
    const p = bare({
      arrival_flight: 'AC1', registration_status: 'issue', visa_process_status: 'submitted',
      source_values: { cmp_documentation: { submission_id: 'd1' }, registered_raw: { value: 'No' } },
    })
    expect(registrationProgressSignals(p).sort()).toEqual(['documentation_form', 'flight', 'registration_csv', 'registration_issue', 'visa'])
  })
})

describe('does not overclassify: existing in ICPLC is not progress', () => {
  it.each([
    ['a bare participant on the Working List', {}],
    ['a legacy stored "unknown" registration status', { registration_status: 'unknown' }],
    ['a null registration status', { registration_status: null }],
    ['an unrecognised registration status', { registration_status: 'waived' }],
    ['Confirmed participation on its own (Confirmed + Not Registered is valid)', { participation_status: 'confirmed' }],
    ['Likely participation on its own', { participation_status: 'likely' }],
    ['known passport / Canadian fields set by hand', { passport_readiness: 'ready', canada_residency_status: 'PERMANENT_RESIDENT', passport_country: 'Ghana' }],
    ['a visa that is required but not started', { visa_requirement: 'required', visa_process_status: 'not_started' }],
    ['staff-set assistance with no form', { documentation_assistance_requested: true }],
    ['notes, tags and manual overrides', { notes: 'follow up', tags: [{ id: 't', name: 'VIP' }], override_fields: { passport_readiness: { overridden: true } } }],
    ['an empty or affirmative CSV value', { source_values: { registered_raw: { value: '' } } }],
    ['CSV Registered = Yes without a link (the export is not "incomplete")', { source_values: { registered_raw: { value: 'Yes' } } }],
    ['empty flight strings', { arrival_flight: '', departure_flight: '' }],
    ['an empty CMP flight namespace', { source_values: { cmp_flights: {} } }],
  ])('%s -> Not Registered', (_label, over) => {
    const p = bare(over)
    expect(registrationProgressSignals(p)).toEqual([])
    expect(registrationState(p)).toBe('not_registered')
  })

  it('a null / missing participant is Not Registered, never unknown', () => {
    expect(registrationState({})).toBe('not_registered')
    expect(registrationState(null)).toBe('not_registered')
  })
})

describe('precedence: Registered, then Registration Missing, then Not Registered', () => {
  it('Registered + progress -> Registered (a completed registration wins over any evidence)', () => {
    const p = complete({ registration_status: 'issue', registration_link_status: 'registered', visa_process_status: 'submitted' })
    expect(registrationProgressSignals(p).length).toBeGreaterThan(0)
    expect(registrationState(p)).toBe('registered')
    expect(isRegistered(p)).toBe(true)
  })

  it('a completed registration with no other progress is Registered', () => {
    expect(registrationState(bare({ registration_link_status: 'registered' }))).toBe('registered')
  })

  it('the link status still wins over a stored "registered" (bc65d03 precedence is unchanged)', () => {
    const p = bare({ registration_status: 'registered', registration_link_status: 'not_registered' })
    expect(isRegistered(p)).toBe(false)
    expect(registrationState(p)).toBe('not_registered')
  })
})

describe('MANDATORY: flight itinerary, no registration, stored status unknown', () => {
  const p = flightNoRegistration({ participation_status: 'confirmed' })

  it('is Registration Missing, not registered, and can never be Ready', () => {
    expect(registrationState(p)).toBe('registration_missing')
    expect(isRegistered(p)).toBe(false)
    expect(deriveReadiness(p).readiness).not.toBe('ready')
    // ... even when everything else is satisfied
    const otherwiseReady = complete({ registration_status: 'unknown', registration_link_status: 'not_registered' })
    expect(registrationState(otherwiseReady)).toBe('registration_missing')
    expect(deriveReadiness(otherwiseReady).readiness).not.toBe('ready')
    expect(deriveReadiness(complete()).readiness).toBe('ready') // the same person WITH a registration would be
  })

  it('shows URGENT — Registration Missing and Confirmed coexists', () => {
    expect(p.registration_status).toBe('unknown')
    expect(attentionCategoryKeys(p)[0]).toBe('registration_missing')
    expect(attentionItems(p)[0]).toBe('URGENT — Registration Missing')
    expect(operationalSummary(p).confirmed).toBe(true)
    expect(needsAttentionNow(p)).toBe(true)
  })
})

describe('NO progress + no registration', () => {
  it('is Not Registered, urgent, cannot be Ready, and Confirmed coexists', () => {
    for (const participation_status of ['tracking', 'likely', 'confirmed']) {
      const p = bare({ participation_status })
      expect(registrationState(p)).toBe('not_registered')
      expect(deriveReadiness(p).readiness).not.toBe('ready')
      expect(attentionCategoryKeys(p)[0]).toBe('not_registered')
      expect(attentionItems(p)[0]).toBe('URGENT — Not Registered')
    }
    const confirmed = operationalSummary(bare({ participation_status: 'confirmed' }))
    expect(confirmed.confirmed).toBe(true)
    expect(confirmed.needsAttention).toBe(true)
    expect(confirmed.registration).toBe('not_registered')
  })
})

describe('the three states are distinct everywhere they are observed', () => {
  it('labels, attention keys and categories', () => {
    const [m, n] = [flightNoRegistration(), bare()]
    expect(attentionCategoryKeys(m)[0]).toBe('registration_missing')
    expect(attentionCategoryKeys(n)[0]).toBe('not_registered')
    expect(REGISTRATION_URGENT_LABELS.registration_missing).toBe('URGENT — Registration Missing')
    expect(REGISTRATION_URGENT_LABELS.not_registered).toBe('URGENT — Not Registered')
    expect(ATTENTION_CATEGORIES.filter((c) => c.urgent).map((c) => c.key).sort()).toEqual(['not_registered', 'registration_missing'])
  })
})

describe('REGISTERED', () => {
  it('satisfies the gate, can be Ready when everything else is complete, and has no registration attention', () => {
    const p = complete()
    expect(deriveReadiness(p).readiness).toBe('ready')
    expect(deriveReadiness(p).reasons).not.toContain('Registration outstanding')
    expect(attentionCategoryKeys(p)).toEqual([])
    expect(isRegistrationIncomplete(p)).toBe(false)
    expect(needsAttentionNow(p)).toBe(false)
  })
})

describe.each([
  ['REGISTRATION MISSING', () => flightNoRegistration({ participation_status: 'confirmed' }), 'registration_missing', 'URGENT — Registration Missing'],
  ['NOT REGISTERED', () => bare({ participation_status: 'confirmed' }), 'not_registered', 'URGENT — Not Registered'],
])('%s', (_name, make, state, urgentLabel) => {
  it('does not satisfy the gate and can never derive Ready', () => {
    const p = make()
    expect(isRegistered(p)).toBe(false)
    expect(deriveReadiness(p).readiness).not.toBe('ready')
    expect(deriveReadiness(p).reasons).toContain('Registration outstanding')
  })

  it('keeps its own state and its own urgent reason, first in priority', () => {
    const p = make()
    expect(registrationState(p)).toBe(state)
    expect(attentionCategoryKeys(p)[0]).toBe(state)
    expect(attentionItems(p)[0]).toBe(urgentLabel)
  })

  it('Confirmed coexists with it: not demoted, needs attention, urgent', () => {
    const s = operationalSummary(make())
    expect(make().participation_status).toBe('confirmed')
    expect(s.confirmed).toBe(true)
    expect(s.needsAttention).toBe(true)
    expect(s.urgent).toBe(true)
    expect(s.registration).toBe(state)
  })

  it('auto-confirm safety: a tracking / likely participant is never promoted to Confirmed by readiness', () => {
    // the derived-Ready auto-confirm promotes tracking / likely people whose derived readiness is `ready`
    for (const participation_status of ['tracking', 'likely']) {
      expect(deriveReadiness(make()).readiness).not.toBe('ready')
      expect(deriveReadiness({ ...make(), participation_status }).readiness).not.toBe('ready')
    }
  })
})

describe('auto-confirm: an otherwise-complete unregistered participant is not promoted; a registered one is', () => {
  it('Registration Missing (has a flight and every document) stays out of Ready', () => {
    for (const participation_status of ['tracking', 'likely']) {
      const p = complete({ participation_status, registration_status: 'unknown', registration_link_status: 'not_registered' })
      expect(registrationState(p)).toBe('registration_missing')
      expect(deriveReadiness(p).readiness).not.toBe('ready')
      expect(deriveReadiness({ ...p, registration_link_status: 'registered' }).readiness).toBe('ready')
    }
  })
})

describe('every view agrees on the same participant', () => {
  const people = [
    complete({ id: 'reg', full_name: 'Reg Istered' }),
    flightNoRegistration({ id: 'mis', full_name: 'Mis Sing', participation_status: 'confirmed' }),
    bare({ id: 'not', full_name: 'Not Started', participation_status: 'confirmed' }),
    bare({ id: 'nul', full_name: 'Nul Value', registration_status: null }),
    bare({ id: 'csv', full_name: 'Csv Started', source_values: { registered_raw: { value: 'No' } } }),
  ]
  const expected = { reg: 'registered', mis: 'registration_missing', not: 'not_registered', nul: 'not_registered', csv: 'registration_missing' }

  it('Working List column shows the canonical state', () => {
    render(<WorkingListTable participants={people} loading={false} onOpen={() => {}} />)
    for (const p of people) {
      const row = screen.getByText(p.full_name).closest('tr')
      const label = REGISTRATION_STATE_LABELS[expected[p.id]]
      expect(within(row).getByTitle(new RegExp(`Filter by registered: ${label}$`))).toBeTruthy()
    }
  })

  it('profile drawer header shows the canonical registration state (urgent wording for people staff are counting on)', () => {
    for (const p of people) {
      cleanup()
      render(<DrawerOperationalSummary participant={p} />)
      const label = expected[p.id] === 'registered' ? 'Registered' : REGISTRATION_URGENT_LABELS[expected[p.id]]
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('participant table badge shows the canonical state', () => {
    render(<ParticipantTable participants={people} loading={false} />)
    for (const p of people) {
      const row = screen.getByText(p.full_name).closest('tr')
      expect(within(row).getByText(REGISTRATION_STATE_LABELS[expected[p.id]])).toBeTruthy()
    }
  })

  it('export carries the canonical state', () => {
    const idx = EXPORT_COLUMNS.findIndex(([label]) => label === 'Registration')
    expect(idx).toBeGreaterThan(-1)
    const lines = participantsToCsv(people).split('\r\n').slice(1)
    people.forEach((p, i) => expect(lines[i].split(',')[idx]).toBe(REGISTRATION_STATE_LABELS[expected[p.id]]))
  })

  it('attention filters separate Missing from Not Registered, and the Confirmed variants too', () => {
    const ids = (state) => applyClientFilters(people, { attention_state: [state] }).map((p) => p.id).sort()
    expect(ids('registration_missing')).toEqual(['csv', 'mis'])
    expect(ids('not_registered')).toEqual(['not', 'nul'])
    expect(ids('confirmed_registration_missing')).toEqual(['mis'])
    expect(ids('confirmed_not_registered')).toEqual(['not'])
  })

  it('Working List views separate Missing from Not Registered (registered comes only from a linked registration)', () => {
    const view = (v) => filterParticipantsByWorkingListView(people, [], [], null, v, null).map((p) => p.id).sort()
    // No registration records are linked in this fixture, so nobody is registered here; the evidence still separates the rest.
    expect(view('registered')).toEqual([])
    // ('reg' has a flight and the form, and no registration is linked in this fixture, so it is Registration Missing here)
    expect(view('registration_missing')).toEqual(['csv', 'mis', 'reg'])
    expect(view('not_registered')).toEqual(['not', 'nul'])
  })

  it('Overview / Needs Attention agree: the canonical flags line up with the state', () => {
    for (const p of people) {
      const s = operationalSummary(p)
      expect(s.registration).toBe(expected[p.id])
      expect(s.urgent).toBe(expected[p.id] !== 'registered')
      expect(needsAttentionNow(p)).toBe(s.urgent)
    }
  })
})

describe('no Unknown user-facing registration state', () => {
  it('no registration label, urgent label or attention definition says unknown', () => {
    const labels = [
      ...Object.values(REGISTRATION_STATE_LABELS),
      ...Object.values(REGISTRATION_URGENT_LABELS),
      ...ATTENTION_CATEGORIES.filter((c) => c.section === 'registration').flatMap((c) => [c.label, c.description]),
    ]
    for (const l of labels) expect(l).not.toMatch(/unknown/i)
  })

  it('whatever the stored value, every surface shows one of the three labels', () => {
    const allowed = Object.values(REGISTRATION_STATE_LABELS)
    for (const stored of ['unknown', null, undefined, '', 'registered', 'not_registered', 'issue', 'waived']) {
      const p = bare({ registration_status: stored, registration_link_status: stored === 'registered' ? 'registered' : 'not_registered' })
      cleanup()
      render(<WorkingListTable participants={[p]} loading={false} onOpen={() => {}} />)
      const titles = [...document.querySelectorAll('[title^="Filter by registered:"]')].map((e) => e.getAttribute('title').split(': ')[1])
      expect(titles).toHaveLength(1)
      expect(allowed).toContain(titles[0])
      expect(document.body.textContent).not.toMatch(/registration unknown|unknown registration/i)
    }
  })
})
