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
  return linkedParticipantIds
}

export function filterParticipantsByWorkingListView(
  participants = [],
  registrations = [],
  maps = [],
  eventId = null,
  view = 'all',
  getReadiness = null,
) {
  if (!view || view === 'all') return participants
  const linkedParticipantIds = registrationLinkedParticipantIds(registrations, maps, eventId)

  return participants.filter((participant) => {
    if (view === 'registered') return linkedParticipantIds.has(participant.id)
    if (view === 'not_registered') return !linkedParticipantIds.has(participant.id)
    if (view === 'confirmed') return participant.participation_status === 'confirmed'
    if (view === 'needs_attention') {
      const readiness = getReadiness ? getReadiness(participant) : null
      return readiness === 'action_required' || readiness === 'blocked'
    }
    return true
  })
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
