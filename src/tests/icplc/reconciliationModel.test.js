import { describe, expect, it } from 'vitest'
import {
  POOL_SOURCE_TYPE,
  REGISTRATION_SOURCE_TYPE,
  candidateMatches,
  filterParticipantsByWorkingListView,
  isValidCurrentRegistration,
  participantInsertFromRegistration,
  poolSourceKey,
  registrationCoverage,
  registrationLinkedParticipantIds,
  reconciliationState,
  registrationSourceKey,
} from '../../features/icplc/lib/reconciliation.js'

const eventId = 'icplc-event'

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

  it('builds a Working List participant and durable registration identity for a no-match ICPLC registration', () => {
    const registration = {
      id: 'registration-new',
      event_config_id: eventId,
      full_name: 'New Registrant',
      email: 'new@example.com',
      subgroup: 'North',
      submitted_at: '2027-01-01T00:00:00Z',
    }

    expect(reconciliationState(registration, participants, null).state).toBe('UNMATCHED')
    const insert = participantInsertFromRegistration(registration, eventId, '2027-01-02T00:00:00Z')

    expect(insert).toMatchObject({
      event_id: eventId,
      full_name: 'New Registrant',
      email: 'new@example.com',
      subgroup: 'North',
      registration_status: 'registered',
    })
    expect(insert).not.toHaveProperty('participation_status')
    expect(insert.source_values.registration_status).toMatchObject({
      source: REGISTRATION_SOURCE_TYPE,
      registration_id: 'registration-new',
      value: 'registered',
    })
  })

  it('keeps possible matches in review instead of creating duplicate participants', () => {
    const registration = {
      id: 'registration-possible',
      event_config_id: eventId,
      full_name: 'Alice Example',
      email: 'alice@example.com',
      submitted_at: '2027-01-01T00:00:00Z',
    }

    const state = reconciliationState(registration, participants, null)

    expect(state.state).toBe('POSSIBLE_MATCH')
    expect(state.candidates).toHaveLength(1)
    expect(state.candidates[0].participant.id).toBe('participant-1')
  })

  it('resolves pool and manual participants to the same participant when staff confirms registration identity', () => {
    const poolParticipant = {
      id: 'pool-participant',
      full_name: 'Pool Person',
      email: 'pool@example.com',
      participation_status: 'tracking',
      registration_status: 'not_registered',
      source_values: {
        pool_source: { source: POOL_SOURCE_TYPE, source_key: 'cmp-1' },
      },
    }
    const manualParticipant = {
      id: 'manual-participant',
      full_name: 'Manual Person',
      email: 'manual@example.com',
      participation_status: 'likely',
      registration_status: 'not_registered',
      source_values: {
        created_from: { source: 'nexus_manual' },
      },
    }

    expect(reconciliationState(
      { id: 'reg-pool', email: 'pool@example.com', submitted_at: '2027-01-01T00:00:00Z' },
      [poolParticipant],
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'reg-pool', participant_id: 'pool-participant' },
    ).participant.id).toBe('pool-participant')
    expect(reconciliationState(
      { id: 'reg-manual', email: 'manual@example.com', submitted_at: '2027-01-01T00:00:00Z' },
      [manualParticipant],
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'reg-manual', participant_id: 'manual-participant' },
    ).participant.id).toBe('manual-participant')
  })

  it('derives Registered coverage from linked active Working List participants', () => {
    const workingList = [
      { id: 'p1', participation_status: 'confirmed' },
      { id: 'p2', participation_status: 'tracking' },
      { id: 'p3', participation_status: 'not_attending' },
    ]
    const registrations = [
      { id: 'r1', event_config_id: eventId, submitted_at: '2027-01-01T00:00:00Z' },
      { id: 'r2', event_config_id: eventId, submitted_at: '2027-01-01T00:00:00Z' },
      { id: 'unmatched', event_config_id: eventId, submitted_at: '2027-01-01T00:00:00Z' },
    ]
    const maps = [
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'r1', participant_id: 'p1' },
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'r2', participant_id: 'p3' },
      { source_type: POOL_SOURCE_TYPE, source_key: 'cmp-1', participant_id: 'p2' },
    ]

    expect(registrationCoverage(workingList, registrations, maps, eventId)).toEqual({
      registered: 1,
      total: 2,
      percent: 50,
    })
  })

  it('filters Working List registration coverage from the same identity-link truth as Overview', () => {
    const workingList = [
      { id: 'p1', participation_status: 'pending', registration_status: 'not_registered' },
      { id: 'p2', participation_status: 'confirmed', registration_status: 'registered' },
      { id: 'p3', participation_status: 'confirmed', registration_status: 'registered' },
    ]
    const registrations = [
      { id: 'r1', event_config_id: eventId, submitted_at: '2027-01-01T00:00:00Z' },
      { id: 'expired', event_config_id: eventId, submitted_at: null },
    ]
    const maps = [
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'r1', participant_id: 'p1' },
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'expired', participant_id: 'p3' },
    ]

    expect([...registrationLinkedParticipantIds(registrations, maps, eventId)]).toEqual(['p1'])
    expect(filterParticipantsByWorkingListView(workingList, registrations, maps, eventId, 'registered'))
      .toEqual([workingList[0]])
    expect(filterParticipantsByWorkingListView(workingList, registrations, maps, eventId, 'not_registered'))
      .toEqual([workingList[1], workingList[2]])
  })

  it('keeps registration coverage independent from participation filters', () => {
    const workingList = [
      { id: 'p1', participation_status: 'confirmed' },
      { id: 'p2', participation_status: 'pending' },
      { id: 'p3', participation_status: 'confirmed' },
    ]
    const registrations = [
      { id: 'r1', event_config_id: eventId, submitted_at: '2027-01-01T00:00:00Z' },
      { id: 'r2', event_config_id: eventId, submitted_at: '2027-01-01T00:00:00Z' },
    ]
    const maps = [
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'r1', participant_id: 'p1' },
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'r2', participant_id: 'p2' },
    ]

    expect(filterParticipantsByWorkingListView(workingList, registrations, maps, eventId, 'registered'))
      .toEqual([workingList[0], workingList[1]])
    expect(filterParticipantsByWorkingListView(workingList, registrations, maps, eventId, 'confirmed'))
      .toEqual([workingList[0], workingList[2]])
  })

  it('filters the Working List needs-attention view from derived readiness', () => {
    const workingList = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]

    expect(filterParticipantsByWorkingListView(
      workingList,
      [],
      [],
      eventId,
      'needs_attention',
      (participant) => (participant.id === 'p1' ? 'blocked' : participant.id === 'p2' ? 'action_required' : 'ready'),
    )).toEqual([workingList[0], workingList[1]])
  })

  it('is idempotent when the same registration link is processed repeatedly', () => {
    const workingList = [
      { id: 'p1', participation_status: 'confirmed' },
    ]
    const registrations = [
      { id: 'r1', event_config_id: eventId, submitted_at: '2027-01-01T00:00:00Z' },
    ]
    const maps = [
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'r1', participant_id: 'p1' },
      { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'r1', participant_id: 'p1' },
    ]

    expect(registrationCoverage(workingList, registrations, maps, eventId).registered).toBe(1)
  })

  it('rejects non-ICPLC/TII-scoped registrations for Working List creation', () => {
    const tiiRegistration = {
      id: 'tii-registration',
      event_config_id: 'tii-event',
      full_name: 'TII Person',
      submitted_at: '2027-01-01T00:00:00Z',
    }

    expect(isValidCurrentRegistration(tiiRegistration, eventId)).toBe(false)
    expect(() => participantInsertFromRegistration(tiiRegistration, eventId)).toThrow(/not valid/)
  })
})
