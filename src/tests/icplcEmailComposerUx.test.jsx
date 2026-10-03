/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke,
    },
  },
}))

import ICPLCEmailComposer, { narrowICPLCEmailCandidates } from '../features/icplc/components/ICPLCEmailComposer.jsx'

const base = {
  event_id: 'event-1',
  source_values: {},
  participation_status: 'confirmed',
  registration_link_status: 'registered',
  registration_status: 'registered',
  passport_readiness: 'ready',
  visa_process_status: 'approved',
}

function participant(id, overrides = {}) {
  return {
    ...base,
    id,
    full_name: overrides.full_name || `Person ${id}`,
    email: overrides.email ?? `${id}@example.test`,
    subgroup: overrides.subgroup || 'Central',
    ...overrides,
  }
}

const selectedRows = [
  participant('a', { full_name: 'Amber Able', arrival_flight: 'AC1', departure_flight: 'AC2' }),
  participant('b', { full_name: 'Ben Missing' }),
  participant('c', { full_name: 'Cara Awaiting', participation_status: 'likely' }),
]

const outsideMatchingRow = participant('d', { full_name: 'Dara Outside' })

function renderComposer(rows = selectedRows) {
  return render(
    <ICPLCEmailComposer
      open
      eventId="event-1"
      eventName="ICPLC"
      sourceLabel="Selected people"
      participants={rows}
      onClose={vi.fn()}
    />,
  )
}

function fillRequiredFields(subject = 'ICPLC update for {{first_name}}') {
  fireEvent.change(screen.getByPlaceholderText('Email subject'), { target: { value: subject } })
  fireEvent.change(screen.getByPlaceholderText('Write the email body'), { target: { value: 'Hi {{first_name}}' } })
}

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue({ data: { sent: 1, failed: 0, campaign_id: 'campaign-1' }, error: null })
})

afterEach(() => cleanup())

describe('ICPLCEmailComposer recipient curation UX', () => {
  it('filters can only narrow the selected candidate scope before sending', async () => {
    renderComposer(selectedRows)
    fillRequiredFields()

    fireEvent.click(screen.getByRole('button', { name: /Missing \(1\)/ }))
    expect(screen.getByText(/1 effective recipient from 3 eligible candidates/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ben Missing' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dara Outside' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Review send/i }))
    fireEvent.click(screen.getByRole('button', { name: /Send email/i }))

    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(invoke.mock.calls.at(-1)[1].body.participant_ids).toEqual(['b'])
    expect(invoke.mock.calls.at(-1)[1].body.participant_ids).not.toContain(outsideMatchingRow.id)
  })

  it('current-list candidates can be filtered without adding people outside the supplied list', async () => {
    renderComposer([selectedRows[0], selectedRows[1], outsideMatchingRow])
    fillRequiredFields()

    fireEvent.click(screen.getByRole('button', { name: /Missing \(2\)/ }))
    expect(screen.getByText(/2 effective recipients from 3 eligible candidates/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Review send/i }))
    fireEvent.click(screen.getByRole('button', { name: /Send email/i }))

    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(invoke.mock.calls.at(-1)[1].body.participant_ids).toEqual(['b', 'd'])
  })

  it('manual exclusion, unexclude, and reset update the effective recipient count', () => {
    renderComposer(selectedRows)
    expect(screen.getByText(/3 effective recipients from 3 eligible candidates/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ben Missing' }))
    expect(screen.getByText(/2 effective recipients from 3 eligible candidates/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ben Missing' }))
    expect(screen.getByText(/3 effective recipients from 3 eligible candidates/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ben Missing' }))
    fireEvent.click(screen.getByRole('button', { name: /Reset recipients/i }))
    expect(screen.getByText(/3 effective recipients from 3 eligible candidates/)).toBeTruthy()
  })

  it('Not Attending participants are never made sendable by composer controls', () => {
    const absent = participant('absent', {
      full_name: 'Absent Person',
      email: 'absent@example.test',
      participation_status: 'not_attending',
    })
    renderComposer([...selectedRows, absent])

    expect(screen.getByText(/3 effective recipients from 3 eligible candidates/)).toBeTruthy()
    expect(screen.getByText(/Not Attending participants are excluded by the server/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Absent Person' })).toBeNull()

    const narrowed = narrowICPLCEmailCandidates([...selectedRows, absent], {}, new Set())
    expect(narrowed.effective.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('personalized subject preview uses the current merge-tag implementation and handles missing values', () => {
    renderComposer([participant('x', { full_name: 'Amber Moser', subgroup: '' })])

    fireEvent.change(screen.getByPlaceholderText('Email subject'), {
      target: { value: 'ICPLC update for {{first_name}} in {{subgroup}}' },
    })

    expect(screen.getByText('Preview: ICPLC update for Amber in Preview subgroup')).toBeTruthy()
  })

  it('sample recipient selection personalizes subject and body preview without changing send payload', async () => {
    renderComposer(selectedRows)
    fireEvent.change(screen.getByPlaceholderText('Email subject'), {
      target: { value: 'Important ICPLC information for {{first_name}}' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write the email body'), {
      target: { value: 'Hello {{first_name}} from {{subgroup}}' },
    })

    fireEvent.change(screen.getByLabelText('Sample recipient'), { target: { value: 'b' } })

    expect(screen.getByText('Preview: Important ICPLC information for Ben')).toBeTruthy()
    expect(screen.getByText(/Hello Ben from Central/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Review send/i }))
    fireEvent.click(screen.getByRole('button', { name: /Send email/i }))

    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(invoke.mock.calls.at(-1)[1].body.participant_ids).toEqual(['a', 'b', 'c'])
    expect(invoke.mock.calls.at(-1)[1].body.subject).toBe('Important ICPLC information for {{first_name}}')
    expect(invoke.mock.calls.at(-1)[1].body.body).toBe('Hello {{first_name}} from {{subgroup}}')
  })

  it('sample preview falls back to an effective recipient after filtering or exclusion removes the selected sample', () => {
    renderComposer(selectedRows)
    fireEvent.change(screen.getByPlaceholderText('Email subject'), {
      target: { value: 'For {{first_name}}' },
    })
    fireEvent.change(screen.getByPlaceholderText('Write the email body'), {
      target: { value: 'Body for {{first_name}}' },
    })

    fireEvent.change(screen.getByLabelText('Sample recipient'), { target: { value: 'b' } })
    expect(screen.getByText('Preview: For Ben')).toBeTruthy()
    expect(screen.getByText(/Body for Ben/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ben Missing' }))
    expect(screen.getByText('Preview: For Amber')).toBeTruthy()
    expect(screen.getByText(/Body for Amber/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Missing \(1\)/ }))
    expect(screen.getByText(/0 effective recipients from 3 eligible candidates/)).toBeTruthy()
    expect(screen.queryByLabelText('Sample recipient')).toBeNull()
    expect(screen.getByText(/Preview: For/).textContent).toBe('Preview: For Preview')
  })

  it('merge tags and test send keep the hardened endpoint contract', async () => {
    renderComposer(selectedRows)
    fireEvent.click(screen.getByRole('button', { name: '{{first_name}}' }))
    expect(screen.getByPlaceholderText('Write the email body').value).toContain('{{first_name}}')

    fillRequiredFields('Test {{first_name}}')
    fireEvent.click(screen.getByRole('button', { name: /Test to me/i }))

    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(invoke.mock.calls[0][0]).toBe('icplc-send-email')
    expect(invoke.mock.calls[0][1].body).toMatchObject({
      event_id: 'event-1',
      subject: 'Test {{first_name}}',
      body: 'Hi {{first_name}}',
      test: true,
    })
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty('participant_ids')
  })
})
