import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { deriveReadiness } from '../../features/icplc/lib/readinessEngine.js'
import {
  DOCUMENT_READINESS,
  DOCUMENT_TYPE,
  RESIDENCY_STATUS,
  deriveDocumentType,
} from '../../features/registration/icplcDocReadiness.js'

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(here, '../../../supabase/migrations/20270829000000_icplc_canadian_status_document.sql')

describe('ICPLC Canadian documentation canonical participant model', () => {
  it('derives document type from participant residency status instead of storing it', () => {
    expect(deriveDocumentType(RESIDENCY_STATUS.PERMANENT_RESIDENT)).toBe(DOCUMENT_TYPE.PR_CARD)
    expect(deriveDocumentType(RESIDENCY_STATUS.INTERNATIONAL_STUDENT)).toBe(DOCUMENT_TYPE.STUDY_PERMIT)
    expect(deriveDocumentType(RESIDENCY_STATUS.CANADIAN_CITIZEN)).toBe(DOCUMENT_TYPE.NONE)
  })

  it('feeds participant Canadian document state into readiness', () => {
    const participant = {
      passport_readiness: 'ready',
      visa_requirement: 'not_required',
      visa_process_status: 'not_applicable',
      registration_status: 'registered',
      participation_status: 'confirmed',
      arrival_flight: 'AC100',
      arrival_date: '2027-01-15',
      departure_date: '2027-01-20',
      canada_residency_status: RESIDENCY_STATUS.WORK_PERMIT,
      canada_status_document_readiness: DOCUMENT_READINESS.RENEWAL_NEEDED,
    }

    const result = deriveReadiness(participant)

    expect(result.readiness).toBe('action_required')
    expect(result.reasons.some((reason) => /renewal needed/i.test(reason))).toBe(true)
  })

  it('keeps the Canadian migration scoped to icplc_participants and identity maps', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE public.icplc_participants')
    expect(sql).toContain('canada_status_document_readiness')
    expect(sql).toContain("'registration'")
    expect(sql).toContain("'mi_member'")
    expect(sql).not.toMatch(/ALTER TABLE\s+public\.registrations/i)
    expect(sql).not.toContain('doc_update_token')
    expect(sql).not.toContain('icplc_update_documentation')
    expect(sql).not.toContain('icplc_resume_form_sync')
  })

  it('does not put Canadian operational authority into registration-created participant payloads', async () => {
    const { participantInsertFromRegistration } = await import('../../features/icplc/lib/reconciliation.js')
    const insert = participantInsertFromRegistration({
      id: 'registration-1',
      event_config_id: 'icplc-event',
      full_name: 'Canadian Fields Stay Participant-Owned',
      submitted_at: '2027-01-01T00:00:00Z',
      canada_residency_status: RESIDENCY_STATUS.PERMANENT_RESIDENT,
      canada_status_document_readiness: DOCUMENT_READINESS.READY,
    }, 'icplc-event')

    expect(insert).not.toHaveProperty('canada_residency_status')
    expect(insert).not.toHaveProperty('canada_status_document_readiness')
    expect(insert.source_values).not.toHaveProperty('canada_residency_status')
    expect(insert.source_values).not.toHaveProperty('canada_status_document_readiness')
  })
})
