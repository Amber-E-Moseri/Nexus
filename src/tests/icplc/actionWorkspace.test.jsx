/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  openProfile: vi.fn(),
  participants: [],
}))

vi.mock('../../features/icplc/ICPLCContext.jsx', () => ({
  useICPLC: () => ({
    config: { id: 'event-1', event_name: 'ICPLC' },
    activeProfileId: null,
    activeProfileTab: null,
    closeProfile: vi.fn(),
    openProfile: mocks.openProfile,
  }),
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ profile: { role: 'super_admin' } }),
}))

vi.mock('../../features/icplc/hooks/useICPLCWorkingList.js', () => ({
  useICPLCWorkingList: () => ({
    participants: mocks.participants,
    ambiguousRegistrations: [],
    isLoading: false,
    error: null,
  }),
}))

vi.mock('../../features/icplc/hooks/useICPLCTargets.js', () => ({
  useICPLCTargets: () => ({ visaTarget: '2027-01-01', passportTarget: '2027-01-01' }),
}))

vi.mock('../../features/icplc/components/BulkActionBar.jsx', () => ({
  default: ({ selection, filteredRows, onEmail }) => (
    <div role="region" aria-label="Bulk Manage">
      <div data-testid="bulk-selected-count">{selection.count}</div>
      <button type="button" onClick={onEmail}>Email selected</button>
      <button type="button" onClick={() => window.__bulkIds = selection.selectedIds}>Capture selected IDs</button>
      <button type="button" onClick={() => window.__filteredIds = filteredRows.map((p) => p.id)}>Capture filtered IDs</button>
    </div>
  ),
}))

vi.mock('../../features/icplc/components/ParticipantProfileDrawer.jsx', () => ({
  default: () => <div role="dialog" aria-label="Participant profile drawer" />,
}))

vi.mock('../../features/icplc/components/ICPLCEmailComposer.jsx', () => ({
  canEstimateICPLCEmail: () => true,
  default: ({ participants, sourceLabel }) => (
    <div role="dialog" aria-label="ICPLC email composer">
      <div>{sourceLabel}</div>
      <div data-testid="email-ids">{participants.map((p) => p.id).join(',')}</div>
    </div>
  ),
}))

import NeedsAttentionPage from '../../features/icplc/pages/NeedsAttentionPage.jsx'

const healthy = {
  id: 'healthy',
  full_name: 'Healthy Person',
  email: 'healthy@example.test',
  subgroup: 'Central',
  participation_status: 'not_attending',
  registration_status: 'registered',
  registration_link_status: 'registered',
  passport_readiness: 'ready',
  passport_country: 'Nigeria',
  visa_requirement: 'not_required',
  visa_process_status: 'not_applicable',
  arrival_flight: 'AC1',
  departure_flight: 'AC2',
  arrival_date: '2027-01-15',
  departure_date: '2027-01-20',
  source_values: { cmp_documentation: { submission_id: 'doc-ok' } },
  tags: [{ id: 'tag-ready', name: 'Ready' }],
}

const registrationAction = {
  ...healthy,
  id: 'reg',
  full_name: 'Reg Missing',
  email: 'reg@example.test',
  subgroup: 'Central',
  participation_status: 'confirmed',
  registration_status: 'not_registered',
  registration_link_status: 'not_registered',
  source_values: { registered_raw: { value: 'No' }, cmp_documentation: { submission_id: 'doc-reg' } },
  tags: [{ id: 'tag-follow', name: 'Follow Up' }],
}

const documentationAction = {
  ...healthy,
  id: 'doc',
  full_name: 'Doc Needed',
  email: 'doc@example.test',
  subgroup: 'Media',
  participation_status: 'confirmed',
  passport_readiness: 'renewal_needed',
  visa_requirement: 'required',
  visa_process_status: 'not_started',
  tags: [{ id: 'tag-docs', name: 'Docs' }],
}

function renderPage(initialEntries = ['/icplc?action=unused']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <NeedsAttentionPage canWrite />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  mocks.openProfile.mockReset()
  window.__bulkIds = undefined
  window.__filteredIds = undefined
})

describe('Action workspace', () => {
  it('shows canonical action participants and excludes healthy participants', () => {
    mocks.participants = [registrationAction, documentationAction, healthy]
    renderPage(['/icplc'])

    expect(screen.getByText('Action')).toBeTruthy()
    expect(screen.getByText('Reg Missing')).toBeTruthy()
    expect(screen.getByText('Doc Needed')).toBeTruthy()
    expect(screen.queryByText('Healthy Person')).toBeNull()
    expect(screen.getAllByText('Registration Missing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Passport Incomplete').length).toBeGreaterThan(0)
  })

  it('composes filters and clears them', async () => {
    mocks.participants = [registrationAction, documentationAction, healthy]
    renderPage(['/icplc'])

    fireEvent.change(screen.getByLabelText(/Search/i), { target: { value: 'doc' } })
    fireEvent.change(screen.getByLabelText(/Subgroup/i), { target: { value: 'Media' } })

    await waitFor(() => expect(screen.queryByText('Reg Missing')).toBeNull())
    expect(screen.getByText('Doc Needed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Clear all/i }))
    await waitFor(() => expect(screen.getByText('Reg Missing')).toBeTruthy())
  })

  it('selects the filtered visible set and sends exact selected IDs to email', async () => {
    mocks.participants = [registrationAction, documentationAction, healthy]
    renderPage(['/icplc'])

    fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: 'registration' } })
    await waitFor(() => expect(screen.queryByText('Doc Needed')).toBeNull())

    fireEvent.click(screen.getByLabelText('Select all 1 filtered action rows'))
    await waitFor(() => expect(screen.getByTestId('bulk-selected-count').textContent).toBe('1'))

    fireEvent.click(screen.getByRole('button', { name: 'Capture selected IDs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Capture filtered IDs' }))
    expect(window.__bulkIds).toEqual(['reg'])
    expect(window.__filteredIds).toEqual(['reg'])

    fireEvent.click(screen.getByRole('button', { name: 'Email selected' }))
    expect(screen.getByRole('dialog', { name: 'ICPLC email composer' })).toBeTruthy()
    expect(screen.getByTestId('email-ids').textContent).toBe('reg')
  })

  it('opens the canonical participant drawer entry point from the card body, not checkbox', () => {
    mocks.participants = [registrationAction]
    renderPage(['/icplc'])

    fireEvent.click(screen.getByLabelText('Select Reg Missing'))
    expect(mocks.openProfile).not.toHaveBeenCalled()

    fireEvent.click(within(screen.getByLabelText('Action results')).getByLabelText('Open profile: Reg Missing'))
    expect(mocks.openProfile).toHaveBeenCalledWith('reg', 'registration')
  })
})
