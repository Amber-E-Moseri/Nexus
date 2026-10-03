// Pure filtering model for the Action workspace (pages/NeedsAttentionPage.jsx).
//
// Subgroup comes from ONE place: icplc_participants.subgroup (free text, via the working list). There is no
// subgroup ID, so comparison is done on a normalized key (trimmed, whitespace-collapsed, lower-cased). The key is
// what goes in the URL and what the predicate compares, so "BLW Central Subgroup A", "blw central  subgroup a "
// and an imported variant all land in one option and one filter result.

export const UNKNOWN_SUBGROUP = '__none__'
export const UNKNOWN_SUBGROUP_LABEL = 'Unknown / No subgroup'

export const FILTER_PARAMS = [
  'q', 'subgroup', 'reason', 'readiness',
  'urgent', 'category', 'participation', 'registration', 'flight', 'risk', 'tag',
]
export const SECONDARY_PARAMS = ['category', 'participation', 'registration', 'flight', 'risk', 'tag']

/** Canonical comparison key for a subgroup string; UNKNOWN_SUBGROUP when blank. */
export function subgroupKey(value) {
  const key = String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return key || UNKNOWN_SUBGROUP
}

/** Display text for a raw subgroup value (trimmed, whitespace-collapsed, original casing). */
export function subgroupDisplay(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * Options built from the rows actually in the Action population. Each is { value: key, label, count }.
 * An "Unknown / No subgroup" option appears only when at least one row genuinely lacks a subgroup.
 */
export function buildSubgroupOptions(rows) {
  const byKey = new Map()
  for (const row of rows || []) {
    const key = row.subgroupKey ?? subgroupKey(row.subgroup)
    const cur = byKey.get(key)
    if (cur) cur.count += 1
    else byKey.set(key, { value: key, label: key === UNKNOWN_SUBGROUP ? UNKNOWN_SUBGROUP_LABEL : subgroupDisplay(row.subgroup), count: 1 })
  }
  const known = [...byKey.values()].filter((o) => o.value !== UNKNOWN_SUBGROUP).sort((a, b) => a.label.localeCompare(b.label))
  return byKey.has(UNKNOWN_SUBGROUP) ? [...known, byKey.get(UNKNOWN_SUBGROUP)] : known
}

function searchHaystack(row, reasonLabel) {
  return [
    row.participant.full_name,
    row.participant.email,
    row.participant.subgroup,
    row.participant.region,
    ...row.keys.map(reasonLabel),
    ...(row.participant.tags || []).map((tag) => tag.name),
  ].filter(Boolean).join(' ').toLowerCase()
}

/** Every filter is ANDed. `reasonLabel(key)` supplies the searchable reason text. */
export function filterActionRows(rows, filters, reasonLabel = (k) => k) {
  const q = (filters.q || '').trim().toLowerCase()
  return (rows || []).filter((row) => (
    (!q || searchHaystack(row, reasonLabel).includes(q))
    && (!filters.subgroup || row.subgroupKey === filters.subgroup)
    && (!filters.reason || row.keys.includes(filters.reason))
    && (!filters.readiness || row.readiness === filters.readiness)
    && (!filters.urgent || row.tier === 0)
    && (!filters.category || row.sections.includes(filters.category))
    && (!filters.participation || row.participation === filters.participation)
    && (!filters.registration || row.registration === filters.registration)
    && (!filters.flight || row.flight === filters.flight)
    && (!filters.risk || row.risk === filters.risk)
    && (!filters.tag || row.tags.some((tag) => tag.name === filters.tag))
  ))
}

/**
 * Summary-card semantics: cards are GLOBAL queue totals, computed with the very same predicate the card applies
 * as a filter, so a card's number always equals the count after clicking it (with no other filters active).
 */
export const SUMMARY_SHORTCUTS = {
  all: { label: 'All Actions', patch: { urgent: '', category: '', reason: '' } },
  urgent: { label: 'Urgent', patch: { urgent: '1', category: '', reason: '' } },
  registration: { label: 'Registration', patch: { urgent: '', category: 'registration', reason: '' } },
  documentation: { label: 'Documentation', patch: { urgent: '', category: 'documentation', reason: '' } },
  travel: { label: 'Travel', patch: { urgent: '', category: 'travel', reason: '' } },
}

export function summaryCounts(rows) {
  const out = {}
  for (const [key, { patch }] of Object.entries(SUMMARY_SHORTCUTS)) {
    out[key] = filterActionRows(rows, { urgent: patch.urgent, category: patch.category }).length
  }
  return out
}

/** Which summary card (if any) the current filters correspond to. */
export function activeShortcut(filters) {
  if (filters.urgent) return 'urgent'
  if (filters.category && SUMMARY_SHORTCUTS[filters.category]) return filters.category
  if (!filters.reason) return 'all'
  return null
}
