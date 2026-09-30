import { describe, it, expect } from 'vitest'
import { applyClientFilters } from '../../features/icplc/lib/participantFilters.js'

const NOW = new Date(2026, 9, 1)
const ctx = { targets: { visaTarget: '2026-10-09', passportTarget: null }, now: NOW }

const person = (id, over = {}) => ({
  id, full_name: id, participation_status: 'confirmed', registration_status: 'registered',
  passport_readiness: 'ready', visa_requirement: 'required', visa_process_status: 'submitted',
  canada_residency_status: 'CANADIAN_CITIZEN', arrival_flight: 'X', arrival_date: '2026-11-01',
  override_fields: {}, source_values: {}, ...over,
})

const ids = (rows) => rows.map((p) => p.id)

describe('documentation filters', () => {
  const list = [
    person('assist-flag', { documentation_assistance_requested: true }),
    person('assist-raw', { source_values: { cmp_documentation: { assistance_requested: 'Yes' } } }),
    person('assist-no', { documentation_assistance_requested: false }),
    person('ecowas', { passport_region: 'ECOWAS', visa_requirement: 'review' }),
    person('non-ecowas', { passport_region: 'NON_ECOWAS' }),
    person('visa-in-progress', { visa_process_status: 'in_progress' }),
    person('visa-not-started', { visa_process_status: 'not_started' }),
    person('canada-review', { canada_residency_status: 'PERMANENT_RESIDENT', source_values: { cmp_documentation: { canadian_doc_valid_through_nov: 'No' } } }),
  ]

  it('assistance requested matches the stored flag and the raw CMP answer, never "No"', () => {
    expect(ids(applyClientFilters(list, { assistance: ['requested'] }, ctx)).sort()).toEqual(['assist-flag', 'assist-raw'])
  })

  it('passport region uses the effective (reported or derived) region', () => {
    expect(ids(applyClientFilters(list, { passport_region: ['ECOWAS'] }, ctx))).toEqual(['ecowas'])
    expect(ids(applyClientFilters(list, { passport_region: ['NON_ECOWAS'] }, ctx))).toEqual(['non-ecowas'])
  })

  it('due soon and overdue follow the visa target in the supplied context, and skip submitted visas', () => {
    // 8 days to the visa target: anyone who has not submitted is due soon
    expect(ids(applyClientFilters(list, { time_risk: ['due_soon'] }, ctx)).sort()).toEqual(['visa-in-progress', 'visa-not-started'])
    expect(applyClientFilters(list, { time_risk: ['overdue'] }, ctx)).toEqual([])
    // target already passed: the same people are overdue instead
    const later = { targets: { visaTarget: '2026-09-25' }, now: NOW }
    expect(ids(applyClientFilters(list, { time_risk: ['overdue'] }, later)).sort()).toEqual(['visa-in-progress', 'visa-not-started'])
    expect(applyClientFilters(list, { time_risk: ['due_soon'] }, later)).toEqual([])
  })

  it('without a target date nothing is due soon or overdue', () => {
    expect(applyClientFilters(list, { time_risk: ['due_soon', 'overdue'] }, { targets: {}, now: NOW })).toEqual([])
  })

  it('Canadian documents require review isolates the self-reported concern', () => {
    expect(ids(applyClientFilters(list, { documentation: ['canadian_docs_review'] }, ctx))).toEqual(['canada-review'])
  })
})
