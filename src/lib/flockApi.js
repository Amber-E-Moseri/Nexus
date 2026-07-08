import { FLOCK_CRM_CONFIG } from './permissions'

/**
 * Shared Flock CRM (Pastoral CRM) front-end plumbing.
 *
 * `callFlockAPI` is the single action-caller for the live GAS web app — every
 * Flock surface in Nexus routes through it. Do NOT introduce a second HTTP
 * client or a duplicate config; add new actions by calling this with the
 * matching GAS action name (see code.gs in the standalone app).
 */
export async function callFlockAPI(action, params = {}) {
  if (!FLOCK_CRM_CONFIG.apiUrl) throw new Error('Flock API URL not configured')
  const url = new URL(FLOCK_CRM_CONFIG.apiUrl)
  url.searchParams.append('action', action)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      url.searchParams.append(key, typeof value === 'object' ? JSON.stringify(value) : value)
    }
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`API error: ${response.statusText}`)
  return response.json()
}

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
