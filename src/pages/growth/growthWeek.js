// Growth Tracking week selection.
//
// The reporting week itself is NOT computed here. It comes from the database
// (growth_reporting_week(), America/Toronto time — migration 20271002000003) so the page,
// SQL view, weekly report/email and ?week= links can never disagree. This module only
// decides WHICH of the already-known weeks the page shows.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value) {
  return typeof value === 'string' && ISO_DATE.test(value)
}

/**
 * Pick the week the Growth page should show.
 *
 * Priority:
 *   1. an explicit ?week= (already a known Monday, or `normalizedExplicit` — the DB's
 *      growth_week_start() of the param — when it is a known Monday);
 *   2. the canonical reporting week from the DB;
 *   3. the newest week that has data (only if the DB value is unavailable/unknown).
 *
 * Never defaults to a week the DB did not designate just because it is the newest row
 * (that newest row is the empty in-progress week after Sunday-night ET).
 */
export function resolveSelectedWeek({ explicit, normalizedExplicit, reportingWeek, allWeeks }) {
  const known = new Set(allWeeks ?? [])
  if (isIsoDate(explicit) && known.has(explicit)) return explicit
  if (isIsoDate(normalizedExplicit) && known.has(normalizedExplicit)) return normalizedExplicit
  if (reportingWeek && known.has(reportingWeek)) return reportingWeek
  const list = allWeeks ?? []
  return list.length ? list[list.length - 1] : null
}
