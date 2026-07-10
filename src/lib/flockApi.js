/**
 * Shared Flock CRM (Pastoral CRM) style tokens and display helpers.
 *
 * The data layer lives in src/lib/flockSupabase.js (`callFlockCRM`) — every
 * Flock surface routes through it. The old Google Apps Script caller that
 * lived here has been retired; do NOT reintroduce an HTTP client for Flock.
 */

/**
 * Locked ClickUp-refresh palette + typography for every Flock surface.
 * Purple system (not the legacy amber/cream). Do not deviate — see the
 * Flock build-out brief style lock.
 */
export const FLOCK = {
  // Brand purple system (locked)
  purple: '#4C2A92',
  purpleHover: '#5F3BB8',
  live: '#7C5CE0',
  // Surfaces / neutrals tuned to the purple system
  surface: '#FAFAF8',
  card: '#FFFFFF',
  border: '#ECE7F5',
  borderStrong: '#DDD5EC',
  text: '#1E1633',
  muted: '#6B6480',
  // Tint fills for chips / stat tiles
  purpleTint: '#F3EEFF',
  redTint: '#FDEEEA',
  red: '#C94830',
  greenTint: '#ECF8F1',
  green: '#2D8653',
  amberTint: '#FBF3E4',
  amber: '#B4770F',
  // Typography (loaded in index.html)
  fontHead: "'Space Grotesk', system-ui, -apple-system, sans-serif",
  fontBody: "'Inter', system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
}

export function flockCard(extra = {}) {
  return {
    background: FLOCK.card,
    border: `1px solid ${FLOCK.border}`,
    borderRadius: '18px',
    boxShadow: '0 14px 34px rgba(30, 22, 51, 0.05)',
    ...extra,
  }
}

/** Relative "time ago" label for the live-metrics footer. */
export function formatTimeAgo(date) {
  if (!date) return 'never'
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (minutes <= 0) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Two-letter initials for avatar chips. */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
