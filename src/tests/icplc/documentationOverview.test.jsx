/**
 * Overview documentation counts deep-link into People with the matching filter.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import React from 'react'
vi.setConfig({ testTimeout: 20_000 }) // jsdom rendering can be slow when the whole suite runs in parallel
import DocumentationOverview from '../../features/icplc/components/DocumentationOverview.jsx'

const person = (id, over = {}) => ({
  id, full_name: `Person ${id}`, participation_status: 'confirmed', registration_status: 'registered',
  passport_readiness: 'ready', visa_requirement: 'required', visa_process_status: 'approved',
  canada_residency_status: 'CANADIAN_CITIZEN', override_fields: {}, source_values: {}, ...over,
})

const onOpenPeople = vi.fn()
const onOpenProfile = vi.fn()
beforeEach(() => { onOpenPeople.mockClear(); onOpenProfile.mockClear(); cleanup() })

const today = new Date()
const iso = (offset) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function renderOverview(participants, targets = { visaTarget: iso(5), passportTarget: null }) {
  return render(<DocumentationOverview participants={participants} targets={targets} onOpenPeople={onOpenPeople} onOpenProfile={onOpenProfile} />)
}

describe('DocumentationOverview', () => {
  const list = [
    person('a', { visa_process_status: 'not_started', documentation_assistance_requested: true }),
    person('b', { visa_process_status: 'in_progress' }),
    person('c', { visa_process_status: 'submitted' }),
    person('d', { passport_readiness: 'no_passport', visa_process_status: 'not_started' }),
    person('e', { canada_residency_status: 'PERMANENT_RESIDENT', source_values: { cmp_documentation: { canadian_doc_valid_through_nov: 'No' } } }),
  ]

  it('counts each visa step for people who need a visa, plus assistance, timing and readiness risks', () => {
    renderOverview(list)
    const tile = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
    expect(tile('Not started').textContent).toContain('2')
    expect(tile('In progress').textContent).toContain('1')
    expect(tile('Submitted').textContent).toContain('1')
    expect(tile('Assistance requested').textContent).toContain('1')
    expect(tile('Passport not ready').textContent).toContain('1')
    expect(tile('Canadian documents require review').textContent).toContain('1')
    expect(tile('Due soon').textContent).toContain('3') // a, b, d still chasing a visa, 5 days to target
    expect(tile('Overdue').textContent).toContain('0')
  })

  it('clicking a tile hands People the matching filter', () => {
    renderOverview(list)
    fireEvent.click(screen.getByRole('button', { name: /^Not started/ }))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ visa_requirement: ['required'], visa_process_status: ['not_started'] })
    fireEvent.click(screen.getByRole('button', { name: /^Assistance requested/ }))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ assistance: ['requested'] })
    fireEvent.click(screen.getByRole('button', { name: /^Due soon/ }))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ time_risk: ['due_soon'] })
    fireEvent.click(screen.getByRole('button', { name: /^Canadian documents require review/ }))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ documentation: ['canadian_docs_review'] })
  })

  it('lists who to follow up first and opens their profile', () => {
    renderOverview(list)
    const region = screen.getByText('Follow up first').parentElement
    const buttons = within(region).getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    fireEvent.click(buttons[0])
    expect(onOpenProfile).toHaveBeenCalled()
  })

  it('says so when no target is configured and nobody needs follow-up', () => {
    renderOverview([person('z')], {})
    expect(screen.getByText('Set the Visa Target Date in Settings')).toBeTruthy()
    expect(screen.getByText('Nobody needs documentation follow-up right now.')).toBeTruthy()
  })
})
