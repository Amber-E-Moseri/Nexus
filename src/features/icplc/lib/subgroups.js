// Canonical ICPLC subgroups. Used by the profile drawer dropdown and the Working List
// filter chips so every subgroup is selectable even before anyone is assigned to it.
export const SUBGROUP_OPTIONS = [
  'BLW Central East Subgroup A', 'BLW Central East Subgroup B',
  'BLW Central Subgroup A', 'BLW Central Subgroup B',
  'BLW West Subgroup A', 'BLW West Subgroup B',
]

/**
 * Group is derived from subgroup (mirrors the icplc_group_from_subgroup DB function):
 * Central East A/B -> "Central East", West A/B -> "West", Central A/B -> "Central".
 */
export function groupForSubgroup(subgroup) {
  const s = String(subgroup || '').toLowerCase()
  if (s.includes('central east')) return 'Central East'
  if (s.includes('west')) return 'West'
  if (s.includes('central')) return 'Central'
  return null
}
