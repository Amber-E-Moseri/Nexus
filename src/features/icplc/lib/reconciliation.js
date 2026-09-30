import { needsAttentionNow } from './attentionModel.js'

export const REGISTRATION_SOURCE_TYPE = 'registration'
// Identity maps written by the Registration CSV import: the registration ID in the export is the link.
export const REGISTRATION_CSV_SOURCE_TYPE = 'registration_csv'
export const REGISTRATION_LINK_SOURCE_TYPES = [REGISTRATION_SOURCE_TYPE, REGISTRATION_CSV_SOURCE_TYPE]
export const POOL_SOURCE_TYPE = 'mi_member'
export const OWNERSHIP_CONFLICT_CODE = '23505'
export const EMAIL_CLAIMS_CONSTRAINT = 'icplc_email_claims_event_id_normalized_email_key'

// Canonical email normalization: must match database normalize_email() function
// LOWER(TRIM(email)) with NULL for empty/whitespace
export function normalizeEmail(email) {
  const trimmed = String(email || '').trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

export function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeName(value) {
  return normalizeIdentity(value).replace(/[^a-z0-9]/g, '')
}

export function registrationSourceKey(registration) {
  return registration?.id ? String(registration.id) : null
}

export function poolSourceKey(person) {
  return person?.cmp_id ? String(person.cmp_id) : person?.id ? String(person.id) : null
}

export function registrationDisplayName(registration) {
  const direct = registration?.full_name || registration?.fullName
  if (direct) return direct
  return [registration?.first_name || registration?.firstName, registration?.last_name || registration?.lastName]
    .filter(Boolean)
    .join(' ')
}

export function isActiveParticipant(participant) {
  return participant?.participation_status !== 'not_attending'
}

export function isValidCurrentRegistration(registration, eventId = null) {
  if (!registration?.id) return false
  if (eventId && registration.event_config_id && registration.event_config_id !== eventId) return false
  if ('submitted_at' in registration && !registration.submitted_at) return false

  const status = normalizeIdentity(registration.status || registration.registration_status)
  return !['cancelled', 'canceled', 'rejected', 'invalid', 'void'].includes(status)
}

export function registrationSourceValue(registration, observedAt = new Date().toISOString()) {
  return {
    value: 'registered',
    source: REGISTRATION_SOURCE_TYPE,
    registration_id: registration.id,
    observed_at: observedAt,
  }
}

export function registrationSourceMetadata(registration) {
  return {
    registration_id: registration.id,
    email: registration.email || null,
    submitted_at: registration.submitted_at || null,
  }
}

export function participantInsertFromRegistration(registration, eventId, observedAt = new Date().toISOString()) {
  const fullName = registrationDisplayName(registration)
  if (!isValidCurrentRegistration(registration, eventId)) {
    throw new Error('Registration is not valid for this ICPLC event')
  }
  if (!fullName) throw new Error('Registration is missing a name')

  return {
    event_id: eventId,
    full_name: fullName,
    email: registration.email || null,
    subgroup: registration.subgroup || null,
    registration_status: 'registered',
    source_values: {
      registration_status: registrationSourceValue(registration, observedAt),
      registration_source: registrationSourceMetadata(registration),
    },
  }
}

export function registrationCoverage(participants = [], registrations = [], maps = [], eventId = null) {
  const activeParticipants = participants.filter(isActiveParticipant)
  const linkedParticipantIds = registrationLinkedParticipantIds(registrations, maps, eventId)
  const registered = activeParticipants.filter((participant) => linkedParticipantIds.has(participant.id)).length
  const total = activeParticipants.length
  return {
    registered,
    total,
    percent: total ? Math.round((registered / total) * 100) : 0,
  }
}

export function registrationLinkedParticipantIds(registrations = [], maps = [], eventId = null) {
  const validRegistrationKeys = new Set(
    registrations
      .filter((registration) => isValidCurrentRegistration(registration, eventId))
      .map(registrationSourceKey)
      .filter(Boolean),
  )
  const linkedParticipantIds = new Set(
    maps
      .filter((map) => map.source_type === REGISTRATION_SOURCE_TYPE || !map.source_type)
      .filter((map) => validRegistrationKeys.has(map.source_key))
      .map((map) => map.participant_id)
      .filter(Boolean),
  )
  // Anyone with a Registration CSV link is registered (the export is the source of truth).
  for (const map of maps) {
    if (map.source_type === REGISTRATION_CSV_SOURCE_TYPE && map.participant_id) {
      linkedParticipantIds.add(map.participant_id)
    }
  }
  return linkedParticipantIds
}

export function filterParticipantsByWorkingListView(
  participants = [],
  registrations = [],
  maps = [],
  eventId = null,
  view = 'all',
  getReadiness = null,
  getNeedsAttention = needsAttentionNow,
) {
  if (!view || view === 'all') return participants
  const linkedParticipantIds = registrationLinkedParticipantIds(registrations, maps, eventId)

  return participants.filter((participant) => {
    if (view === 'registered') return linkedParticipantIds.has(participant.id)
    if (view === 'not_registered') return !linkedParticipantIds.has(participant.id)
    if (view === 'confirmed') {
      // A Ready person counts as Confirmed (derived, never persisted).
      return participant.participation_status === 'confirmed'
        || (isActiveParticipant(participant) && !!getReadiness && getReadiness(participant) === 'ready')
    }
    if (view === 'needs_attention') {
      // One canonical definition (attentionModel.needsAttentionNow); callers may inject a test but should not.
      return getNeedsAttention(participant)
    }
    return true
  })
}

export function candidateMatches(registration, participants = [], confirmedParticipantId = null) {
  if (confirmedParticipantId) return []
  const regEmail = normalizeEmail(registration?.email)
  const regName = normalizeName(registrationDisplayName(registration))
  if (!regEmail && !regName) return []

  return participants
    .map((participant) => {
      // Check both primary and alternate email fields
      const primaryEmailMatch = regEmail && normalizeEmail(participant.email) === regEmail
      const alternateEmailMatch = regEmail && normalizeEmail(participant.alternate_email) === regEmail
      const exactEmail = primaryEmailMatch || alternateEmailMatch
      const exactName = regName && normalizeName(participant.full_name) === regName
      if (!exactEmail && !exactName) return null
      return {
        participant,
        reason: exactEmail ? 'Email match' : 'Name match',
        strength: exactEmail ? 2 : 1,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.strength - a.strength || a.participant.full_name.localeCompare(b.participant.full_name))
}

export function reconciliationState(registration, participants, identityMap) {
  const participantId = identityMap?.participant_id || null
  if (participantId) {
    const participant = participants.find((p) => p.id === participantId) || null
    return {
      state: 'MATCHED',
      participant,
      candidates: [],
    }
  }

  const candidates = candidateMatches(registration, participants)
  if (candidates.length === 1 && candidates[0].strength === 2) {
    return { state: 'POSSIBLE_MATCH', participant: null, candidates }
  }
  if (candidates.length > 0) {
    return { state: 'POSSIBLE_MATCH', participant: null, candidates }
  }
  return { state: 'UNMATCHED', participant: null, candidates: [] }
}

// Make Primary: atomically swap primary and alternate emails.
// Provenance travels with the VALUES, not the slot labels.
// After the swap: source_values.email and override_fields.email describe the new
// primary value; source_values.alternate_email describes the new alternate value.
export function makePrimaryPayload(participant) {
  const newEmail = participant.alternate_email || null
  const newAlternate = participant.email || null

  // Swap source_values entries keyed 'email' ↔ 'alternate_email'
  const sv = { ...(participant.source_values || {}) }
  const svEmail = sv.email
  const svAlt = sv.alternate_email
  if (svEmail !== undefined) sv.alternate_email = svEmail; else delete sv.alternate_email
  if (svAlt !== undefined) sv.email = svAlt; else delete sv.email

  // Swap override_fields entries keyed 'email' ↔ 'alternate_email'
  const of_ = { ...(participant.override_fields || {}) }
  const ofEmail = of_.email
  const ofAlt = of_.alternate_email
  if (ofEmail !== undefined) of_.alternate_email = ofEmail; else delete of_.alternate_email
  if (ofAlt !== undefined) of_.email = ofAlt; else delete of_.email

  return {
    email: newEmail,
    alternate_email: newAlternate,
    source_values: sv,
    override_fields: of_,
  }
}

// lookupEmailClaim: canonical exact-match lookup via icplc_email_claims table.
// Returns the participant_id that owns the normalized email, or null if unclaimed.
// This is the authoritative resolution path (step 2 in the resolution order).
// Resolution order for registrations:
//   1. durable identity_map (by registration.id)
//   2. exact claim lookup (this function)
//   3. candidateMatches() — display candidates for staff review
//   4. no match → create new participant
export async function lookupEmailClaim(supabase, eventId, email) {
  const norm = normalizeEmail(email)
  if (!norm) return null
  const { data } = await supabase
    .from('icplc_email_claims')
    .select('participant_id')
    .eq('event_id', eventId)
    .eq('normalized_email', norm)
    .maybeSingle()
  return data?.participant_id || null
}

// isOwnershipConflict: returns true if the error is a 23505 on the email claims
// uniqueness constraint (indicating concurrent email ownership collision).
export function isOwnershipConflict(error) {
  return (
    error?.code === OWNERSHIP_CONFLICT_CODE &&
    (error?.message?.includes('icplc_email_claims') ||
     error?.message?.includes('normalized_email') ||
     error?.message?.includes('icplc_participants_event_email_idx'))
  )
}
