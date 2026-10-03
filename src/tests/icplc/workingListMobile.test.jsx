/**
 * @vitest-environment jsdom
 */
import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import WorkingListTable from '../../features/icplc/components/WorkingListTable.jsx'
import { useRowSelection } from '../../features/icplc/hooks/useRowSelection.js'

const base = {
  event_id: 'event-1',
  participation_status: 'confirmed',
  registration_link_status: 'registered',
  registration_status: 'registered',
  passport_readiness: 'ready',
  visa_requirement: 'not_required',
  visa_process_status: 'not_started',
  arrival_flight: 'AC1',
  arrival_date: '2026-11-01',
  departure_flight: 'AC2',
  departure_date: '2026-11-09',
  source_values: {},
  tags: [],
}

function participant(id, overrides = {}) {
  return {
    ...base,
    id,
    full_name: overrides.full_name || `Person ${id}`,
    email: overrides.email ?? `${id}@example.test`,
    subgroup: overrides.subgroup || 'Media',
    ...overrides,
  }
}

const rows = [
  participant('ada', {
    full_name: 'Ada Longlastname Example',
    email: 'ada.longlastname@example.test',
    subgroup: 'Media',
    tags: [
      { id: 'tag-ready', name: 'Ready' },
      { id: 'tag-lead', name: 'Lead' },
      { id: 'tag-extra', name: 'Extra' },
    ],
  }),
  participant('ben', {
    id: 'ben',
    full_name: 'Ben Not Attending',
    email: 'ben@example.test',
    subgroup: 'Media',
    participation_status: 'not_attending',
    registration_link_status: 'not_registered',
    registration_status: 'not_registered',
    arrival_flight: null,
    arrival_date: null,
    departure_flight: null,
    departure_date: null,
  }),
  participant('cara', {
    id: 'cara',
    full_name: 'Cara Needs Action',
    email: 'cara@example.test',
    subgroup: 'Logistics',
    registration_link_status: 'not_registered',
    registration_status: 'not_registered',
    source_values: { registered_raw: { value: 'No' }, cmp_documentation: { submission_id: 'doc-1' } },
    passport_readiness: 'renewal_needed',
    visa_requirement: 'required',
    visa_process_status: 'not_started',
    arrival_flight: null,
    arrival_date: null,
    departure_flight: null,
    departure_date: null,
  }),
]

function Harness({ initialRows = rows, onOpen = vi.fn(), onToggleAbsent, onEmail = vi.fn(), onExport = vi.fn() }) {
  const selection = useRowSelection({ resetKey: 'mobile-list-test' })
  const [snapshot, setSnapshot] = useState(null)

  return (
    <>
      <WorkingListTable
        participants={initialRows}
        loading={false}
        onOpen={onOpen}
        onToggleAbsent={onToggleAbsent}
        selection={selection}
      />
      <div aria-label="test bulk actions">
        <div data-testid="selected-count">{selection.count}</div>
        <button type="button" onClick={() => onEmail(selection.selectedRows.map((p) => p.id))}>Email selected</button>
        <button type="button" onClick={() => onEmail(selection.shownRows.map((p) => p.id))}>Email current list</button>
        <button type="button" onClick={() => onExport(selection.selectedRows.map((p) => p.id))}>Export selected</button>
        <button type="button" onClick={() => setSnapshot(selection.selectedRows.map((p) => p.id).join(','))}>Snapshot selected</button>
        {snapshot && <div data-testid="snapshot-selected">{snapshot}</div>}
      </div>
    </>
  )
}

function mobileList() {
  return screen.getByLabelText('Mobile participant list')
}

function card(name) {
  return within(mobileList()).getByLabelText(`Open ${name}`)
}

afterEach(() => cleanup())

describe('WorkingListTable mobile List presentation', () => {
  it('renders current participants as mobile operational cards with canonical status data', () => {
    render(<Harness />)

    const ada = card('Ada Longlastname Example')
    expect(within(ada).getByText('ada.longlastname@example.test')).toBeTruthy()
    expect(within(ada).getByText('Media')).toBeTruthy()
    expect(within(ada).getByText('Registered')).toBeTruthy()
    expect(within(ada).getByText('Ready')).toBeTruthy()
    expect(within(ada).getByText('Booked')).toBeTruthy()
    expect(within(ada).getByText('+1')).toBeTruthy()

    const cara = card('Cara Needs Action')
    expect(within(cara).getByText('Registration Missing')).toBeTruthy()
    expect(within(cara).getByText('Blocked')).toBeTruthy()
    expect(within(cara).getByText('Missing')).toBeTruthy()
    expect(within(cara).getByText('Passport Incomplete')).toBeTruthy()
  })

  it('keeps Not Attending rows visible when the current People pipeline supplies them', () => {
    render(<Harness />)

    const ben = card('Ben Not Attending')
    expect(within(ben).getByText('Not Attending')).toBeTruthy()
    expect(within(ben).getByText('ben@example.test')).toBeTruthy()
  })

  it('opens the drawer from the card body but not from the checkbox', () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)

    fireEvent.click(card('Ada Longlastname Example'))
    expect(onOpen).toHaveBeenCalledWith('ada')

    onOpen.mockClear()
    fireEvent.click(within(card('Ada Longlastname Example')).getByLabelText('Select Ada Longlastname Example'))
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByTestId('selected-count').textContent).toBe('1')
  })

  it('reuses the existing selection state for select, deselect, Select All, and selected rows', async () => {
    const onEmail = vi.fn()
    const onExport = vi.fn()
    render(<Harness onEmail={onEmail} onExport={onExport} />)

    fireEvent.click(within(card('Ada Longlastname Example')).getByLabelText('Select Ada Longlastname Example'))
    expect(screen.getByTestId('selected-count').textContent).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Email selected' }))
    expect(onEmail).toHaveBeenLastCalledWith(['ada'])

    fireEvent.click(within(card('Ada Longlastname Example')).getByLabelText('Select Ada Longlastname Example'))
    expect(screen.getByTestId('selected-count').textContent).toBe('0')

    fireEvent.click(within(mobileList()).getByLabelText('Select all mobile list rows (3)'))
    await waitFor(() => expect(screen.getByTestId('selected-count').textContent).toBe('3'))
    fireEvent.click(screen.getByRole('button', { name: 'Export selected' }))
    expect(onExport).toHaveBeenLastCalledWith(['ada', 'ben', 'cara'])

    fireEvent.click(within(mobileList()).getByLabelText('Select all mobile list rows (3)'))
    await waitFor(() => expect(screen.getByTestId('selected-count').textContent).toBe('0'))
  })

  it('applies existing column filters before mobile cards, Select All, bulk actions, and Email current list', async () => {
    const onEmail = vi.fn()
    render(<Harness onEmail={onEmail} />)

    fireEvent.click(screen.getAllByTitle('Filter by subgroup: Media')[0])

    await waitFor(() => expect(within(mobileList()).queryByLabelText('Open Cara Needs Action')).toBeNull())
    expect(within(mobileList()).getByLabelText('Open Ada Longlastname Example')).toBeTruthy()
    expect(within(mobileList()).getByLabelText('Open Ben Not Attending')).toBeTruthy()

    fireEvent.click(within(mobileList()).getByLabelText('Select all mobile list rows (2)'))
    await waitFor(() => expect(screen.getByTestId('selected-count').textContent).toBe('2'))

    fireEvent.click(screen.getByRole('button', { name: 'Email selected' }))
    expect(onEmail).toHaveBeenLastCalledWith(['ada', 'ben'])

    fireEvent.click(screen.getByRole('button', { name: 'Email current list' }))
    expect(onEmail).toHaveBeenLastCalledWith(['ada', 'ben'])
  })

  it('leaves List and Board as the only People modes in current PeoplePage', async () => {
    const source = await import('node:fs/promises')
    const text = await source.readFile('src/features/icplc/pages/PeoplePage.jsx', 'utf8')

    expect(text).toContain("onViewChange?.('list')")
    expect(text).toContain("onViewChange?.('board')")
    expect(text).not.toMatch(/cards|viewMode\s*=\s*['"]cards/i)
  })
})
