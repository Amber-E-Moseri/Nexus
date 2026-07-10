// Central feature flags.
//
// Each flag defaults to a hardcoded value and can be overridden at build time
// via a VITE_* env var (set the env var to the string 'true' or 'false').
//
// Instagram Grading is paused as of 2026-07-09. Flip INSTAGRAM_GRADING_ENABLED
// to true (or set VITE_INSTAGRAM_GRADING_ENABLED=true) to bring it back — this
// re-exposes the /instagram route and the sidebar entry. No data or backend was
// removed; only the UI entry points are gated.

function envFlag(name, defaultValue) {
  const raw = import.meta.env[name]
  if (raw === 'true') return true
  if (raw === 'false') return false
  return defaultValue
}

export const INSTAGRAM_GRADING_ENABLED = envFlag('VITE_INSTAGRAM_GRADING_ENABLED', false)
