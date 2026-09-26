import { describe, expect, it } from 'vitest'

function applyStaffDocumentationEdit(participant, changes) {
  return {
    ...participant,
    ...changes,
    override_fields: {
      ...participant.override_fields,
      ...Object.fromEntries(
        Object.keys(changes).map((field) => [
          field,
          { overridden: true, source: 'nexus_manual' },
        ]),
      ),
    },
  }
}

describe('ICPLC participant documentation concurrency boundary', () => {
  it('does not model public form writes or resume-sync adoption', () => {
    const participant = {
      id: 'participant-1',
      canada_residency_status: 'PERMANENT_RESIDENT',
      canada_status_document_readiness: 'READY',
      override_fields: {},
    }

    const edited = applyStaffDocumentationEdit(participant, {
      canada_status_document_readiness: 'RENEWAL_IN_PROGRESS',
    })

    expect(edited.canada_status_document_readiness).toBe('RENEWAL_IN_PROGRESS')
    expect(edited.override_fields.canada_status_document_readiness.source).toBe('nexus_manual')
    expect(edited).not.toHaveProperty('canada_status_doc_readiness_participant')
  })

  it('keeps registration reconciliation separate from participation authority', () => {
    const participant = {
      id: 'participant-1',
      participation_status: 'confirmed',
      registration_status: 'not_registered',
      source_values: {},
    }

    const afterRegistrationLink = {
      ...participant,
      registration_status: 'registered',
      source_values: {
        registration_status: {
          source: 'registration',
          registration_id: 'registration-1',
        },
      },
    }

    expect(afterRegistrationLink.registration_status).toBe('registered')
    expect(afterRegistrationLink.participation_status).toBe('confirmed')
  })
})
