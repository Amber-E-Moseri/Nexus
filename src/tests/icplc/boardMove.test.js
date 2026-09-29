import { describe, it, expect } from 'vitest'
import { isParticipationMove, applyParticipationMove } from '../../features/icplc/lib/boardMove.js'

const people = [
  { id: 'a', full_name: 'Ada', participation_status: 'tracking' },
  { id: 'b', full_name: 'Bola', participation_status: 'confirmed' },
]

describe('Board drag and drop', () => {
  it('a drop on another participation column is a move', () => {
    expect(isParticipationMove(people[0], 'confirmed')).toBe(true)
    expect(isParticipationMove(people[0], 'not_attending')).toBe(true)
  })

  it('dropping on the same column, an unknown column or a readiness column is not a move', () => {
    expect(isParticipationMove(people[0], 'tracking')).toBe(false)
    expect(isParticipationMove(people[0], 'ready')).toBe(false)
    expect(isParticipationMove(people[0], 'action_required')).toBe(false)
    expect(isParticipationMove(null, 'confirmed')).toBe(false)
  })

  it('applies the move to one person only, without mutating the original list', () => {
    const next = applyParticipationMove(people, 'a', 'confirmed')
    expect(next.find((p) => p.id === 'a').participation_status).toBe('confirmed')
    expect(next.find((p) => p.id === 'b').participation_status).toBe('confirmed')
    expect(people[0].participation_status).toBe('tracking')
  })
})
