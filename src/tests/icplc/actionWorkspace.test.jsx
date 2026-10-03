/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
    fireEvent.change(screen.getByLabelText(/Subgroup/i), { target: { value: 'media' } })

    await waitFor(() => expect(screen.queryByText('Reg Missing')).toBeNull())
    expect(screen.getByText('Doc Needed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Clear all/i }))
    await waitFor(() => expect(screen.getByText('Reg Missing')).toBeTruthy())
  })

  it('selects the filtered visible set and sends exact selected IDs to email', async () => {
    mocks.participants = [registrationAction, documentationAction, healthy]
    renderPage(['/icplc'])

    fireEvent.click(screen.getByRole('button', { name: /More filters/i }))
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

  describe('subgroup filter, chips and bulk targeting', () => {
    const regVariant = { ...registrationAction, id: 'reg2', full_name: 'Reg Variant', email: 'reg2@example.test', subgroup: '  central ', tags: [{ id: 'tag-docs', name: 'Docs' }] }
    const noSubgroup = { ...registrationAction, id: 'nosub', full_name: 'No Subgroup', email: 'nosub@example.test', subgroup: null, tags: [] }
    const docCentral = { ...documentationAction, id: 'doccen', full_name: 'Doc Central', email: 'doccen@example.test', subgroup: 'Central', tags: [{ id: 'tag-docs', name: 'Docs' }] }
    const all = () => [registrationAction, regVariant, noSubgroup, documentationAction, docCentral, healthy]

    const subgroupSelect = () => screen.getByLabelText('Subgroup')
    const names = () => [...screen.getByLabelText('Action results').querySelectorAll('.icplc-ac-who strong')].map((n) => n.textContent)

    it('builds subgroup options from the current population, merges spelling variants and flags unknown', () => {
      mocks.participants = all()
      renderPage(['/icplc'])
      const opts = [...subgroupSelect().querySelectorAll('option')].map((o) => o.textContent)
      expect(opts).toEqual(['All subgroups', 'Central (3)', 'Media (1)', 'Unknown / No subgroup (1)'])
    })

    it('filters rows, updates the count and persists via the URL', () => {
      mocks.participants = all()
      renderPage(['/icplc?subgroup=media'])
      expect(names()).toEqual(['Doc Needed'])
      expect(screen.getByRole('status').textContent).toBe('1 of 5 action items')
      expect(subgroupSelect().value).toBe('media')
      expect(screen.getByRole('button', { name: /Remove filter Subgroup: Media/ })).toBeTruthy()
    })

    it('Unknown / No subgroup selects only participants without a subgroup', () => {
      mocks.participants = all()
      renderPage(['/icplc'])
      fireEvent.change(subgroupSelect(), { target: { value: '__none__' } })
      expect(names()).toEqual(['No Subgroup'])
    })

    it('does not offer Unknown when everyone has a subgroup', () => {
      mocks.participants = [registrationAction, documentationAction]
      renderPage(['/icplc'])
      expect([...subgroupSelect().querySelectorAll('option')].some((o) => /Unknown/.test(o.textContent))).toBe(false)
    })

    it('subgroup composes (intersection) with registration, reason, tag and search', () => {
      mocks.participants = all()
      renderPage(['/icplc?subgroup=central'])
      expect(names().sort()).toEqual(['Doc Central', 'Reg Missing', 'Reg Variant'])

      fireEvent.click(screen.getByRole('button', { name: /More filters/i }))
      fireEvent.change(screen.getByLabelText('Registration'), { target: { value: 'registration_missing' } })
      expect(names().sort()).toEqual(['Reg Missing', 'Reg Variant'])
      expect(names()).not.toContain('Doc Central')
      expect(subgroupSelect().value).toBe('central')

      fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'Docs' } })
      expect(names()).toEqual(['Reg Variant'])
      expect(subgroupSelect().value).toBe('central')

      fireEvent.change(screen.getByLabelText(/Search/i), { target: { value: 'zzz-nobody' } })
      expect(names()).toEqual([])
      expect(subgroupSelect().value).toBe('central')
    })

    it('subgroup + reason is an intersection', () => {
      mocks.participants = all()
      renderPage(['/icplc?subgroup=central'])
      fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'passport_incomplete' } })
      expect(names()).toEqual(['Doc Central'])
    })

    it('shows removable chips, removes one, and Clear all resets everything', () => {
      mocks.participants = all()
      renderPage(['/icplc?subgroup=central&tag=Docs'])
      expect(screen.getByRole('button', { name: /Remove filter Tag: Docs/ })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: /Remove filter Tag: Docs/ }))
      expect(screen.queryByRole('button', { name: /Remove filter Tag/ })).toBeNull()
      expect(subgroupSelect().value).toBe('central')
      fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
      expect(subgroupSelect().value).toBe('')
      expect(screen.queryByLabelText('Active filters')).toBeNull()
    })

    it('keeps primary filters visible and secondary filters behind More filters', () => {
      mocks.participants = all()
      renderPage(['/icplc'])
      for (const label of [/Search/i, 'Subgroup', 'Reason', 'Readiness']) expect(screen.getByLabelText(label)).toBeTruthy()
      for (const label of ['Participation', 'Registration', 'Travel', 'Time risk', 'Tag', 'Category']) expect(screen.queryByLabelText(label)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /More filters/i }))
      for (const label of ['Participation', 'Registration', 'Travel', 'Time risk', 'Tag', 'Category']) expect(screen.getByLabelText(label)).toBeTruthy()
    })

    it('opens More filters when a secondary filter arrives via the URL', () => {
      mocks.participants = all()
      renderPage(['/icplc?registration=not_registered'])
      expect(screen.getByLabelText('Registration')).toBeTruthy()
    })

    it('Select all filtered selects only the subgroup-filtered rows and sends those exact IDs', async () => {
      mocks.participants = all()
      renderPage(['/icplc?subgroup=central'])
      fireEvent.click(screen.getByLabelText('Select all 3 filtered action rows'))
      await waitFor(() => expect(screen.getByTestId('bulk-selected-count').textContent).toBe('3'))
      fireEvent.click(screen.getByRole('button', { name: 'Capture selected IDs' }))
      expect([...window.__bulkIds].sort()).toEqual(['doccen', 'reg', 'reg2'])
      expect(screen.getByText('3 selected')).toBeTruthy()
      expect(screen.getByText('of 3 shown')).toBeTruthy()
    })

    it('changing a filter clears the selection so hidden rows cannot be bulk-targeted', async () => {
      mocks.participants = all()
      renderPage(['/icplc'])
      fireEvent.click(screen.getByLabelText('Select all 5 filtered action rows'))
      await waitFor(() => expect(screen.getByTestId('bulk-selected-count').textContent).toBe('5'))
      fireEvent.change(subgroupSelect(), { target: { value: 'media' } })
      await waitFor(() => expect(screen.getByTestId('bulk-selected-count').textContent).toBe('0'))
      fireEvent.click(screen.getByRole('button', { name: 'Capture selected IDs' }))
      expect(window.__bulkIds).toEqual([])
    })

    it('summary cards are global totals and act as filters whose result count equals the card', () => {
      mocks.participants = all()
      renderPage(['/icplc?subgroup=media'])
      const card = (name) => within(screen.getByLabelText('Action summary')).getByRole('button', { name: new RegExp(name) })
      const cardCount = (name) => Number(card(name).querySelector('strong').textContent)

      // Global totals ignore the active subgroup filter; the header shows filtered / total.
      expect(cardCount('All Actions')).toBe(5)
      expect(screen.getByRole('status').textContent).toBe('1 of 5 action items')

      fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
      for (const [name, expected] of [
        ['Registration', ['No Subgroup', 'Reg Missing', 'Reg Variant']],
        ['Urgent', ['No Subgroup', 'Reg Missing', 'Reg Variant']],
      ]) {
        fireEvent.click(card(name))
        expect(names().sort()).toEqual(expected)
        expect(names()).toHaveLength(cardCount(name))
      }
      for (const name of ['Documentation', 'Travel']) {
        fireEvent.click(card(name))
        expect(names()).toHaveLength(cardCount(name))
      }
      fireEvent.click(card('All Actions'))
      expect(names()).toHaveLength(5)
    })
  })

  it('keeps the bulk bar sticky: Action\'s tab panel must not be an overflow scroll container', () => {
    // An overflow:auto ancestor captures position:sticky, which left the bar stranded at the bottom of long lists.
    const read = (f) => readFileSync(resolve(process.cwd(), 'src/features/icplc', f), 'utf8')
    expect(read('ICPLCPortal.jsx')).toMatch(/needs_attention'\s*\?\s*' icplc-panel--sticky-bar'/)
    expect(read('icplc.css')).toMatch(/\.icplc-panel--sticky-bar\s*\{\s*overflow:\s*visible/)
  })
})
