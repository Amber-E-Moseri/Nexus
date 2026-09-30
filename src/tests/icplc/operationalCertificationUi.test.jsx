/**
 * What the staff buttons actually write: "Mark reviewed" and "Flight not required".
 * Both must touch only their own bookkeeping fields, never a documentation fact, a flight, or registration.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'

const mutateAsync = vi.fn().mockResolvedValue({})

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'staff-1' } }) }))
vi.mock('../../features/icplc/hooks/useICPLCProfile.js', () => ({
  useUpdateProfile: () => ({ mutateAsync, isPending: false, isError: false }),
  useClearFieldOverride: () => ({ mutateAsync: vi.fn() }),
  useICPLCActivity: () => ({ data: [], isLoading: false }),
}))
vi.mock('../../features/icplc/hooks/useUserName.js', () => ({ useUserName: () => null }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../features/icplc/hooks/useICPLCTargets.js', () => ({ useICPLCTargets: () => ({ visaTarget: null, passportTarget: null }) }))
vi.mock('../../features/icplc/ICPLCContext.jsx', () => ({
  useICPLC: () => ({ openProfile: vi.fn(), filters: { readiness: [], tags: [] } }),
}))

import DocumentationTab from '../../features/icplc/components/tabs/DocumentationTab.jsx'
import TravelTab from '../../features/icplc/components/tabs/TravelTab.jsx'
import { documentationReviewFingerprint } from '../../features/icplc/lib/documentationRules.js'

// Confirmed + registered, but the Immigration Form has not been received and nothing is known about documents.
const infoMissing = {
  id: 'p1', full_name: 'Ama Mensah', email: 'ama@example.com',
  participation_status: 'confirmed', registration_status: 'registered', registration_link_status: 'registered',
  source_values: {}, canada_residency_status: null, canada_status_document_readiness: null,
  passport_country: null, passport_readiness: 'unknown', visa_requirement: 'review', visa_process_status: 'not_started',
  arrival_date: null, arrival_flight: null, departure_date: null, departure_flight: null,
  override_fields: {},
}

beforeEach(() => { mutateAsync.mockClear(); cleanup() })

const REVIEW_KEYS = ['documentation_review_at', 'documentation_review_by', 'documentation_review_fingerprint']
const FNR_KEYS = ['flight_not_required_at', 'flight_not_required_by', 'flight_not_required_note', 'flight_not_required_reason']

describe('Mark reviewed writes only its own bookkeeping', () => {
  it('records reviewer, time and the reviewed state — and nothing else', async () => {
    render(<DocumentationTab canWrite participant={infoMissing} />)
    fireEvent.click(screen.getByRole('button', { name: /Mark reviewed/ }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const arg = mutateAsync.mock.calls[0][0]
    expect(arg.id).toBe('p1')
    expect(Object.keys(arg.fields).sort()).toEqual(REVIEW_KEYS)
    expect(arg.fields.documentation_review_by).toBe('staff-1')
    expect(Number.isNaN(Date.parse(arg.fields.documentation_review_at))).toBe(false)
    expect(arg.fields.documentation_review_fingerprint).toBe(documentationReviewFingerprint(infoMissing))
    // no override flags, no documentation / flight / registration field
    expect(arg.setOverride).toBeUndefined()
    expect(arg.overrideFields).toBeUndefined()
  })

  it('offers no button to people who cannot write, or when nothing is missing', () => {
    render(<DocumentationTab canWrite={false} participant={infoMissing} />)
    expect(screen.queryByRole('button', { name: /Mark reviewed/ })).toBeNull()
    cleanup()
    const complete = {
      ...infoMissing, source_values: { cmp_documentation: { submission_id: 's1', canadian_doc_valid_through_nov: 'Yes' } },
      canada_residency_status: 'CANADIAN_CITIZEN', canada_status_document_readiness: 'NOT_APPLICABLE',
      passport_country: 'Nigeria', passport_readiness: 'ready', visa_requirement: 'not_required', visa_process_status: 'not_applicable',
    }
    render(<DocumentationTab canWrite participant={complete} />)
    expect(screen.queryByRole('button', { name: /Mark reviewed/ })).toBeNull()
  })

  it('an existing review shows as completed and Undo clears only the review fields', async () => {
    const reviewed = {
      ...infoMissing, documentation_review_by: 'staff-2', documentation_review_at: '2026-09-30T15:00:00Z',
      documentation_review_fingerprint: documentationReviewFingerprint(infoMissing),
    }
    render(<DocumentationTab canWrite participant={reviewed} />)
    expect(screen.getByText('Staff review completed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Mark reviewed/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Undo review/ }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const { fields } = mutateAsync.mock.calls[0][0]
    expect(Object.keys(fields).sort()).toEqual(REVIEW_KEYS)
    expect(Object.values(fields).every((v) => v === null)).toBe(true)
  })

  it('wording is a review acknowledgement, never verification or approval', () => {
    render(<DocumentationTab canWrite participant={infoMissing} />)
    const text = document.body.textContent
    expect(text).toMatch(/Mark reviewed/)
    expect(text).not.toMatch(/verify documents|approve documentation|documentation cleared|documents verified/i)
  })

  it('a stale review (what is missing has since changed) offers another review', () => {
    const stale = {
      ...infoMissing, documentation_review_by: 'staff-2', documentation_review_at: '2026-09-30T15:00:00Z',
      documentation_review_fingerprint: 'passport_status', // what was reviewed earlier no longer matches
    }
    render(<DocumentationTab canWrite participant={stale} />)
    expect(screen.getByText(/what is missing has changed since/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Mark reviewed/ })).toBeTruthy()
  })
})

describe('Flight not required writes only its own record', () => {
  const noFlight = { ...infoMissing }

  it('saves reason, optional note, who and when — no itinerary fields, no registration', async () => {
    render(<TravelTab canWrite participant={noFlight} />)
    fireEvent.click(screen.getByRole('button', { name: /Mark flight not required/ }))
    expect(screen.getByLabelText('Reason').value).toBe('already_in_nigeria') // Already in Nigeria is the first option
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'At the pre-conference' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const { fields } = mutateAsync.mock.calls[0][0]
    expect(Object.keys(fields).sort()).toEqual(FNR_KEYS)
    expect(fields.flight_not_required_reason).toBe('already_in_nigeria')
    expect(fields.flight_not_required_note).toBe('At the pre-conference')
    expect(fields.flight_not_required_by).toBe('staff-1')
    expect(Number.isNaN(Date.parse(fields.flight_not_required_at))).toBe(false)
    expect(fields).not.toHaveProperty('arrival_date')
    expect(fields).not.toHaveProperty('departure_flight')
    expect(fields).not.toHaveProperty('registration_status')
  })

  it('shows the recorded reason and an explicit statement that registration is never waived', () => {
    render(<TravelTab canWrite participant={{ ...noFlight, flight_not_required_reason: 'already_in_nigeria', flight_not_required_at: '2026-09-30T12:00:00Z', flight_not_required_by: 'staff-1' }} />)
    expect(screen.getByText('Flight not required')).toBeTruthy()
    expect(screen.getByText(/Reason: Already in Nigeria/)).toBeTruthy()
    expect(document.body.textContent).toMatch(/never waives registration/i)
  })

  it('"A flight is needed after all" clears only the exception record', async () => {
    render(<TravelTab canWrite participant={{ ...noFlight, flight_not_required_reason: 'already_in_nigeria', flight_not_required_at: '2026-09-30T12:00:00Z', flight_not_required_by: 'staff-1' }} />)
    fireEvent.click(screen.getByRole('button', { name: /A flight is needed after all/ }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const { fields } = mutateAsync.mock.calls[0][0]
    expect(Object.keys(fields).sort()).toEqual(FNR_KEYS)
    expect(Object.values(fields).every((v) => v === null)).toBe(true)
  })

  it('read-only viewers cannot set the exception', () => {
    render(<TravelTab canWrite={false} participant={noFlight} />)
    expect(screen.queryByRole('button', { name: /Mark flight not required/ })).toBeNull()
  })
})
