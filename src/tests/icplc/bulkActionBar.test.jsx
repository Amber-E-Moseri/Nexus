/**
 * BulkActionBar UX: the confirmation shows Eligible / Already reviewed / Cannot review before anything is written,
 * only eligible participants are sent, the result reports every status, and the removed actions are gone.
 * Backend hooks are mocked; eligibility and fingerprint logic are real.
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { documentationReviewFingerprint } from '../../features/icplc/lib/documentationRules.js'

const reviewMutate = vi.fn()
const tagMutate = vi.fn()
let canonical = []

vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ or: () => ({ order: async () => ({ data: [{ id: 't1', name: 'Finances' }], error: null }) }) }) }) } }))
vi.mock('../../features/icplc/hooks/useICPLCWorkingList.js', () => ({ useICPLCWorkingList: () => ({ participants: canonical }) }))
vi.mock('../../features/icplc/hooks/useICPLCBulk.js', () => ({
  useBulkMarkDocumentationReviewed: () => ({ mutateAsync: reviewMutate, isPending: false }),
  useBulkSetTag: () => ({ mutateAsync: tagMutate, isPending: false }),
}))

import BulkActionBar from '../../features/icplc/components/BulkActionBar.jsx'

const base = {
  participation_status: 'confirmed', registration_link_status: 'registered', registration_status: 'registered',
  canada_residency_status: 'CANADIAN_CITIZEN', passport_country: 'Ghana', passport_readiness: 'ready',
  visa_requirement: 'required', visa_process_status: 'approved', source_values: {},
  arrival_date: '2027-01-15', arrival_flight: 'AC1', departure_date: '2027-01-25', departure_flight: 'AC2',
}
const elig1 = { ...base, id: 'e1', full_name: 'Eligible One', updated_at: 'T1' }
const elig2 = { ...base, id: 'e2', full_name: 'Eligible Two', updated_at: 'T2' }
const done = { ...base, id: 'd1', full_name: 'Done', updated_at: 'T3', documentation_review_at: '2026-10-01T00:00:00Z' }
done.documentation_review_fingerprint = documentationReviewFingerprint(done)
const complete = { ...base, id: 'c1', full_name: 'Complete', updated_at: 'T4', source_values: { cmp_documentation: { submission_id: 'f' } } }
const absent = { ...base, id: 'a1', full_name: 'Absent', updated_at: 'T5', participation_status: 'not_attending' }

function renderBar(rows, props = {}) {
  canonical = rows
  const selection = {
    count: rows.length, selectedRows: rows, selectedIds: rows.map((r) => r.id), clear: vi.fn(),
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BulkActionBar eventId="ev" selection={selection} context="documentation" canWrite filteredRows={rows} {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => { reviewMutate.mockReset(); tagMutate.mockReset() })
afterEach(() => cleanup())

describe('BulkActionBar', () => {
  it('BAR-1 shows eligible / already reviewed / cannot review counts before mutating', () => {
    renderBar([elig1, elig2, done, complete, absent])
    fireEvent.click(screen.getByRole('button', { name: /mark reviewed/i }))
    expect(screen.getAllByText('5 selected', { selector: 'strong' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Eligible: 2')).toBeTruthy()
    expect(screen.getByText('Already reviewed: 1')).toBeTruthy()
    expect(screen.getByText(/Cannot review: 2/)).toBeTruthy()
    expect(screen.getByText('Mark 2 as documentation reviewed?')).toBeTruthy()
    expect(reviewMutate).not.toHaveBeenCalled()
  })

  it('BAR-2 sends only the eligible participants, with canonical fingerprint and updated_at', async () => {
    reviewMutate.mockResolvedValue({ results: [{ id: 'e1', status: 'updated' }, { id: 'e2', status: 'updated' }] })
    renderBar([elig1, elig2, done, complete, absent])
    fireEvent.click(screen.getByRole('button', { name: /mark reviewed/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark 2 reviewed' }))
    await waitFor(() => expect(reviewMutate).toHaveBeenCalledTimes(1))
    const { items } = reviewMutate.mock.calls[0][0]
    expect(items).toEqual([
      { id: 'e1', fingerprint: documentationReviewFingerprint(elig1), expected_updated_at: 'T1' },
      { id: 'e2', fingerprint: documentationReviewFingerprint(elig2), expected_updated_at: 'T2' },
    ])
  })

  it('BAR-3 the result reports every status, not just success', async () => {
    reviewMutate.mockResolvedValue({
      results: [
        { id: 'e1', status: 'updated' },
        { id: 'e2', status: 'skipped_stale', reason: 'changed_since_loaded' },
        { id: 'x', status: 'already_reviewed', reason: 'same_state_already_reviewed' },
        { id: 'y', status: 'skipped_ineligible', reason: 'not_attending' },
        { id: 'z', status: 'failed', reason: 'not_found' },
      ],
    })
    renderBar([elig1, elig2])
    fireEvent.click(screen.getByRole('button', { name: /mark reviewed/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark 2 reviewed' }))
    await screen.findByText(/1 updated · 1 already reviewed · 1 skipped \(changed since loaded\) · 1 ineligible · 1 failed/)
    expect(screen.getByText(/Changed since you loaded the list — 1/)).toBeTruthy()
    expect(screen.getByText(/stay in Action/)).toBeTruthy()
  })

  it('BAR-4 nothing eligible: no write is offered', () => {
    renderBar([done, complete])
    fireEvent.click(screen.getByRole('button', { name: /mark reviewed/i }))
    expect(screen.getByText('Eligible: 0')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Mark \d+ reviewed/ })).toBeNull()
  })

  it('BAR-5 the dormant passport / visa / status / FNR setters are gone', () => {
    renderBar([elig1])
    for (const label of [/passport/i, /visa/i, /participation status/i, /flight not required|FNR/i, /not attending/i]) {
      expect(screen.queryByLabelText(label)).toBeNull()
    }
    expect(screen.queryByText(/Set status/i)).toBeNull()
  })

  it('BAR-6 Travel shows no review action (tags and export only)', () => {
    renderBar([elig1], { context: 'travel' })
    expect(screen.queryByRole('button', { name: /mark reviewed/i })).toBeNull()
    expect(screen.getByLabelText('Add a tag to selected')).toBeTruthy()
  })

  it('BAR-7 read-only users get export only', () => {
    renderBar([elig1], { canWrite: false })
    expect(screen.queryByRole('button', { name: /mark reviewed/i })).toBeNull()
    expect(screen.queryByLabelText('Add a tag to selected')).toBeNull()
    expect(screen.getByRole('button', { name: /more/i })).toBeTruthy()
  })

  it('BAR-8 tag action confirms with the count and reports per-participant outcomes', async () => {
    tagMutate.mockResolvedValue({ results: [{ id: 'e1', status: 'updated' }, { id: 'e2', status: 'no_change', reason: 'already_tagged' }] })
    renderBar([elig1, elig2])
    await screen.findAllByRole('option', { name: 'Finances' })
    fireEvent.change(screen.getByLabelText('Add a tag to selected'), { target: { value: 't1' } })
    await screen.findByText('Add tag "Finances" to 2 people?')
    expect(tagMutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await screen.findByText(/1 updated · 1 unchanged/)
    expect(tagMutate.mock.calls[0][0]).toEqual({ ids: ['e1', 'e2'], tagId: 't1', action: 'add' })
  })

  it('BAR-9 names the participants that failed or went stale instead of reporting a bare success', async () => {
    tagMutate.mockResolvedValue({ results: [
      { id: 'e1', status: 'updated' },
      { id: 'e2', status: 'failed', reason: 'update_blocked' },
    ] })
    renderBar([elig1, elig2])
    await screen.findAllByRole('option', { name: 'Finances' })
    fireEvent.change(screen.getByLabelText('Remove a tag from selected'), { target: { value: 't1' } })
    await screen.findByText('Remove tag "Finances" from 2 people?')
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await screen.findByText(/2 processed · 1 updated · 1 failed/)
    const list = screen.getByLabelText('Needs follow-up')
    expect(list.textContent).toContain('Eligible Two')
    expect(list.textContent).not.toContain('Eligible One')
    expect(tagMutate.mock.calls[0][0]).toEqual({ ids: ['e1', 'e2'], tagId: 't1', action: 'remove' })
  })

  it('BAR-10 Action shows the main management workflow without opening a menu, and no derived-status setters', () => {
    renderBar([elig1], { context: 'needs_attention', canEmail: true, onEmail: vi.fn() })
    expect(screen.getByRole('button', { name: /mark reviewed/i }).className).toContain('icplc-btn-primary')
    expect(screen.getByLabelText('Add a tag to selected')).toBeTruthy()
    expect(screen.getByLabelText('Remove a tag from selected')).toBeTruthy()
    expect(screen.getByRole('button', { name: /email selected/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /export selected/i })).toBeTruthy()
    for (const forbidden of [/set readiness/i, /mark registered/i, /set participation/i, /not attending/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })
})
