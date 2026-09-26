export const REGISTRATION_SOURCE_TYPE = 'registration'
export const POOL_SOURCE_TYPE = 'mi_member'

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

export function candidateMatches(registration, participants = [], confirmedParticipantId = null) {
  if (confirmedParticipantId) return []
  const regEmail = normalizeIdentity(registration?.email)
  const regName = normalizeName(registrationDisplayName(registration))
  if (!regEmail && !regName) return []

  return participants
    .map((participant) => {
      const exactEmail = regEmail && normalizeIdentity(participant.email) === regEmail
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
