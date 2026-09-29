// Room Assignments draws its people from the Working List (icplc_participants) instead of legacy
// registrations. The room UI keys people by `email`, so people without an email get a stable
// "UNMATCHED:<id>" key (the same convention the room emailer already skips).

export const ROOM_GENDER_LABELS = { male: 'Male', female: 'Female' }

export function participantToRoomPerson(p) {
  return {
    id: p.id,
    email: p.email || `UNMATCHED:${p.id}`,
    fullName: p.full_name,
    gender: ROOM_GENDER_LABELS[p.gender] || '',
    subgroup: p.subgroup || '',
    fellowship: p.region || '',
    arrivalDate: p.arrival_date || null,
    departureDate: p.departure_date || null,
    arrivalFlight: p.arrival_flight || null,
    departureFlight: p.departure_flight || null,
    fullyConfirmed: p.participation_status === 'confirmed',
    fromWorkingList: true,
  }
}

/** Confirmed Working List participants, as people Room Assignments can place. */
export function roomPeopleFromParticipants(participants = []) {
  return participants
    .filter((p) => p.participation_status === 'confirmed')
    .map(participantToRoomPerson)
    .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
}
