/**
 * Flight merge picker: people can share a full name, so the picker must list them as separate options and the
 * assignment sent to Apply must be the participant ID (never the displayed name).
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const PEOPLE = [
  { id: 'twin-1', full_name: 'Sam Twin', email: 'sam.one@example.com', subgroup: 'BLW Central Subgroup A' },
  { id: 'twin-2', full_name: 'Sam Twin', email: 'sam.two@example.com', subgroup: 'BLW Ottawa Subgroup B' },
  { id: 'ada', full_name: 'Ada Lovelace', email: 'ada@example.com', subgroup: null },
  { id: 'zed', full_name: 'Zed Other', email: null, subgroup: 'BLW West Subgroup A' },
]

const PREVIEW = {
  action: 'preview',
  submission_count: 2,
  counts: { matched_applied: 0, unmatched: 1, ambiguous: 1 },
  results: [
    { submission_id: 'sub-twin', status: 'ambiguous', issues: ['more than one participant has this name'], submitter: { name: 'Sam Twin', email: null }, flight: { arrival_date: '2026-11-12', arrival_time: '09:30', arrival_flight: 'AC123', departure_date: '2026-11-16', departure_time: '14:15', departure_flight: 'AC456' } },
    { submission_id: 'sub-nobody', status: 'unmatched', issues: [], submitter: { name: 'Nobody Here', email: null }, flight: { arrival_date: '2026-11-13', arrival_time: null, arrival_flight: 'WS9', departure_date: null, departure_time: null, departure_flight: null } },
  ],
}

const invoke = vi.fn()
vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args) => invoke(...args) },
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: PEOPLE, error: null }) }),
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}))
vi.mock('../../features/icplc/ICPLCContext.jsx', () => ({ useICPLC: () => ({ config: { id: 'event-1' } }) }))

import FlightSyncBlock from '../../features/icplc/components/FlightSyncBlock.jsx'
import ParticipantPicker, { personOptionLabel } from '../../features/icplc/components/ParticipantPicker.jsx'

function renderBlock() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><FlightSyncBlock /></QueryClientProvider>)
}

async function previewed() {
  invoke.mockImplementation(async (_name, { body }) => ({
    data: body.action === 'preview' ? PREVIEW : { action: 'apply', submission_count: 2, counts: { matched_applied: 2 }, results: [] },
    error: null,
  }))
  renderBlock()
  fireEvent.click(screen.getByRole('button', { name: /preview flight sync/i }))
  await screen.findByLabelText('Match Sam Twin to a participant')
  await waitFor(() => expect(within(screen.getByLabelText('Match Sam Twin to a participant')).getAllByRole('option').length).toBeGreaterThan(4))
}

const applyBody = () => invoke.mock.calls.filter(([, { body }]) => body.action === 'apply').map(([, { body }]) => body)

async function apply() {
  fireEvent.click(screen.getByRole('button', { name: /apply to participants/i }))
  fireEvent.click(await screen.findByRole('button', { name: /yes, apply/i }))
  await waitFor(() => expect(applyBody()).toHaveLength(1))
  return applyBody()[0]
}

beforeEach(() => { invoke.mockReset(); cleanup() })

describe('flight merge picker — identical names', () => {
  it('1. two participants with the same full name are two separate, distinguishable options', async () => {
    await previewed()
    const picker = screen.getByLabelText('Match Sam Twin to a participant')
    const sameName = within(picker).getAllByRole('option').filter((o) => o.textContent.startsWith('Sam Twin'))
    // listed once under "Same name" and once under "Everyone"
    const distinct = new Map(sameName.map((o) => [o.value, o.textContent]))
    expect([...distinct.keys()].sort()).toEqual(['twin-1', 'twin-2'])
    expect(distinct.get('twin-1')).toBe('Sam Twin — sam.one@example.com · Central Subgroup A')
    expect(distinct.get('twin-2')).toBe('Sam Twin — sam.two@example.com · Ottawa Subgroup B')
    expect(new Set(distinct.values()).size).toBe(2)
  })

  it('shows only the disambiguating fields: name, email, subgroup', () => {
    expect(personOptionLabel({ id: 'x', full_name: 'Zed Other', email: null, subgroup: 'BLW West Subgroup A', phone: '555', passport_country: 'Ghana' }))
      .toBe('Zed Other — no email · West Subgroup A')
    expect(personOptionLabel(PEOPLE[2])).toBe('Ada Lovelace — ada@example.com · no subgroup')
  })

  it('2/3. staff can select either twin, and Apply receives that participant ID', async () => {
    for (const chosen of ['twin-1', 'twin-2']) {
      cleanup(); invoke.mockReset()
      await previewed()
      fireEvent.change(screen.getByLabelText('Match Sam Twin to a participant'), { target: { value: chosen } })
      const body = await apply()
      expect(body.manual_matches).toEqual([{ submission_id: 'sub-twin', participant_id: chosen }])
    }
  })

  it('5. choosing a different person replaces the earlier choice (one entry per submission)', async () => {
    await previewed()
    const picker = screen.getByLabelText('Match Sam Twin to a participant')
    fireEvent.change(picker, { target: { value: 'twin-1' } })
    fireEvent.change(picker, { target: { value: 'twin-2' } })
    const body = await apply()
    expect(body.manual_matches).toEqual([{ submission_id: 'sub-twin', participant_id: 'twin-2' }])
  })

  it('clearing the choice sends nothing for that submission', async () => {
    await previewed()
    const picker = screen.getByLabelText('Match Sam Twin to a participant')
    fireEvent.change(picker, { target: { value: 'twin-1' } })
    fireEvent.change(picker, { target: { value: '' } })
    expect(screen.getByRole('button', { name: /apply to participants/i }).disabled).toBe(true)
  })

  it('7. a unique-name row is unchanged: pick the person by ID and it is sent', async () => {
    await previewed()
    fireEvent.change(screen.getByLabelText('Match Nobody Here to a participant'), { target: { value: 'ada' } })
    fireEvent.change(screen.getByLabelText('Match Sam Twin to a participant'), { target: { value: 'twin-2' } })
    const body = await apply()
    expect(body.manual_matches).toEqual(expect.arrayContaining([
      { submission_id: 'sub-nobody', participant_id: 'ada' },
      { submission_id: 'sub-twin', participant_id: 'twin-2' },
    ]))
    expect(body.manual_matches).toHaveLength(2)
  })

  it('no names ever leak into the request: only ids are sent', async () => {
    await previewed()
    fireEvent.change(screen.getByLabelText('Match Sam Twin to a participant'), { target: { value: 'twin-1' } })
    const body = await apply()
    expect(JSON.stringify(body)).not.toMatch(/Sam Twin|sam\.one/)
  })
})

describe('ParticipantPicker', () => {
  it('lists every duplicate-named person separately even without a sameNameAs hint', () => {
    const onChange = vi.fn()
    render(<ParticipantPicker people={PEOPLE} value={null} onChange={onChange} ariaLabel="pick" />)
    const opts = within(screen.getByLabelText('pick')).getAllByRole('option').filter((o) => o.textContent.startsWith('Sam Twin'))
    expect(opts.map((o) => o.value).sort()).toEqual(['twin-1', 'twin-2'])
    fireEvent.change(screen.getByLabelText('pick'), { target: { value: 'twin-2' } })
    expect(onChange).toHaveBeenCalledWith('twin-2')
  })
})
