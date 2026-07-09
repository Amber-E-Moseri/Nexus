// DEPRECATED: useCalendarSubscriptions Hook
// This hook is DEPRECATED in favor of direct calls to getOrCreateSubscription()
// and related functions from src/features/calendar/lib/calendar.js.
// See SubscriptionManager.jsx for the canonical pattern.
//
// The underlying API function createCalendarSubscription() bypassed the canonical
// generate_ical_token RPC, causing token/subscription mismanagement. The old
// implementation has been removed (it no longer parsed after the deprecation stub
// was added); this stub remains so any stale import fails loudly.

export function useCalendarSubscriptions() {
  throw new Error(
    'useCalendarSubscriptions is deprecated. Use getOrCreateSubscription() from ' +
    'src/features/calendar/lib/calendar.js instead. See SubscriptionManager.jsx for the pattern.'
  );
}

export function useCalendarSubscription() {
  throw new Error(
    'useCalendarSubscription is deprecated. Use getOrCreateSubscription() from ' +
    'src/features/calendar/lib/calendar.js instead. See SubscriptionManager.jsx for the pattern.'
  );
}
