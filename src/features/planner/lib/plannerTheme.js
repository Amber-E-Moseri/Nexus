// Design tokens for the time-blocking Planner, using CSS variables from the system design.
export const PRIMARY = 'var(--accent)'
export const BORDER = 'var(--border)'
export const TEXT = 'var(--text-primary)'
export const MUTED = 'var(--text-secondary)'
export const BG = 'var(--bg-app)'
export const SLOT_HOVER = 'var(--accent-light)'

export const PRIORITY_DOT = {
  urgent: '#C94830',
  high: '#E8A020',
  medium: 'var(--accent)',
  low: 'var(--text-secondary)'
}

export const HOUR_HEIGHT = 60 // px per hour row
export const DAY_START_HOUR = 6 // 6 AM (user-configurable in Phase 2)
export const DAY_END_HOUR = 22 // 10 PM

export function spaceColor(space) {
  const raw = space?.color
  if (!raw) return PRIMARY
  return raw.startsWith?.('#') ? raw : `#${raw}`
}
