// Shared visual constants for the time-blocking Planner, matching the
// existing Nexus palette used by the legacy Planner.
export const PRIMARY = '#4C2A92'
export const BORDER = '#EDE8DC'
export const TEXT = '#2D2A22'
export const MUTED = '#9E9488'
export const BG = '#F4F1EA'
export const SLOT_HOVER = '#EDE8F8'

export const PRIORITY_DOT = { urgent: '#C94830', high: '#E8A020', medium: '#4C2A92', low: '#9E9488' }

export const HOUR_HEIGHT = 60 // px per hour row
export const DAY_START_HOUR = 6 // 6 AM (user-configurable in Phase 2)
export const DAY_END_HOUR = 22 // 10 PM

export function spaceColor(space) {
  const raw = space?.color
  if (!raw) return PRIMARY
  return raw.startsWith?.('#') ? raw : `#${raw}`
}
