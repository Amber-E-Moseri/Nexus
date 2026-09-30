import { track } from '@vercel/analytics'

// Visitor analytics is scoped to the public ICPLC26 page only. Everything else
// (staff workspace, tokenised RSVP/invite URLs) is dropped before it is sent.
const TRACKED_PATH_PREFIXES = ['/icplc26']

export function analyticsBeforeSend(event) {
  try {
    const { pathname } = new URL(event.url)
    return TRACKED_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? event : null
  } catch {
    return null
  }
}

const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign']

// Non-PII only: the event name plus whichever campaign params are in the URL.
export function trackEvent(name) {
  try {
    const params = new URLSearchParams(window.location.search)
    const props = {}
    for (const key of CAMPAIGN_KEYS) {
      const value = params.get(key)
      if (value) props[key] = value.slice(0, 100)
    }
    track(name, props)
  } catch {
    // analytics must never break the page
  }
}
