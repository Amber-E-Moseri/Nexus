import { describe, expect, it } from 'vitest'
import {
  POOL_SOURCE_TYPE,
  REGISTRATION_SOURCE_TYPE,
  candidateMatches,
  poolSourceKey,
  reconciliationState,
  registrationSourceKey,
} from '../../features/icplc/lib/reconciliation.js'

const participants = [
  {
    id: 'participant-1',
    full_name: 'Alice Example',
    email: 'alice@example.com',
    participation_status: 'confirmed',
    registration_status: 'not_registered',
  },
  {
    id: 'participant-2',
    full_name: 'Bob Example',
    email: 'bob@example.com',
    participation_status: 'tracking',
    registration_status: 'unknown',
  },
]

describe('ICPLC reconciliation model', () => {
  it('keeps registrations as sources until staff confirms an identity map', () => {
    const registration = { id: 'registration-1', full_name: 'New Person', email: 'new@example.com' }

    expect(registrationSourceKey(registration)).toBe('registration-1')
    expect(reconciliationState(registration, participants, null)).toEqual({
      state: 'UNMATCHED',
      participant: null,
      candidates: [],
    })
  })

  it('suggests possible matches without mutating participant status', () => {
    const registration = { id: 'registration-2', full_name: 'Alice Example', email: 'ALICE@example.com' }
    const state = reconciliationState(registration, participants, null)

    expect(state.state).toBe('POSSIBLE_MATCH')
    expect(state.candidates[0].participant.id).toBe('participant-1')
    expect(state.candidates[0].reason).toBe('Email match')
    expect(participants[0].participation_status).toBe('confirmed')
    expect(participants[0].registration_status).toBe('not_registered')
  })

  it('uses durable identity maps as the only confirmed registration link', () => {
    const registration = { id: 'registration-3', full_name: 'Someone Else', email: 'someone@example.com' }
    const state = reconciliationState(registration, participants, {
      source_type: REGISTRATION_SOURCE_TYPE,
      source_key: 'registration-3',
      participant_id: 'participant-2',
    })

    expect(state.state).toBe('MATCHED')
    expect(state.participant.id).toBe('participant-2')
    expect(candidateMatches(registration, participants, state.participant.id)).toEqual([])
  })

  it('treats member intelligence rows as pool provenance, not as participants', () => {
    expect(POOL_SOURCE_TYPE).toBe('mi_member')
    expect(poolSourceKey({ cmp_id: 'cmp-123', id: 'local-1' })).toBe('cmp-123')
    expect(poolSourceKey({ id: 'local-1' })).toBe('local-1')
  })
})
