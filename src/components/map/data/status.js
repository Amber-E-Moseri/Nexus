// The 4 canonical reach statuses for a campus, ported from the standalone map.
// Colors are SEMANTIC data encodings (they drive the legend + tally dots), so
// they intentionally stay as the original green/amber/blue/red — they are not
// theme chrome and must not be recolored to the brand palette.
export const STATUS = {
  'Established Fellowship': { color: '#1e8e3e', cls: 'established', emoji: '✅' },
  'Pioneering Fellowship':  { color: '#f9ab00', cls: 'pioneering',  emoji: '🟡' },
  'Influenced':             { color: '#1a73e8', cls: 'influenced',  emoji: '🔵' },
  'Not Reached':            { color: '#d93025', cls: 'not-reached', emoji: '🔴' },
}

export const STATUS_ORDER = Object.keys(STATUS)

// A campus with no hub within 25km is flagged with a purple diamond, distinct
// from the reach statuses.
export const NEEDS_PLAN_COLOR = '#8430ce'

export const DEFAULT_STATUS = 'Not Reached'

// "Reach" = anything better than Not Reached. Used for the coverage % bar.
export function isReached(status) {
  return status && status !== 'Not Reached'
}

export function statusColor(status) {
  return STATUS[status]?.color || '#9aa0a6'
}
