/**
 * The Overview documentation card is a compact health summary that deep-links into People.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
vi.setConfig({ testTimeout: 20_000 }) // jsdom rendering can be slow when the whole suite runs in parallel
import DocumentationOverview from '../../features/icplc/components/DocumentationOverview.jsx'
import { documentationActionRequired } from '../../features/icplc/lib/documentationRules.js'
import { deriveDocumentationActions } from '../../features/icplc/lib/documentationRisk.js'

const person = (id, over = {}) => ({
  id, full_name: `Person ${id}`, participation_status: 'confirmed', registration_status: 'registered',
  passport_readiness: 'ready', visa_requirement: 'required', visa_process_status: 'approved',
  canada_residency_status: 'CANADIAN_CITIZEN', passport_region: 'ECOWAS', override_fields: {},
  // A fully documented person: the Immigration Form is in, so nothing is "missing information".
  source_values: { cmp_documentation: { submission_id: 's-1' } }, ...over,
})

const onOpenPeople = vi.fn()
beforeEach(() => { onOpenPeople.mockClear(); cleanup() })

const today = new Date()
const iso = (offset) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function renderOverview(participants, targets = { visaTarget: iso(5), passportTarget: null }) {
  return render(<DocumentationOverview participants={participants} targets={targets} onOpenPeople={onOpenPeople} />)
}

describe('DocumentationOverview (compact summary)', () => {
  const list = [
    person('a', { visa_process_status: 'not_started', documentation_assistance_requested: true }),
    person('b', { visa_process_status: 'in_progress' }),
    person('c', { visa_process_status: 'submitted' }),
    person('d', { passport_readiness: 'no_passport', visa_process_status: 'not_started' }),
    person('e', { canada_residency_status: 'PERMANENT_RESIDENT', source_values: { cmp_documentation: { submission_id: 's-e', canadian_doc_valid_through_nov: 'No' } } }),
  ]
  const btn = (re) => screen.getByRole('button', { name: re })
  const text = () => document.body.textContent

  it('headline is the canonical documentation-attention count', () => {
    renderOverview(list)
    const expected = list.filter(documentationActionRequired).length
    expect(expected).toBeGreaterThan(0)
    expect(btn(/need attention/).getAttribute('aria-label')).toBe(`${expected} need attention`)
  })

  it('shows non-zero reasons and hides zero-value ones', () => {
    renderOverview(list)
    expect(btn(/^Visa action/).textContent).toContain('2')          // a and d: visa required and not started
    expect(btn(/^Passport attention/).textContent).toContain('1')
    expect(btn(/^Canadian documents require review/).textContent).toContain('1')
    expect(btn(/^Assistance requested/).textContent).toContain('1')
  })

  it('hides every secondary metric that is zero', () => {
    renderOverview([person('z', { passport_readiness: 'no_passport' })], {})
    expect(screen.queryByRole('button', { name: /^Visa action/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Canadian documents/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Assistance requested/ })).toBeNull()
    expect(btn(/^Passport attention/)).toBeTruthy()
  })

  it('does not render flight metrics or the visa lifecycle rows', () => {
    renderOverview(list)
    for (const label of ['Flight missing', 'Flight not required', 'Not started', 'In progress', 'Submitted', 'Processing', 'Approved', 'review acknowledged', 'Follow up first', 'Registration missing']) {
      expect(text()).not.toContain(label)
    }
  })

  it('does not count registration as documentation attention', () => {
    const unregistered = person('u', { registration_status: 'not_registered', registration_link_status: 'not_registered' })
    renderOverview([unregistered], {})
    expect(documentationActionRequired(unregistered)).toBe(false)
    expect(screen.getByText('No documentation issues requiring attention')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /need attention/ })).toBeNull()
  })

  it('shows Due soon / Overdue only when non-zero, using the canonical time risk', () => {
    renderOverview(list) // visa target in 5 days → a, b, d due soon
    const soon = list.filter((p) => deriveDocumentationActions(p, { targets: { visaTarget: iso(5) } }).worst === 'due_soon').length
    expect(btn(/^Due soon/).textContent).toContain(String(soon))
    expect(screen.queryByRole('button', { name: /^Overdue/ })).toBeNull()
    cleanup()
    renderOverview(list, { visaTarget: iso(-3), passportTarget: null })
    expect(btn(/^Overdue/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Due soon/ })).toBeNull()
    cleanup()
    renderOverview([person('ok')], { visaTarget: iso(60), passportTarget: null })
    expect(text()).not.toMatch(/Due soon|Overdue/)
  })

  it('healthy state: compact message with positive figures, no zero rows', () => {
    renderOverview([person('h1'), person('h2', { visa_process_status: 'approved' })], {})
    expect(screen.getByText('No documentation issues requiring attention')).toBeTruthy()
    expect(text()).toContain('Visa cleared')
    expect(text()).toContain('Passport ready')
    expect(screen.queryByRole('button', { name: /^Passport attention/ })).toBeNull()
  })

  it('only hints at a missing target when someone is still chasing a visa', () => {
    renderOverview([person('z', { visa_process_status: 'not_started' })], {})
    expect(text()).toContain('Visa target date not set')
    cleanup()
    renderOverview([person('z')], {})
    expect(text()).not.toContain('target date')
  })

  it('View documentation and the metrics hand People the existing filters', () => {
    renderOverview(list)
    fireEvent.click(btn(/View documentation/))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ documentation: ['action_required'] })
    fireEvent.click(btn(/need attention/))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ documentation: ['action_required'] })
    fireEvent.click(btn(/^Assistance requested/))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ assistance: ['requested'] })
    fireEvent.click(btn(/^Due soon/))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ time_risk: ['due_soon'] })
    fireEvent.click(btn(/^Canadian documents require review/))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ documentation: ['canadian_docs_review'] })
    fireEvent.click(btn(/^Passport attention/))
    expect(onOpenPeople).toHaveBeenLastCalledWith({ documentation: ['passport_incomplete'] })
  })

  it('healthy View documentation clears filters rather than opening an empty list', () => {
    renderOverview([person('h')], {})
    fireEvent.click(btn(/View documentation/))
    expect(onOpenPeople).toHaveBeenLastCalledWith({})
  })
})
