/**
 * ICPLC documentation rules — Canadian status, ECOWAS classification, visa independence,
 * readiness and Needs Attention derivation (data-state matrix A–T).
 */
import { describe, it, expect } from 'vitest'
import {
  ECOWAS_MEMBER_COUNTRIES,
  PASSPORT_REGION,
  classifyPassportRegion,
} from '../../features/icplc/lib/passportRegion.js'
import {
  SUPPORTING_DOC,
  attentionCategoryKeys,
  deriveCanadianDocumentation,
  deriveDocumentation,
  derivePassportDocumentation,
} from '../../features/icplc/lib/documentationRules.js'
import { deriveReadiness } from '../../features/icplc/lib/readinessEngine.js'
import {
  DOCUMENT_READINESS,
  DOCUMENT_TYPE,
  RESIDENCY_STATUS,
  deriveDocumentType,
} from '../../features/registration/icplcDocReadiness.js'
import { overrideFieldsForEdit } from '../../features/icplc/lib/fieldAuthority.js'

// A fully-ready baseline: everything passes. Each case overrides one dimension.
const ready = {
  participation_status: 'confirmed',
  registration_status: 'registered',
  registration_link_status: 'registered',
  canada_residency_status: RESIDENCY_STATUS.CANADIAN_CITIZEN,
  canada_status_document_readiness: DOCUMENT_READINESS.NOT_APPLICABLE,
  passport_country: 'Ghana',
  passport_readiness: 'ready',
  visa_requirement: 'required',
  visa_process_status: 'approved',
  arrival_date: '2027-01-15',
  arrival_flight: 'AC1',
  departure_date: '2027-01-20',
}
const p = (over) => ({ ...ready, ...over })
const reasonsOf = (x) => deriveReadiness(x).reasons.join(' | ')

describe('Canadian status → required document (no visa influence)', () => {
  it.each([
    [RESIDENCY_STATUS.CANADIAN_CITIZEN, DOCUMENT_TYPE.NONE],
    [RESIDENCY_STATUS.PERMANENT_RESIDENT, DOCUMENT_TYPE.PR_CARD],
    [RESIDENCY_STATUS.INTERNATIONAL_STUDENT, DOCUMENT_TYPE.STUDY_PERMIT],
    [RESIDENCY_STATUS.POST_GRADUATION_WORKER, DOCUMENT_TYPE.PGWP],
    [RESIDENCY_STATUS.WORK_PERMIT, DOCUMENT_TYPE.WORK_PERMIT],
    [RESIDENCY_STATUS.VISITOR_OTHER, DOCUMENT_TYPE.REVIEW],
  ])('%s → %s', (status, doc) => {
    expect(deriveDocumentType(status)).toBe(doc)
  })

  it('Visitor/Other is never given an inferred document', () => {
    expect(deriveCanadianDocumentation({ canada_residency_status: 'VISITOR_OTHER' }).required).toBe(false)
  })
})

describe('ECOWAS classification (single helper)', () => {
  it('Nigeria and Ghana are ECOWAS because they are members, not special cases', () => {
    expect(classifyPassportRegion('Nigeria')).toBe('ECOWAS')
    expect(classifyPassportRegion('Ghana')).toBe('ECOWAS')
    expect(ECOWAS_MEMBER_COUNTRIES).toContain('Nigeria')
    expect(ECOWAS_MEMBER_COUNTRIES).toContain('Ghana')
  })
  it('classifies another configured member (Senegal) and aliases/codes', () => {
    expect(classifyPassportRegion('Senegal')).toBe('ECOWAS')
    expect(classifyPassportRegion('  ivory coast ')).toBe('ECOWAS')
    expect(classifyPassportRegion("Côte d'Ivoire")).toBe('ECOWAS')
    expect(classifyPassportRegion('GH')).toBe('ECOWAS')
    expect(classifyPassportRegion('cape verde')).toBe('ECOWAS')
  })
  it('classifies a configured non-ECOWAS country as NON_ECOWAS', () => {
    expect(classifyPassportRegion('Canada')).toBe('NON_ECOWAS')
    expect(classifyPassportRegion('Kenya')).toBe('NON_ECOWAS')
  })
  it('states that left ECOWAS are not members', () => {
    for (const c of ['Mali', 'Niger', 'Burkina Faso']) expect(classifyPassportRegion(c)).toBe('NON_ECOWAS')
  })
  it('null / empty / whitespace is UNKNOWN and never ECOWAS', () => {
    for (const v of [null, undefined, '', '   ']) expect(classifyPassportRegion(v)).toBe(PASSPORT_REGION.UNKNOWN)
  })
})

describe('Passport supporting document rule', () => {
  it('ECOWAS → no additional passport-specific document', () => {
    expect(derivePassportDocumentation({ passport_country: 'Nigeria' }).supportingDoc).toBe(SUPPORTING_DOC.NOT_REQUIRED)
  })
  it('NON_ECOWAS → staff-review state (no fabricated legal requirement)', () => {
    expect(derivePassportDocumentation({ passport_country: 'Kenya' }).supportingDoc).toBe(SUPPORTING_DOC.STAFF_REVIEW)
  })
  it('missing country → cannot classify', () => {
    expect(derivePassportDocumentation({}).supportingDoc).toBe(SUPPORTING_DOC.UNKNOWN)
  })
})

describe('Independence invariants (T)', () => {
  it('Canadian status / ECOWAS never set visa requirement', () => {
    for (const status of Object.values(RESIDENCY_STATUS)) {
      for (const country of ['Ghana', 'Kenya', null]) {
        const d = deriveDocumentation({ canada_residency_status: status, passport_country: country, visa_requirement: 'review' })
        expect(d.visa.requirement).toBe('review')
        const d2 = deriveDocumentation({ canada_residency_status: status, passport_country: country, visa_requirement: 'required' })
        expect(d2.visa.requirement).toBe('required')
      }
    }
  })
  it('changing Canadian status leaves passport + visa derivations untouched', () => {
    const a = deriveDocumentation(p({ canada_residency_status: 'PERMANENT_RESIDENT' }))
    const b = deriveDocumentation(p({ canada_residency_status: 'INTERNATIONAL_STUDENT' }))
    expect(a.passport).toEqual(b.passport)
    expect(a.visa).toEqual(b.visa)
  })
  it('changing passport country ECOWAS → NON_ECOWAS leaves Canadian + visa data untouched', () => {
    const base = p({ canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'READY', visa_process_status: 'in_progress' })
    const a = deriveDocumentation(base)
    const b = deriveDocumentation({ ...base, passport_country: 'Kenya' })
    expect(a.passport.region).toBe('ECOWAS')
    expect(b.passport.region).toBe('NON_ECOWAS')
    expect(a.canadian).toEqual(b.canadian)
    expect(a.visa).toEqual(b.visa)
  })
  it('ECOWAS classification alone does not make a participant ready (visa still required/unstarted)', () => {
    const x = p({ visa_process_status: 'not_started' })
    expect(deriveReadiness(x).readiness).toBe('action_required')
  })
})

describe('Data-state matrix', () => {
  it('A. Citizen + ECOWAS + visa approved → READY (no Canadian doc, no ECOWAS doc blockers)', () => {
    expect(deriveReadiness(p({})).readiness).toBe('ready')
  })
  it('B. Citizen + ECOWAS + visa required/not started → NEEDS ATTENTION: visa', () => {
    const x = p({ visa_process_status: 'not_started' })
    expect(deriveReadiness(x).readiness).toBe('action_required')
    expect(reasonsOf(x)).toMatch(/Visa required but not started/)
    expect(attentionCategoryKeys(x)).toContain('visa_not_started')
  })
  it('C. PR + ECOWAS, PR Card incomplete → attention (PR Card), no ECOWAS document', () => {
    const x = p({ canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'UNKNOWN' })
    expect(deriveReadiness(x).readiness).toBe('action_required')
    expect(reasonsOf(x)).toMatch(/PR Card/)
    expect(reasonsOf(x)).not.toMatch(/ECOWAS/i)
    expect(attentionCategoryKeys(x)).toContain('pr_card')
  })
  it('D. PR + PR Card ready + ECOWAS + visa done + travel → READY', () => {
    expect(deriveReadiness(p({ canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'READY' })).readiness).toBe('ready')
  })
  it('E. International Student, Study Permit incomplete → attention', () => {
    const x = p({ canada_residency_status: 'INTERNATIONAL_STUDENT', canada_status_document_readiness: 'UNKNOWN' })
    expect(reasonsOf(x)).toMatch(/Study Permit/)
    expect(attentionCategoryKeys(x)).toContain('study_permit')
  })
  it('F. Student, Study Permit ready, visa required/not started → attention: visa only', () => {
    const x = p({ canada_residency_status: 'INTERNATIONAL_STUDENT', canada_status_document_readiness: 'READY', visa_process_status: 'not_started' })
    expect(deriveReadiness(x).readiness).toBe('action_required')
    expect(reasonsOf(x)).toMatch(/Visa required but not started/)
    expect(reasonsOf(x)).not.toMatch(/Study Permit/)
  })
  it('G. PGWP missing → attention', () => {
    const x = p({ canada_residency_status: 'POST_GRADUATION_WORKER', canada_status_document_readiness: 'ISSUE' })
    expect(reasonsOf(x)).toMatch(/PGWP/)
    expect(attentionCategoryKeys(x)).toContain('pgwp')
  })
  it('H. Work Permit missing → attention', () => {
    const x = p({ canada_residency_status: 'WORK_PERMIT', canada_status_document_readiness: 'RENEWAL_NEEDED' })
    expect(reasonsOf(x)).toMatch(/Work Permit/)
    expect(attentionCategoryKeys(x)).toContain('work_permit')
  })
  it('I. PR + Non-ECOWAS: PR satisfied, non-ECOWAS review shown, visa still independent', () => {
    const x = p({ canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'READY', passport_country: 'Kenya', visa_requirement: 'review' })
    expect(reasonsOf(x)).not.toMatch(/PR Card/)
    expect(reasonsOf(x)).toMatch(/Visa requirement unknown/)
    expect(attentionCategoryKeys(x)).toContain('non_ecowas_review')
  })
  it('J. Citizen + Non-ECOWAS: no Canadian doc, passport workflow still applies, visa independent', () => {
    const x = p({ passport_country: 'Kenya', visa_requirement: 'not_required', visa_process_status: 'not_applicable' })
    expect(deriveCanadianDocumentation(x).required).toBe(false)
    expect(derivePassportDocumentation(x).supportingDoc).toBe(SUPPORTING_DOC.STAFF_REVIEW)
    expect(attentionCategoryKeys(x)).toContain('non_ecowas_review')
  })
  it('K. Missing passport country (registered + confirmed) → attention', () => {
    const x = p({ passport_country: null, passport_readiness: 'unknown' })
    expect(deriveReadiness(x).readiness).toBe('action_required')
    expect(reasonsOf(x)).toMatch(/Passport country missing/)
    expect(attentionCategoryKeys(x)).toContain('passport_country_missing')
  })
  it('K2. Passport marked ready without a country cannot be READY', () => {
    expect(deriveReadiness(p({ passport_country: '' })).readiness).toBe('action_required')
  })
  it('L. Manual, not registered, likely → Not Registered attention', () => {
    const x = p({ participation_status: 'likely', registration_status: 'not_registered', registration_link_status: 'not_registered' })
    expect(attentionCategoryKeys(x)).toContain('not_registered')
  })
  it('O. Passport incomplete → blocker visible', () => {
    const x = p({ passport_readiness: 'renewal_needed', visa_requirement: 'not_required' })
    expect(reasonsOf(x)).toMatch(/Passport action needed/)
    expect(attentionCategoryKeys(x)).toContain('passport_incomplete')
  })
  it('P. Visa blocked / in progress', () => {
    const blocked = p({ visa_process_status: 'issue' })
    expect(reasonsOf(blocked)).toMatch(/Visa issue/)
    expect(attentionCategoryKeys(blocked)).toContain('visa_blocked')
    const inProgress = p({ visa_process_status: 'in_progress' })
    expect(deriveReadiness(inProgress).readiness).toBe('in_progress')
  })
  it('Q. Travel incomplete for a confirmed participant is visible', () => {
    const x = p({ arrival_date: null, arrival_flight: null })
    expect(reasonsOf(x)).toMatch(/Itinerary missing/)
    expect(attentionCategoryKeys(x)).toContain('travel_incomplete')
  })
  it('Visa requirement unknown → attention for committed participants only', () => {
    expect(reasonsOf(p({ visa_requirement: 'review' }))).toMatch(/Visa requirement unknown/)
    expect(attentionCategoryKeys(p({ visa_requirement: 'review' }))).toContain('visa_unknown')
    expect(attentionCategoryKeys(p({ visa_requirement: 'review', participation_status: 'tracking' }))).not.toContain('visa_unknown')
  })
  it('not_attending participants raise no attention', () => {
    expect(attentionCategoryKeys(p({ participation_status: 'not_attending', passport_country: null }))).toEqual([])
  })
  it('a fully ready participant raises no attention categories except informational', () => {
    expect(attentionCategoryKeys(p({}))).toEqual([])
  })
})

describe('Override authority', () => {
  it('records overrides for source-mutable + staff Canadian fields, not for staff-only fields', () => {
    expect(overrideFieldsForEdit([
      'passport_readiness', 'visa_process_status', 'arrival_date',
      'canada_residency_status', 'passport_country', 'visa_requirement',
    ]).sort()).toEqual(['arrival_date', 'canada_residency_status', 'passport_readiness', 'visa_process_status'].sort())
  })
})
