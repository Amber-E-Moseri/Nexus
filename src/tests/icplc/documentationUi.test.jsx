/**
 * ICPLC UI component tests: Documentation tab editing, Working List table rendering,
 * Needs Attention categories. Backend hooks are mocked; derivation logic is real.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import React from 'react'

const mutateAsync = vi.fn().mockResolvedValue({})

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'user-1' } }) }))
vi.mock('../../features/icplc/hooks/useICPLCProfile.js', () => ({
  useUpdateProfile: () => ({ mutateAsync, isPending: false, isError: false }),
  useClearFieldOverride: () => ({ mutateAsync: vi.fn() }),
  useICPLCActivity: () => ({ data: [], isLoading: false }),
}))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../features/icplc/hooks/useUserName.js', () => ({ useUserName: () => 'Staff Member' }))
let mockTargets = { visaTarget: null, passportTarget: null }
vi.mock('../../features/icplc/hooks/useICPLCTargets.js', () => ({ useICPLCTargets: () => mockTargets }))

const openProfile = vi.fn()
vi.mock('../../features/icplc/ICPLCContext.jsx', () => ({
  useICPLC: () => ({ openProfile, filters: { readiness: [], tags: [] } }),
}))

import DocumentationTab from '../../features/icplc/components/tabs/DocumentationTab.jsx'
import TravelTab from '../../features/icplc/components/tabs/TravelTab.jsx'
import { documentationReviewFingerprint } from '../../features/icplc/lib/documentationRules.js'
import ParticipantTable from '../../features/icplc/components/ParticipantTable.jsx'

const base = {
  id: 'p1', full_name: 'Ama Mensah', email: 'ama@example.com',
  participation_status: 'confirmed', registration_status: 'registered', registration_link_status: 'registered',
  canada_residency_status: null, canada_status_document_readiness: null,
  passport_country: null, passport_readiness: 'unknown',
  visa_requirement: 'review', visa_process_status: 'not_started',
  override_fields: {},
}

beforeEach(() => { mutateAsync.mockClear(); openProfile.mockClear(); mockTargets = { visaTarget: null, passportTarget: null }; cleanup() })

describe('DocumentationTab', () => {
  it('shows Canadian status, passport region, additional passport document and visa as separate dimensions', () => {
    render(<DocumentationTab canWrite participant={{
      ...base, canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'READY',
      passport_country: 'Ghana', passport_readiness: 'ready', visa_requirement: 'required', visa_process_status: 'in_progress',
    }} />)
    expect(screen.getByText('Permanent Resident')).toBeTruthy()
    expect(screen.getByText('PR Card')).toBeTruthy()
    expect(screen.getByText('ECOWAS')).toBeTruthy()
    expect(screen.getByText('Not required')).toBeTruthy() // additional passport document
    expect(screen.getByText('Required')).toBeTruthy()     // visa requirement
    expect(screen.getByText(/Not required for an ECOWAS passport/)).toBeTruthy()
  })

  it('Canadian citizen + ECOWAS: no Canadian document, visa still shown as its own value', () => {
    render(<DocumentationTab canWrite participant={{
      ...base, canada_residency_status: 'CANADIAN_CITIZEN', canada_status_document_readiness: 'NOT_APPLICABLE',
      passport_country: 'Nigeria', visa_requirement: 'required',
    }} />)
    expect(screen.getByText('None')).toBeTruthy()
    expect(screen.getByText('Required')).toBeTruthy()
  })

  it('changing passport country to a non-ECOWAS country previews Non-ECOWAS + staff review and saves only that field', async () => {
    render(<DocumentationTab canWrite participant={{ ...base, passport_country: 'Ghana' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Passport Country'), { target: { value: 'Kenya' } })
    expect(screen.getByText('Non-ECOWAS')).toBeTruthy()
    expect(screen.getByText('Staff review')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    const arg = mutateAsync.mock.calls[0][0]
    expect(arg.fields).toEqual({ passport_country: 'Kenya' }) // Canadian + visa untouched
    expect(arg.overrideFields).toEqual([])
  })

  it('selecting a Canadian status does not touch passport or visa fields', async () => {
    render(<DocumentationTab canWrite participant={{ ...base, passport_country: 'Ghana', visa_requirement: 'required' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Canadian Status'), { target: { value: 'INTERNATIONAL_STUDENT' } })
    expect(screen.getByText('Study Permit')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    const { fields, overrideFields } = mutateAsync.mock.calls[0][0]
    expect(fields.canada_residency_status).toBe('INTERNATIONAL_STUDENT')
    expect(fields).not.toHaveProperty('passport_country')
    expect(fields).not.toHaveProperty('visa_requirement')
    expect(overrideFields).toContain('canada_residency_status')
  })

  it('moving from citizen to a status that needs a document resets NOT_APPLICABLE so the document is not silently satisfied', async () => {
    render(<DocumentationTab canWrite participant={{
      ...base, canada_residency_status: 'CANADIAN_CITIZEN', canada_status_document_readiness: 'NOT_APPLICABLE',
    }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Canadian Status'), { target: { value: 'PERMANENT_RESIDENT' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0][0].fields.canada_status_document_readiness).toBe('UNKNOWN')
  })

  it('records overrides for source-writable fields edited by staff (passport readiness, visa process)', async () => {
    render(<DocumentationTab canWrite participant={{ ...base, passport_country: 'Ghana' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Passport Readiness'), { target: { value: 'ready' } })
    fireEvent.change(screen.getByLabelText('Visa Process'), { target: { value: 'approved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0][0].overrideFields.sort()).toEqual(['passport_readiness', 'visa_process_status'])
  })

  it('read-only users get no edit controls', () => {
    render(<DocumentationTab canWrite={false} participant={base} />)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })
})

describe('Working List table', () => {
  const rows = [
    { ...base, id: 'a', full_name: 'Ready Rita', canada_residency_status: 'CANADIAN_CITIZEN', canada_status_document_readiness: 'NOT_APPLICABLE',
      passport_country: 'Ghana', passport_readiness: 'ready', visa_requirement: 'required', visa_process_status: 'approved',
      arrival_date: '2027-01-01', arrival_flight: 'AC1', departure_date: '2027-01-05' },
    { ...base, id: 'b', full_name: 'Pending Pete', registration_link_status: 'not_registered', registration_status: 'not_registered',
      canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'UNKNOWN', passport_country: 'Kenya' },
  ]

  it('shows registration, participation, Canadian doc, passport region, visa, travel and readiness with text (not colour alone)', () => {
    render(<ParticipantTable participants={rows} loading={false} />)
    const rita = screen.getByText('Ready Rita').closest('tr')
    const readinessCell = rita.querySelector('td[data-label="Readiness"]')
    expect(within(readinessCell).getByText('Ready')).toBeTruthy()
    expect(within(rita).getByText(/Ghana · ECOWAS/)).toBeTruthy()
    const pete = screen.getByText('Pending Pete').closest('tr')
    expect(within(pete).getByText('Not registered')).toBeTruthy()
    expect(within(pete).getByText('PR Card')).toBeTruthy()
    expect(within(pete).getByText(/Kenya · Non-ECOWAS/)).toBeTruthy()
    expect(within(pete).getByText(/Not ready/)).toBeTruthy()
    expect(within(pete).getByText(/PR Card readiness unknown/)).toBeTruthy()
  })

  it('opens the canonical profile on click and on Enter (keyboard)', () => {
    render(<ParticipantTable participants={rows} loading={false} />)
    const row = screen.getByText('Ready Rita').closest('tr')
    fireEvent.click(row)
    expect(openProfile).toHaveBeenCalledWith('a', undefined)
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(openProfile).toHaveBeenCalledTimes(2)
  })

  it('renders loading and empty states', () => {
    const { rerender } = render(<ParticipantTable participants={[]} loading />)
    expect(screen.getByRole('status').textContent).toMatch(/Loading/)
    rerender(<ParticipantTable participants={[]} loading={false} />)
    expect(screen.getByRole('status').textContent).toMatch(/No participants/)
  })
})

describe('DocumentationTab: documentation readiness follow-up', () => {
  it('separates participant action, ICPLC team action and review, without renewal-assistance wording', () => {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const soon = new Date(); soon.setDate(soon.getDate() + 5)
    mockTargets = { visaTarget: iso(soon), passportTarget: iso(soon) }
    render(<DocumentationTab canWrite participant={{
      ...base, canada_residency_status: 'PERMANENT_RESIDENT', passport_readiness: 'renewal_in_progress',
      visa_requirement: 'required', visa_process_status: 'not_started', documentation_assistance_requested: true,
      source_values: { cmp_documentation: { canadian_doc_valid_through_nov: 'No' } },
    }} />)
    const followUp = screen.getByText('Follow-up').closest('section, div')
    expect(screen.getAllByText('Participant action').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ICPLC team action').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Review needed').length).toBeGreaterThan(0)
    expect(screen.getByText(/participant must obtain a valid passport/)).toBeTruthy()
    expect(screen.getByText(/Visa not started — 5 days to visa target/)).toBeTruthy()
    expect(screen.getByText(/assistance requested — team follow-up required/)).toBeTruthy()
    expect(screen.getByText(/Canadian immigration\/residency documents require review \(self-reported\)/)).toBeTruthy()
    expect(followUp).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Renewal needed by ICPLC|ICPLC will renew/i)
  })

  it('shows a Canadian "No" answer as a review concern, not a document status', () => {
    render(<DocumentationTab canWrite={false} participant={{
      ...base, canada_residency_status: 'INTERNATIONAL_STUDENT',
      source_values: { cmp_documentation: { canadian_doc_valid_through_nov: 'No' } },
    }} />)
    expect(screen.getByText('No — staff review needed')).toBeTruthy()
    expect(screen.getByText('Review needed (self-reported)')).toBeTruthy()
    expect(screen.queryByText('Renewal needed')).toBeNull()
  })

  it('records a staff change to assistance as an override', async () => {
    render(<DocumentationTab canWrite participant={{ ...base, passport_country: 'Ghana' }} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText('Visa / travel documentation assistance requested'), { target: { value: 'yes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    const call = mutateAsync.mock.calls[0][0]
    expect(call.fields).toEqual({ documentation_assistance_requested: true })
    expect(call.overrideFields).toContain('documentation_assistance_requested')
  })
})

describe('Documentation information: staff Mark reviewed', () => {
  const incomplete = { ...base, participation_status: 'confirmed', source_values: {}, canada_residency_status: null, passport_readiness: 'unknown', visa_requirement: 'review' }

  it('lists what is missing and records only who reviewed and when: no value is filled in', async () => {
    render(<DocumentationTab canWrite participant={incomplete} />)
    expect(screen.getByText('Immigration Form not received')).toBeTruthy()
    expect(screen.getByText('Passport status unknown')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Mark reviewed/ }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    const { fields } = mutateAsync.mock.calls[0][0]
    expect(Object.keys(fields).sort()).toEqual(['documentation_review_at', 'documentation_review_by', 'documentation_review_fingerprint'])
    expect(fields.documentation_review_fingerprint).toBe('canadian_status,form_not_received,passport_region,passport_status,visa_requirement')
    expect(fields.documentation_review_by).toBe('user-1')
  })

  it('after review the gaps are still listed and the review is attributed; real problems stay in Follow-up', () => {
    const state = { ...incomplete, passport_readiness: 'no_passport' }
    render(<DocumentationTab canWrite participant={{
      ...state,
      documentation_review_at: '2026-09-30T15:00:00Z', documentation_review_by: 'staff-2',
      documentation_review_fingerprint: documentationReviewFingerprint(state), // reviewed in exactly this state
    }} />)
    expect(screen.getByText('Staff review completed')).toBeTruthy()
    expect(screen.getByText('Immigration Form not received')).toBeTruthy() // still missing
    expect(screen.getByText(/No valid passport — participant must obtain a valid passport/)).toBeTruthy() // real issue stays
    expect(document.body.textContent).not.toMatch(/verified|approved|cleared/i)
  })

  it('a review that no longer matches what is missing is shown as stale and can be redone', () => {
    render(<DocumentationTab canWrite participant={{
      ...incomplete, documentation_review_at: '2026-09-30T15:00:00Z', documentation_review_by: 'staff-2',
      documentation_review_fingerprint: 'form_not_received', // only the form was missing when it was reviewed
    }} />)
    expect(screen.queryByText('Staff review completed')).toBeNull()
    expect(screen.getByText(/what is missing has changed since/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Mark reviewed/ })).toBeTruthy()
  })

  it('read-only viewers get no Mark reviewed button', () => {
    render(<DocumentationTab canWrite={false} participant={incomplete} />)
    expect(screen.queryByRole('button', { name: /Mark reviewed/ })).toBeNull()
  })
})

describe('TravelTab: Flight not required', () => {
  const noFlight = { ...base, participation_status: 'confirmed', arrival_date: null, arrival_flight: null, departure_date: null, departure_flight: null }

  it('records the exception with reason, note, who and when, and creates no flight fields', async () => {
    render(<TravelTab canWrite participant={noFlight} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark flight not required' }))
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'At the pre-conference' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    const { fields } = mutateAsync.mock.calls[0][0]
    expect(fields).toMatchObject({ flight_not_required_reason: 'already_in_nigeria', flight_not_required_note: 'At the pre-conference', flight_not_required_by: 'user-1' })
    expect(typeof fields.flight_not_required_at).toBe('string')
    expect(Object.keys(fields).some((k) => k.startsWith('arrival') || k.startsWith('departure'))).toBe(false)
  })

  it('shows an existing exception and says it never waives registration', () => {
    render(<TravelTab canWrite participant={{ ...noFlight, flight_not_required_reason: 'already_in_nigeria', flight_not_required_by: 'staff-1', flight_not_required_at: '2026-09-30T12:00:00Z' }} />)
    expect(screen.getByText('Flight not required')).toBeTruthy()
    expect(screen.getByText('Reason: Already in Nigeria')).toBeTruthy()
    expect(screen.getByText('Not required')).toBeTruthy() // itinerary row is not "Missing"
    expect(screen.getByText(/never waives registration/)).toBeTruthy()
  })
})
