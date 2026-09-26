import { describe, expect, test } from 'vitest'
import {
  DOCUMENT_READINESS,
  DOCUMENT_TYPE,
  RESIDENCY_STATUS,
  deriveDocumentType,
  docNeedsAttention,
} from '../features/registration/icplcDocReadiness.js'

describe('ICPLC participant-owned Canadian documentation', () => {
  test('derives required document type from canonical participant status', () => {
    expect(deriveDocumentType(RESIDENCY_STATUS.CANADIAN_CITIZEN)).toBe(DOCUMENT_TYPE.NONE)
    expect(deriveDocumentType(RESIDENCY_STATUS.PERMANENT_RESIDENT)).toBe(DOCUMENT_TYPE.PR_CARD)
    expect(deriveDocumentType(RESIDENCY_STATUS.INTERNATIONAL_STUDENT)).toBe(DOCUMENT_TYPE.STUDY_PERMIT)
    expect(deriveDocumentType(RESIDENCY_STATUS.POST_GRADUATION_WORKER)).toBe(DOCUMENT_TYPE.PGWP)
    expect(deriveDocumentType(RESIDENCY_STATUS.WORK_PERMIT)).toBe(DOCUMENT_TYPE.WORK_PERMIT)
    expect(deriveDocumentType(RESIDENCY_STATUS.VISITOR_OTHER)).toBe(DOCUMENT_TYPE.REVIEW)
  })

  test('staff readiness is evaluated from participant fields, not registration shadow fields', () => {
    const participant = {
      canadaResidencyStatus: RESIDENCY_STATUS.PERMANENT_RESIDENT,
      canadaStatusDocumentReadiness: DOCUMENT_READINESS.RENEWAL_NEEDED,
    }

    expect(docNeedsAttention(participant)).toMatch(/renewal needed/i)
  })

  test('Canadian citizens do not require a Canadian status document workflow', () => {
    expect(docNeedsAttention({
      canadaResidencyStatus: RESIDENCY_STATUS.CANADIAN_CITIZEN,
      canadaStatusDocumentReadiness: null,
    })).toBeNull()
  })
})
