/**
 * ICPLC CMP Documentation Mapper Tests
 *
 * Covers all mappings, value allowlists, overrides, source-only fields,
 * and prohibited mutations.
 */

import { describe, it, expect } from 'vitest'
import {
  mapPassportStatus,
  mapCanadianStatus,
  normalizeEmail,
  buildSourceValues,
  mergeSourceValues,
  computeMutations,
  CMP_FIELD_IDS,
} from '../features/icplc/lib/cmpDocumentation'

describe('CMP Documentation Mapper', () => {
  // ========== PASSPORT STATUS TESTS ==========
  describe('mapPassportStatus', () => {
    it('maps "I have a valid passport" to ready', () => {
      expect(mapPassportStatus('I have a valid passport')).toBe('ready')
    })

    it('maps "I do not currently have a valid passport" to no_passport', () => {
      expect(mapPassportStatus('I do not currently have a valid passport')).toBe('no_passport')
    })

    it('maps "My passport application or renewal is in progress" to renewal_in_progress', () => {
      expect(
        mapPassportStatus('My passport application or renewal is in progress'),
      ).toBe('renewal_in_progress')
    })

    it('returns null for unknown passport value', () => {
      expect(mapPassportStatus('Some unknown value')).toBeNull()
    })

    it('returns null for empty/null passport value', () => {
      expect(mapPassportStatus('')).toBeNull()
      expect(mapPassportStatus(null)).toBeNull()
      expect(mapPassportStatus(undefined)).toBeNull()
    })

    it('case-sensitive: does not match case variants', () => {
      expect(mapPassportStatus('i have a valid passport')).toBeNull()
      expect(mapPassportStatus('I HAVE A VALID PASSPORT')).toBeNull()
    })
  })

  // ========== CANADIAN STATUS TESTS ==========
  describe('mapCanadianStatus', () => {
    it('maps "Canadian Citizen" to CANADIAN_CITIZEN', () => {
      expect(mapCanadianStatus('Canadian Citizen')).toBe('CANADIAN_CITIZEN')
    })

    it('maps "Permanent Resident" to PERMANENT_RESIDENT', () => {
      expect(mapCanadianStatus('Permanent Resident')).toBe('PERMANENT_RESIDENT')
    })

    it('maps "International Student / Study Permit Holder" to INTERNATIONAL_STUDENT', () => {
      expect(mapCanadianStatus('International Student / Study Permit Holder')).toBe(
        'INTERNATIONAL_STUDENT',
      )
    })

    it('maps "Post-Graduation Work Permit Holder" to POST_GRADUATION_WORKER', () => {
      expect(mapCanadianStatus('Post-Graduation Work Permit Holder')).toBe('POST_GRADUATION_WORKER')
    })

    it('maps "Visitor" to VISITOR_OTHER', () => {
      expect(mapCanadianStatus('Visitor')).toBe('VISITOR_OTHER')
    })

    it('returns null for unknown canadian status', () => {
      expect(mapCanadianStatus('Unknown Status')).toBeNull()
    })

    it('returns null for empty/null value', () => {
      expect(mapCanadianStatus('')).toBeNull()
      expect(mapCanadianStatus(null)).toBeNull()
    })

    it('case-sensitive: does not match case variants', () => {
      expect(mapCanadianStatus('canadian citizen')).toBeNull()
      expect(mapCanadianStatus('CANADIAN CITIZEN')).toBeNull()
    })
  })

  // ========== EMAIL NORMALIZATION TESTS ==========
  describe('normalizeEmail', () => {
    it('normalizes uppercase to lowercase', () => {
      expect(normalizeEmail('TEST@EXAMPLE.COM')).toBe('test@example.com')
    })

    it('trims whitespace', () => {
      expect(normalizeEmail('  test@example.com  ')).toBe('test@example.com')
    })

    it('returns null for empty string', () => {
      expect(normalizeEmail('')).toBeNull()
      expect(normalizeEmail('   ')).toBeNull()
    })

    it('returns null for null/undefined', () => {
      expect(normalizeEmail(null)).toBeNull()
      expect(normalizeEmail(undefined)).toBeNull()
    })
  })

  // ========== SOURCE VALUES TESTS ==========
  describe('buildSourceValues', () => {
    it('preserves all CMP raw answers in source_values', () => {
      const submission = {
        id: 'sub-123',
        createdAt: '2026-09-28T00:00:00Z',
        submitterName: 'Test User',
        answers: {
          [CMP_FIELD_IDS.firstName]: 'John',
          [CMP_FIELD_IDS.lastName]: 'Doe',
          [CMP_FIELD_IDS.email]: 'john@example.com',
          [CMP_FIELD_IDS.phone]: '555-1234',
          [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
          [CMP_FIELD_IDS.passportRegion]: 'ECOWAS',
          [CMP_FIELD_IDS.canadianStatus]: 'Canadian Citizen',
          [CMP_FIELD_IDS.canadianDocValidity]: 'Yes',
          [CMP_FIELD_IDS.assistanceRequested]: 'No',
        },
      }

      const source = buildSourceValues(submission, submission.answers)
      expect(source.cmp_documentation.submission_id).toBe('sub-123')
      expect(source.cmp_documentation.first_name).toBe('John')
      expect(source.cmp_documentation.passport_region).toBe('ECOWAS')
      expect(source.cmp_documentation.assistance_requested).toBe('No')
    })

    it('includes observed_at timestamp', () => {
      const submission = {
        id: 'sub-456',
        createdAt: '2026-09-28T00:00:00Z',
        answers: {},
      }

      const source = buildSourceValues(submission, {})
      expect(source.cmp_documentation.observed_at).toBeDefined()
      expect(new Date(source.cmp_documentation.observed_at)).toBeInstanceOf(Date)
    })
  })

  describe('mergeSourceValues', () => {
    it('refreshes defined CMP evidence while preserving unrelated namespaces and omitted optional evidence', () => {
      const existing = {
        registration_csv: { registration_id: 'R1' },
        cmp_documentation: {
          submission_id: 'old',
          phone: '555-1111',
          assistance_requested: 'Yes',
          canadian_doc_valid_through_nov: 'No',
        },
      }
      const incoming = {
        cmp_documentation: {
          submission_id: 'new',
          phone: '555-2222',
          assistance_requested: undefined,
          canadian_doc_valid_through_nov: undefined,
        },
      }

      const merged = mergeSourceValues(existing, incoming)
      expect(merged.registration_csv.registration_id).toBe('R1')
      expect(merged.cmp_documentation.submission_id).toBe('new')
      expect(merged.cmp_documentation.phone).toBe('555-2222')
      expect(merged.cmp_documentation.assistance_requested).toBe('Yes')
      expect(merged.cmp_documentation.canadian_doc_valid_through_nov).toBe('No')
    })
  })

  // ========== OVERRIDE PROTECTION TESTS ==========
  describe('computeMutations with override protection', () => {
    it('skips passport_readiness mutation if overridden', () => {
      const participant = {
        id: 'part-1',
        override_fields: {
          passport_readiness: { overridden: true, by: 'user-1', at: '2026-09-27' },
        },
      }
      const answers = {
        [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.passport_readiness).toBeUndefined()
      expect(mutations.source_values).toBeDefined() // But source still refreshes
    })

    it('skips canada_residency_status mutation if overridden', () => {
      const participant = {
        id: 'part-2',
        override_fields: {
          canada_residency_status: { overridden: true, by: 'user-2', at: '2026-09-27' },
        },
      }
      const answers = {
        [CMP_FIELD_IDS.canadianStatus]: 'Canadian Citizen',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.canada_residency_status).toBeUndefined()
    })

    it('applies mutation if no override present', () => {
      const participant = {
        id: 'part-3',
        override_fields: {},
      }
      const answers = {
        [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.passport_readiness).toBe('ready')
    })

    it('applies mutation if override_fields is missing', () => {
      const participant = {
        id: 'part-4',
      }
      const answers = {
        [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.passport_readiness).toBe('ready')
    })
  })

  // ========== UNRECOGNIZED VALUE TESTS ==========
  describe('computeMutations with unrecognized values', () => {
    it('flags unknown passport status', () => {
      const participant = { id: 'part-5', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.passportStatus]: 'Unknown Passport State',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.unrecognized_passport_value).toBe('Unknown Passport State')
      expect(mutations.canonical.passport_readiness).toBeUndefined()
    })

    it('flags unknown canadian status', () => {
      const participant = { id: 'part-6', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.canadianStatus]: 'Unknown Canadian Status',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.unrecognized_canadian_value).toBe('Unknown Canadian Status')
      expect(mutations.canonical.canada_residency_status).toBeUndefined()
    })
  })

  // ========== PROHIBITED MUTATIONS TESTS ==========
  describe('source-only fields (must NOT be in canonical mutations)', () => {
    it('never includes first_name in canonical mutations', () => {
      const participant = { id: 'part-7', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.firstName]: 'John',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.full_name).toBeUndefined()
      expect(mutations.canonical.first_name).toBeUndefined()
    })

    it('never includes last_name in canonical mutations', () => {
      const participant = { id: 'part-8', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.lastName]: 'Doe',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.last_name).toBeUndefined()
      expect(mutations.canonical.full_name).toBeUndefined()
    })

    it('never includes phone in canonical mutations', () => {
      const participant = { id: 'part-9', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.phone]: '555-1234',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.phone).toBeUndefined()
    })

    it('never includes email in canonical mutations', () => {
      const participant = { id: 'part-10', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.email]: 'test@example.com',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.email).toBeUndefined()
    })

    it('never includes passport_region in canonical mutations', () => {
      const participant = { id: 'part-11', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.passportRegion]: 'ECOWAS',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.passport_region).toBeUndefined()
      expect(mutations.canonical.passport_country).toBeUndefined()
    })

    it('never includes canadian_doc_validity in canonical mutations', () => {
      const participant = { id: 'part-12', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.canadianDocValidity]: 'Yes',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.canada_status_document_readiness).toBeUndefined()
    })

    it('never includes assistance_requested in canonical mutations', () => {
      const participant = { id: 'part-13', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.assistanceRequested]: 'Yes',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.assistance_requested).toBeUndefined()
    })
  })

  // ========== MULTI-FIELD TESTS ==========
  describe('computeMutations with multiple fields', () => {
    it('computes both passport and canadian status mutations together', () => {
      const participant = { id: 'part-14', override_fields: {} }
      const answers = {
        [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
        [CMP_FIELD_IDS.canadianStatus]: 'Permanent Resident',
        [CMP_FIELD_IDS.firstName]: 'Jane',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.passport_readiness).toBe('ready')
      expect(mutations.canonical.canada_residency_status).toBe('PERMANENT_RESIDENT')
      expect(mutations.canonical.full_name).toBeUndefined() // source-only
    })

    it('respects individual field overrides', () => {
      const participant = {
        id: 'part-15',
        override_fields: {
          passport_readiness: { overridden: true },
          // canada_residency_status NOT overridden
        },
      }
      const answers = {
        [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
        [CMP_FIELD_IDS.canadianStatus]: 'Canadian Citizen',
      }

      const mutations = computeMutations(participant, answers, {})
      expect(mutations.canonical.passport_readiness).toBeUndefined() // overridden
      expect(mutations.canonical.canada_residency_status).toBe('CANADIAN_CITIZEN') // not overridden
    })
  })
})
