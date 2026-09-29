import { describe, expect, it } from 'vitest'
import {
  normalizeEmail,
  makePrimaryPayload,
  lookupEmailClaim,
  isOwnershipConflict,
  candidateMatches,
  reconciliationState,
  REGISTRATION_SOURCE_TYPE,
  OWNERSHIP_CONFLICT_CODE,
} from '../../features/icplc/lib/reconciliation.js'

// ============================================================================
// NORMALIZATION (cases 1-5)
// ============================================================================

describe('normalizeEmail', () => {
  it('1: NULL input → NULL', () => {
    expect(normalizeEmail(null)).toBeNull()
  })

  it('2: empty string → NULL', () => {
    expect(normalizeEmail('')).toBeNull()
  })

  it('3: whitespace-only string → NULL', () => {
    expect(normalizeEmail('   ')).toBeNull()
  })

  it('4: lowercases input', () => {
    expect(normalizeEmail('Alice@EXAMPLE.COM')).toBe('alice@example.com')
  })

  it('5: trims leading/trailing whitespace', () => {
    expect(normalizeEmail('  bob@example.com  ')).toBe('bob@example.com')
  })
})

// ============================================================================
// MAKE PRIMARY — provenance + ownership (cases 17, 36-39)
// ============================================================================

describe('makePrimaryPayload', () => {
  it('17 / 36: swaps primary and alternate email values', () => {
    const p = { email: 'alice@example.com', alternate_email: 'alice.work@example.com', source_values: {}, override_fields: {} }
    const payload = makePrimaryPayload(p)
    expect(payload.email).toBe('alice.work@example.com')
    expect(payload.alternate_email).toBe('alice@example.com')
  })

  it('does not modify participation_status, registration_status, or identity maps', () => {
    const p = {
      email: 'a@x.com',
      alternate_email: 'b@x.com',
      participation_status: 'confirmed',
      registration_status: 'registered',
      source_values: {},
      override_fields: {},
    }
    const payload = makePrimaryPayload(p)
    expect(payload).not.toHaveProperty('participation_status')
    expect(payload).not.toHaveProperty('registration_status')
  })

  it('37 / 38: provenance travels with values — source_values swapped correctly', () => {
    const p = {
      email: 'a@x.com',
      alternate_email: 'b@x.com',
      source_values: {
        email: { source: 'registration', value: 'a@x.com', observed_at: '2027-01-01' },
        alternate_email: { source: 'nexus_manual', value: 'b@x.com', observed_at: '2027-01-02' },
      },
      override_fields: {},
    }
    const payload = makePrimaryPayload(p)
    // b@x.com becomes primary → its provenance (nexus_manual) should be under 'email' key
    expect(payload.source_values.email.source).toBe('nexus_manual')
    expect(payload.source_values.email.value).toBe('b@x.com')
    // a@x.com becomes alternate → its provenance (registration) should be under 'alternate_email' key
    expect(payload.source_values.alternate_email.source).toBe('registration')
    expect(payload.source_values.alternate_email.value).toBe('a@x.com')
  })

  it('39: override_fields keys swap with values', () => {
    const p = {
      email: 'a@x.com',
      alternate_email: 'b@x.com',
      source_values: {},
      override_fields: {
        email: { overridden: true, by: 'user-1', at: '2027-01-01' },
      },
    }
    const payload = makePrimaryPayload(p)
    // The override was on the primary slot; after swap that value is now alternate
    expect(payload.override_fields.alternate_email).toEqual({ overridden: true, by: 'user-1', at: '2027-01-01' })
    expect(payload.override_fields.email).toBeUndefined()
  })

  it('handles null alternate_email gracefully (no-op swap)', () => {
    const p = { email: 'a@x.com', alternate_email: null, source_values: {}, override_fields: {} }
    const payload = makePrimaryPayload(p)
    expect(payload.email).toBeNull()
    expect(payload.alternate_email).toBe('a@x.com')
  })

  it('handles both emails null', () => {
    const p = { email: null, alternate_email: null, source_values: {}, override_fields: {} }
    const payload = makePrimaryPayload(p)
    expect(payload.email).toBeNull()
    expect(payload.alternate_email).toBeNull()
  })

  it('source_values not keyed on email slots are preserved unchanged', () => {
    const p = {
      email: 'a@x.com',
      alternate_email: 'b@x.com',
      source_values: {
        email: { source: 'registration' },
        registration_status: { source: 'csv', value: 'registered' },
      },
      override_fields: {
        registration_status: { overridden: true, by: 'u', at: 't' },
      },
    }
    const payload = makePrimaryPayload(p)
    expect(payload.source_values.registration_status).toEqual({ source: 'csv', value: 'registered' })
    expect(payload.override_fields.registration_status).toEqual({ overridden: true, by: 'u', at: 't' })
  })
})

// ============================================================================
// CANDIDATE MATCHES — dual email slot checking (cases 21-22, 24)
// ============================================================================

describe('candidateMatches — dual email slots', () => {
  const participants = [
    { id: 'p1', full_name: 'Alice Smith', email: 'alice@example.com', alternate_email: null },
    { id: 'p2', full_name: 'Bob Jones', email: 'bob@example.com', alternate_email: 'bob.alt@example.com' },
    { id: 'p3', full_name: 'Carol White', email: null, alternate_email: 'carol@example.com' },
  ]

  it('21: finds candidate by primary email match', () => {
    const reg = { id: 'r1', email: 'alice@example.com', full_name: 'Alice S' }
    const matches = candidateMatches(reg, participants)
    expect(matches).toHaveLength(1)
    expect(matches[0].participant.id).toBe('p1')
    expect(matches[0].reason).toBe('Email match')
  })

  it('22: finds candidate by alternate email match', () => {
    const reg = { id: 'r2', email: 'bob.alt@example.com', full_name: 'Robert J' }
    const matches = candidateMatches(reg, participants)
    expect(matches).toHaveLength(1)
    expect(matches[0].participant.id).toBe('p2')
    expect(matches[0].reason).toBe('Email match')
  })

  it('22b: finds candidate whose only email is alternate', () => {
    const reg = { id: 'r3', email: 'carol@example.com', full_name: 'Unknown' }
    const matches = candidateMatches(reg, participants)
    expect(matches).toHaveLength(1)
    expect(matches[0].participant.id).toBe('p3')
  })

  it('24: case-insensitive match on both slots', () => {
    const reg = { id: 'r4', email: 'BOB.ALT@EXAMPLE.COM', full_name: 'Bob' }
    const matches = candidateMatches(reg, participants)
    expect(matches).toHaveLength(1)
    expect(matches[0].participant.id).toBe('p2')
  })

  it('returns empty when no match on either slot', () => {
    const reg = { id: 'r5', email: 'nobody@example.com', full_name: 'Unknown Name' }
    const matches = candidateMatches(reg, participants)
    expect(matches).toHaveLength(0)
  })
})

// ============================================================================
// isOwnershipConflict (race recovery helper)
// ============================================================================

describe('isOwnershipConflict', () => {
  it('detects claims constraint violation', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "icplc_email_claims_event_id_normalized_email_key"' }
    expect(isOwnershipConflict(err)).toBe(true)
  })

  it('detects icplc_participants primary email unique index violation', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "icplc_participants_event_email_idx"' }
    expect(isOwnershipConflict(err)).toBe(true)
  })

  it('does not flag unrelated 23505 errors', () => {
    const err = { code: '23505', message: 'duplicate key value on icplc_tags_name_idx' }
    expect(isOwnershipConflict(err)).toBe(false)
  })

  it('does not flag non-23505 errors', () => {
    const err = { code: '42501', message: 'permission denied for table icplc_email_claims' }
    expect(isOwnershipConflict(err)).toBe(false)
  })

  it('handles null/undefined gracefully', () => {
    expect(isOwnershipConflict(null)).toBe(false)
    expect(isOwnershipConflict(undefined)).toBe(false)
    expect(isOwnershipConflict({})).toBe(false)
  })
})

// ============================================================================
// lookupEmailClaim (mock-based, behavior spec)
// ============================================================================

describe('lookupEmailClaim', () => {
  it('returns participant_id when claim exists', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { participant_id: 'p-winner' } }) }) }) }),
      }),
    }
    const result = await lookupEmailClaim(mockSupabase, 'event-1', 'alice@example.com')
    expect(result).toBe('p-winner')
  })

  it('returns null when no claim exists', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      }),
    }
    const result = await lookupEmailClaim(mockSupabase, 'event-1', 'nobody@example.com')
    expect(result).toBeNull()
  })

  it('returns null for null/empty email without querying', async () => {
    const mockSupabase = { from: () => { throw new Error('should not be called') } }
    expect(await lookupEmailClaim(mockSupabase, 'event-1', null)).toBeNull()
    expect(await lookupEmailClaim(mockSupabase, 'event-1', '')).toBeNull()
    expect(await lookupEmailClaim(mockSupabase, 'event-1', '   ')).toBeNull()
  })
})

// ============================================================================
// IDENTITY MAP SURVIVAL (cases 32-35)
// ============================================================================

describe('identity map survival through email changes', () => {
  const baseParticipant = {
    id: 'p1',
    full_name: 'Alice',
    email: 'alice@example.com',
    alternate_email: null,
    participation_status: 'confirmed',
  }
  const registration = { id: 'reg-1', event_config_id: 'icplc-event', submitted_at: '2027-01-01T00:00:00Z', full_name: 'Alice' }
  const confirmedMap = { source_type: REGISTRATION_SOURCE_TYPE, source_key: 'reg-1', participant_id: 'p1' }

  it('32: identity map survives primary email edit', () => {
    const updatedParticipant = { ...baseParticipant, email: 'alice.new@example.com' }
    const state = reconciliationState(registration, [updatedParticipant], confirmedMap)
    expect(state.state).toBe('MATCHED')
    expect(state.participant.id).toBe('p1')
  })

  it('33: identity map survives alternate email addition', () => {
    const updatedParticipant = { ...baseParticipant, alternate_email: 'alice.work@example.com' }
    const state = reconciliationState(registration, [updatedParticipant], confirmedMap)
    expect(state.state).toBe('MATCHED')
    expect(state.participant.id).toBe('p1')
  })

  it('34: identity map survives alternate email removal', () => {
    const withAlternate = { ...baseParticipant, alternate_email: 'alice.old@example.com' }
    const afterRemoval = { ...withAlternate, alternate_email: null }
    const state = reconciliationState(registration, [afterRemoval], confirmedMap)
    expect(state.state).toBe('MATCHED')
  })

  it('35: identity map survives Make Primary swap', () => {
    const withAlternate = { ...baseParticipant, alternate_email: 'alice.work@example.com' }
    const swapped = { ...withAlternate, ...makePrimaryPayload(withAlternate) }
    // After swap: email='alice.work@example.com', alternate_email='alice@example.com'
    expect(swapped.email).toBe('alice.work@example.com')
    const state = reconciliationState(registration, [swapped], confirmedMap)
    expect(state.state).toBe('MATCHED')
    expect(state.participant.id).toBe('p1')
  })
})

// ============================================================================
// EVENT ISOLATION (case 43)
// ============================================================================

describe('event isolation', () => {
  it('same email in different events is represented as separate participant records', () => {
    // Two participants in different events with the same email should NOT conflict at the
    // application layer — conflict is enforced per-event by claims UNIQUE(event_id, normalized_email).
    // At the JS model layer, each participant belongs to its own event; no overlap.
    const pEvent1 = { id: 'p-e1', email: 'shared@example.com', event_id: 'event-1' }
    const pEvent2 = { id: 'p-e2', email: 'shared@example.com', event_id: 'event-2' }

    // candidateMatches scans a single event's participants array — no cross-event candidates
    const reg = { id: 'r1', email: 'shared@example.com' }
    const matchesEvent1 = candidateMatches(reg, [pEvent1])
    const matchesEvent2 = candidateMatches(reg, [pEvent2])

    expect(matchesEvent1[0].participant.id).toBe('p-e1')
    expect(matchesEvent2[0].participant.id).toBe('p-e2')
    // They never appear in the same match result
    expect(candidateMatches(reg, [pEvent1]).some((m) => m.participant.id === 'p-e2')).toBe(false)
  })
})
