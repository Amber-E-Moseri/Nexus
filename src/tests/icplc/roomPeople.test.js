import { describe, it, expect } from 'vitest'
import { participantToRoomPerson, roomPeopleFromParticipants } from '../../features/icplc/lib/roomPeople.js'

const base = { id: 'p1', full_name: 'Ada Obi', email: 'ada@example.com', gender: 'female', subgroup: 'BLW West Subgroup A', region: 'BLW Regina', arrival_date: '2026-11-25', departure_date: '2026-11-29', participation_status: 'confirmed' }

describe('Room Assignments people from the Working List', () => {
  it('maps a participant to the shape the room UI uses', () => {
    expect(participantToRoomPerson(base)).toMatchObject({
      email: 'ada@example.com', fullName: 'Ada Obi', gender: 'Female', subgroup: 'BLW West Subgroup A',
      fellowship: 'BLW Regina', arrivalDate: '2026-11-25', departureDate: '2026-11-29', fullyConfirmed: true,
    })
  })

  it('leaves gender blank when not recorded instead of guessing', () => {
    expect(participantToRoomPerson({ ...base, gender: null }).gender).toBe('')
    expect(participantToRoomPerson({ ...base, gender: 'other' }).gender).toBe('')
  })

  it('gives people without an email a key the room emailer skips', () => {
    const person = participantToRoomPerson({ ...base, email: null })
    expect(person.email).toBe('UNMATCHED:p1')
    expect(person.email.startsWith('UNMATCHED:')).toBe(true)
  })

  it('includes only confirmed participants, sorted by name', () => {
    const people = roomPeopleFromParticipants([
      { ...base, id: 'b', full_name: 'Zed' },
      { ...base, id: 'c', full_name: 'Bola', participation_status: 'likely' },
      { ...base, id: 'd', full_name: 'Amaka', participation_status: 'not_attending' },
      { ...base, id: 'e', full_name: 'Chi' },
    ])
    expect(people.map((p) => p.fullName)).toEqual(['Chi', 'Zed'])
  })
})
