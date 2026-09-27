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

const openProfile = vi.fn()
vi.mock('../../features/icplc/ICPLCContext.jsx', () => ({
  useICPLC: () => ({ openProfile, filters: { readiness: [], tags: [] } }),
}))

import DocumentationTab from '../../features/icplc/components/tabs/DocumentationTab.jsx'
import ParticipantTable from '../../features/icplc/components/ParticipantTable.jsx'

const base = {
  id: 'p1', full_name: 'Ama Mensah', email: 'ama@example.com',
  participation_status: 'confirmed', registration_status: 'registered', registration_link_status: 'registered',
  canada_residency_status: null, canada_status_document_readiness: null,
  passport_country: null, passport_readiness: 'unknown',
  visa_requirement: 'review', visa_process_status: 'not_started',
  override_fields: {},
}

beforeEach(() => { mutateAsync.mockClear(); openProfile.mockClear(); cleanup() })

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
