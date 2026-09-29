// Board drag-and-drop: moving a card between Participation columns changes participation_status.
// (Readiness columns are worked out automatically, so they are never a drop target.)

export const BOARD_PARTICIPATION_STATUSES = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']

/** Is dropping participant `p` on `column` a real change to a valid status? */
export function isParticipationMove(p, column) {
  return !!p && BOARD_PARTICIPATION_STATUSES.includes(column) && p.participation_status !== column
}

/** New participants list with one person's participation status changed (used for the optimistic update). */
export function applyParticipationMove(participants = [], id, column) {
  return participants.map((p) => (p.id === id ? { ...p, participation_status: column } : p))
}
