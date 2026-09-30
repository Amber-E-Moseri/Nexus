import { describe, it, expect } from 'vitest'
import {
  mapCanadianDocSelfReport,
  mapAssistanceRequested,
  canadianDocSelfReport,
  effectiveCanadaDocReadiness,
  effectiveAssistanceRequested,
  computeMutations,
  buildSourceValues,
  CMP_FIELD_IDS,
} from '../../features/icplc/lib/cmpDocumentation.js'
import { deriveReadiness } from '../../features/icplc/lib/readinessEngine.js'
import { attentionCategoryKeys, CANADIAN_DOCS_REVIEW_REASON, deriveCanadianDocumentation } from '../../features/icplc/lib/documentationRules.js'
import { overrideFieldsForEdit } from '../../features/icplc/lib/fieldAuthority.js'
import {
  daysUntil,
  riskForTarget,
  readTargets,
  deriveDocumentationActions,
  followUpFirst,
  ACTION_KIND,
  RISK,
} from '../../features/icplc/lib/documentationRisk.js'

const NOW = new Date(2026, 9, 1) // 1 Oct 2026, local
const targets = { visaTarget: '2026-10-19', passportTarget: '2026-10-15' } // 18 and 14 days out

const base = (over = {}) => ({
  id: 'p1', full_name: 'Ada Obi', participation_status: 'confirmed', registration_status: 'registered',
  passport_readiness: 'ready', visa_requirement: 'required', visa_process_status: 'approved',
  canada_residency_status: 'PERMANENT_RESIDENT', arrival_flight: 'AC1', arrival_date: '2026-11-01',
  override_fields: {}, source_values: {}, ...over,
})
const withAnswer = (answer, over = {}) => base({ source_values: { cmp_documentation: { canadian_doc_valid_through_nov: answer } }, ...over })

describe('Immigration form normalization', () => {
  it('reads Yes/No answers case-insensitively and rejects anything else', () => {
    expect(mapCanadianDocSelfReport(' Yes ')).toBe('yes')
    expect(mapCanadianDocSelfReport('NO')).toBe('no')
    expect(mapCanadianDocSelfReport('Not sure')).toBeNull()
    expect(mapAssistanceRequested('Yes')).toBe(true)
    expect(mapAssistanceRequested('no')).toBe(false)
    expect(mapAssistanceRequested('Maybe')).toBeNull()
    expect(mapAssistanceRequested(undefined)).toBeNull()
  })

  it('writes assistance to its own field and never writes a Canadian document status from the validity answer', () => {
    const answers = {
      [CMP_FIELD_IDS.assistanceRequested]: 'Yes',
      [CMP_FIELD_IDS.canadianDocValidity]: 'No',
    }
    const m = computeMutations(base(), answers, buildSourceValues({ id: 's1' }, answers))
    expect(m.canonical.documentation_assistance_requested).toBe(true)
    expect(m.canonical).not.toHaveProperty('canada_status_document_readiness')
    expect(m.source_values.cmp_documentation.canadian_doc_valid_through_nov).toBe('No') // raw evidence kept
  })

  it('does not overwrite a staff-corrected assistance value', () => {
    const p = base({ documentation_assistance_requested: false, override_fields: { documentation_assistance_requested: { overridden: true } } })
    const m = computeMutations(p, { [CMP_FIELD_IDS.assistanceRequested]: 'Yes' }, {})
    expect(m.canonical).not.toHaveProperty('documentation_assistance_requested')
  })

  it('flags an unrecognised assistance answer instead of guessing', () => {
    const m = computeMutations(base(), { [CMP_FIELD_IDS.assistanceRequested]: 'Maybe' }, {})
    expect(m.unrecognized_assistance_value).toBe('Maybe')
  })

  it('records staff edits of region and assistance as overrides so a re-sync cannot undo them', () => {
    expect(overrideFieldsForEdit(['passport_region', 'documentation_assistance_requested'])).toEqual(['passport_region', 'documentation_assistance_requested'])
  })
})

describe('Canadian documents: self-reported concern, not a renewal status', () => {
  it('"No" is a review concern and does not become a document status', () => {
    const p = withAnswer('No')
    expect(canadianDocSelfReport(p)).toEqual({ answer: 'no', concern: true })
    expect(effectiveCanadaDocReadiness(p)).toBeNull()
    const r = deriveReadiness(p)
    expect(r.readiness).toBe('action_required')
    expect(r.reasons).toContain(CANADIAN_DOCS_REVIEW_REASON)
    expect(r.reasons.join(' ')).not.toMatch(/renewal/i)
    expect(attentionCategoryKeys(p)).toContain('canadian_docs_review')
    expect(attentionCategoryKeys(p)).not.toContain('pr_card')
  })

  it('"Yes" raises no Canadian-document issue', () => {
    const p = withAnswer('Yes', { canada_status_document_readiness: 'UNKNOWN' })
    expect(canadianDocSelfReport(p).concern).toBe(false)
    expect(effectiveCanadaDocReadiness(p)).toBe('READY')
    expect(deriveReadiness(p).reasons).not.toContain(CANADIAN_DOCS_REVIEW_REASON)
  })

  it('a legacy RENEWAL_NEEDED written by an earlier sync is treated as the concern, not as a known renewal', () => {
    const p = withAnswer('No', { canada_status_document_readiness: 'RENEWAL_NEEDED' })
    expect(effectiveCanadaDocReadiness(p)).toBeNull()
    expect(deriveReadiness(p).reasons).toContain(CANADIAN_DOCS_REVIEW_REASON)
  })

  it('a staff decision always wins over the self-report', () => {
    const p = withAnswer('No', { canada_status_document_readiness: 'READY', override_fields: { canada_status_document_readiness: { overridden: true } } })
    expect(canadianDocSelfReport(p).concern).toBe(false)
    expect(deriveReadiness(p).reasons).not.toContain(CANADIAN_DOCS_REVIEW_REASON)
  })

  it('citizens never raise the concern', () => {
    expect(canadianDocSelfReport(withAnswer('No', { canada_residency_status: 'CANADIAN_CITIZEN' })).concern).toBe(false)
  })

  it('missing answer stays unknown and creates no concern', () => {
    const p = base()
    expect(canadianDocSelfReport(p)).toEqual({ answer: null, concern: false })
    expect(deriveCanadianDocumentation(p).selfReport.concern).toBe(false)
  })
})

describe('Assistance is separate from readiness', () => {
  it('reads the stored value, falling back to the raw CMP answer for participants synced before the column existed', () => {
    expect(effectiveAssistanceRequested(base({ documentation_assistance_requested: true }))).toBe(true)
    expect(effectiveAssistanceRequested(base({ documentation_assistance_requested: false, source_values: { cmp_documentation: { assistance_requested: 'Yes' } } }))).toBe(false)
    expect(effectiveAssistanceRequested(base({ source_values: { cmp_documentation: { assistance_requested: 'Yes' } } }))).toBe(true)
    expect(effectiveAssistanceRequested(base())).toBeNull()
  })

  it('asking for assistance does not change the overall readiness', () => {
    const ready = base({ visa_requirement: 'not_required', visa_process_status: 'not_applicable', canada_residency_status: 'CANADIAN_CITIZEN' })
    const asked = { ...ready, documentation_assistance_requested: true }
    expect(deriveReadiness(asked)).toEqual(deriveReadiness(ready))
    expect(deriveReadiness(asked).readiness).toBe('ready')
  })

  it('surfaces a visa / travel-documentation team action and no passport or Canadian renewal wording', () => {
    const r = deriveDocumentationActions(base({ documentation_assistance_requested: true }), { targets, now: NOW })
    const item = r.items.find((i) => i.id === 'assistance')
    expect(r.assistance).toBe(true)
    expect(item.kind).toBe(ACTION_KIND.TEAM)
    expect(item.text).toMatch(/visa \/ travel documentation assistance/i)
    expect(item.level).toBeNull()
  })
})

describe('Target-date risk', () => {
  it('counts whole days and classifies due soon / overdue', () => {
    expect(daysUntil('2026-10-19', NOW)).toBe(18)
    expect(daysUntil('2026-09-28', NOW)).toBe(-3)
    expect(riskForTarget('2026-10-19', NOW)).toEqual({ level: RISK.ON_TRACK, days: 18 })
    expect(riskForTarget('2026-10-09', NOW)).toEqual({ level: RISK.DUE_SOON, days: 8 })
    expect(riskForTarget('2026-10-01', NOW)).toEqual({ level: RISK.DUE_SOON, days: 0 })
    expect(riskForTarget('2026-09-28', NOW)).toEqual({ level: RISK.OVERDUE, days: -3 })
    expect(riskForTarget(null, NOW)).toBeNull()
    expect(riskForTarget('not a date', NOW)).toBeNull()
  })

  it('reads only the visa and passport targets from the event settings', () => {
    expect(readTargets({ icplc_deadlines: { visa_target_date: '2026-10-19', passport_ready_target: '2026-10-15', registration_deadline: '2026-01-01', flight_booking_deadline: '2026-02-02' } }))
      .toEqual({ visaTarget: '2026-10-19', passportTarget: '2026-10-15' })
    expect(readTargets(undefined)).toEqual({ visaTarget: null, passportTarget: null })
  })

  it('visa not started, in progress and not submitted read as specified', () => {
    const notStarted = deriveDocumentationActions(base({ visa_process_status: 'not_started' }), { targets, now: NOW }).items.find((i) => i.id === 'visa')
    expect(notStarted.text).toBe('Visa not started — 18 days to visa target')
    expect(notStarted.level).toBe(RISK.ON_TRACK)
    const inProgress = deriveDocumentationActions(base({ visa_process_status: 'in_progress' }), { targets: { visaTarget: '2026-10-09' }, now: NOW }).items.find((i) => i.id === 'visa')
    expect(inProgress.text).toBe('Visa in progress — 8 days to visa target')
    expect(inProgress.level).toBe(RISK.DUE_SOON)
    const late = deriveDocumentationActions(base({ visa_process_status: 'in_progress' }), { targets: { visaTarget: '2026-09-28' }, now: NOW }).items.find((i) => i.id === 'visa')
    expect(late.text).toBe('Visa not submitted — target passed 3 days ago')
    expect(late.level).toBe(RISK.OVERDUE)
  })

  it('submitted, processing and approved visas raise no target risk', () => {
    for (const status of ['submitted', 'processing', 'approved']) {
      const r = deriveDocumentationActions(base({ visa_process_status: status }), { targets: { visaTarget: '2026-09-01' }, now: NOW })
      expect(r.items.find((i) => i.id === 'visa')).toBeUndefined()
    }
  })

  it('a visa is not chased for someone who does not need one (ECOWAS)', () => {
    const p = base({ visa_requirement: 'review', visa_process_status: 'not_started', passport_region: 'ECOWAS' })
    expect(deriveDocumentationActions(p, { targets: { visaTarget: '2026-09-01' }, now: NOW }).items.find((i) => i.id === 'visa')).toBeUndefined()
  })

  it('an overdue target never changes overall readiness or makes anyone Blocked', () => {
    const p = base({ visa_process_status: 'not_started', passport_readiness: 'ready' })
    const before = deriveReadiness(p)
    const risk = deriveDocumentationActions(p, { targets: { visaTarget: '2020-01-01', passportTarget: '2020-01-01' }, now: NOW })
    expect(risk.worst).toBe(RISK.OVERDUE)
    expect(deriveReadiness(p)).toEqual(before)
    expect(before.readiness).not.toBe('blocked')
  })

  it('registration and flight-booking dates are ignored entirely', () => {
    const p = base({ arrival_flight: null, arrival_date: null, registration_status: 'not_registered' })
    const withDates = deriveDocumentationActions(p, { targets: { ...targets, registrationDeadline: '2000-01-01', flightBookingDeadline: '2000-01-01' }, now: NOW })
    const without = deriveDocumentationActions(p, { targets, now: NOW })
    expect(withDates).toEqual(without)
  })
})

describe('Passport: participant action with target monitoring, never a renewal workflow', () => {
  it('a valid passport creates no passport item and no issue', () => {
    expect(deriveDocumentationActions(base(), { targets, now: NOW }).items.find((i) => i.id === 'passport')).toBeUndefined()
  })

  it('renewal in progress is a participant action with the target timing', () => {
    const p = base({ passport_readiness: 'renewal_in_progress', visa_process_status: 'not_started' })
    const item = deriveDocumentationActions(p, { targets, now: NOW }).items.find((i) => i.id === 'passport')
    expect(item.kind).toBe(ACTION_KIND.PARTICIPANT)
    expect(item.text).toBe('Passport renewal in progress — participant must obtain a valid passport — 14 days to passport-ready target')
    expect(item.level).toBe(RISK.DUE_SOON)
  })

  it('no valid passport past the target is overdue and says it may delay visa processing', () => {
    const item = deriveDocumentationActions(base({ passport_readiness: 'no_passport' }), { targets: { passportTarget: '2026-09-29' }, now: NOW }).items.find((i) => i.id === 'passport')
    expect(item.text).toBe('No valid passport — participant must obtain a valid passport — target passed 2 days ago, may delay visa processing')
    expect(item.level).toBe(RISK.OVERDUE)
  })

  it('unsure and issue are review items, unknown only matters for committed participants', () => {
    expect(deriveDocumentationActions(base({ passport_readiness: 'unsure' }), {}).items.find((i) => i.id === 'passport').kind).toBe(ACTION_KIND.REVIEW)
    expect(deriveDocumentationActions(base({ passport_readiness: 'issue' }), {}).items.find((i) => i.id === 'passport').kind).toBe(ACTION_KIND.REVIEW)
    expect(deriveDocumentationActions(base({ passport_readiness: 'unknown', participation_status: 'tracking' }), {}).items.find((i) => i.id === 'passport')).toBeUndefined()
    expect(deriveDocumentationActions(base({ passport_readiness: 'unknown' }), {}).items.find((i) => i.id === 'passport')).toBeTruthy()
  })

  it('no target timing when the person needs no visa', () => {
    const p = base({ passport_readiness: 'renewal_in_progress', visa_requirement: 'not_required' })
    const item = deriveDocumentationActions(p, { targets, now: NOW }).items.find((i) => i.id === 'passport')
    expect(item.text).toBe('Passport renewal in progress — participant must obtain a valid passport')
    expect(item.level).toBeNull()
  })

  it('does not invent passport-renewal assistance wording anywhere', () => {
    const texts = ['renewal_in_progress', 'renewal_needed', 'no_passport', 'unsure', 'issue', 'unknown']
      .flatMap((s) => deriveDocumentationActions(base({ passport_readiness: s, documentation_assistance_requested: true }), { targets, now: NOW }).items)
      .map((i) => i.text)
    for (const t of texts) expect(t).not.toMatch(/ICPLC will|team will (renew|obtain)|assist.*(passport|PR card|permit)/i)
  })

  it('renewal in progress is not Blocked unless the visa is required (existing dependency rule)', () => {
    expect(deriveReadiness(base({ passport_readiness: 'renewal_in_progress', visa_requirement: 'not_required', visa_process_status: 'not_applicable' })).readiness).toBe('action_required')
  })
})

describe('Follow-up ordering and missing information', () => {
  it('ranks overdue visas above due-soon, and assistance breaks ties', () => {
    const overdue = base({ id: 'a', full_name: 'A', visa_process_status: 'not_started' })
    const soon = base({ id: 'b', full_name: 'B', visa_process_status: 'not_started', documentation_assistance_requested: true })
    const ctxOverdue = { targets: { visaTarget: '2026-09-20' }, now: NOW }
    expect(followUpFirst([soon, overdue], ctxOverdue).map((r) => r.p.id)).toEqual(['b', 'a']) // equal risk, assistance first
    const mixed = followUpFirst([base({ id: 'c', full_name: 'C', visa_process_status: 'not_started' }), overdue], { targets: { visaTarget: '2026-09-20' }, now: NOW })
    expect(mixed).toHaveLength(2)
  })

  it('participants with nothing to follow up on are left out', () => {
    expect(followUpFirst([base()], { targets, now: NOW })).toEqual([])
  })

  it('people marked not attending produce nothing', () => {
    expect(deriveDocumentationActions(base({ participation_status: 'not_attending', passport_readiness: 'no_passport' }), { targets, now: NOW }).items).toEqual([])
  })

  it('missing information yields no invented urgency', () => {
    const r = deriveDocumentationActions({ id: 'x', full_name: 'X', participation_status: 'tracking' }, {})
    expect(r.items).toEqual([])
    expect(r.worst).toBeNull()
  })
})
