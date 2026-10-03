import { describe, expect, it } from 'vitest'
import {
  activeShortcut, buildSubgroupOptions, filterActionRows, subgroupKey, summaryCounts, UNKNOWN_SUBGROUP,
} from '../../features/icplc/lib/actionFilters.js'
import { pruneToVisible } from '../../features/icplc/lib/bulkSelection.js'

const row = (id, subgroup, extra = {}) => ({
  id, participant: { full_name: id, tags: [] }, subgroup, subgroupKey: subgroupKey(subgroup),
  keys: ['not_registered'], sections: ['registration'], tier: 0, readiness: 'at_risk',
  participation: 'confirmed', registration: 'not_registered', flight: 'x', risk: '', tags: [], ...extra,
})

describe('action filters', () => {
  it('normalizes subgroup case, spacing and blanks', () => {
    expect(subgroupKey('  BLW Central   Subgroup A ')).toBe('blw central subgroup a')
    expect(subgroupKey(null)).toBe(UNKNOWN_SUBGROUP)
    expect(subgroupKey('   ')).toBe(UNKNOWN_SUBGROUP)
  })

  it('options merge variants, count rows and add Unknown last only when needed', () => {
    const rows = [row('a', 'BLW Central Subgroup A'), row('b', 'blw central  subgroup a '), row('c', 'BLW West Subgroup B'), row('d', null)]
    expect(buildSubgroupOptions(rows).map((o) => [o.label, o.count])).toEqual([
      ['BLW Central Subgroup A', 2], ['BLW West Subgroup B', 1], ['Unknown / No subgroup', 1],
    ])
    expect(buildSubgroupOptions(rows.slice(0, 3)).some((o) => o.value === UNKNOWN_SUBGROUP)).toBe(false)
  })

  it('subgroup intersects with every other filter', () => {
    const rows = [
      row('a', 'Central', { registration: 'not_registered', tags: [{ name: 'X' }], keys: ['not_registered', 'passport_incomplete'] }),
      row('b', 'Central', { registration: 'registered' }),
      row('c', 'West', { registration: 'not_registered', tags: [{ name: 'X' }] }),
    ]
    const ids = (f) => filterActionRows(rows, { subgroup: 'central', ...f }).map((r) => r.id)
    expect(ids({})).toEqual(['a', 'b'])
    expect(ids({ registration: 'not_registered' })).toEqual(['a'])
    expect(ids({ reason: 'passport_incomplete' })).toEqual(['a'])
    expect(ids({ tag: 'X' })).toEqual(['a'])
    expect(ids({ q: 'b' })).toEqual(['b'])
  })

  it('summary counts equal the result of applying each card as a filter', () => {
    const rows = [row('a', 'C'), row('b', 'C', { tier: 1, keys: ['passport_incomplete'], sections: ['documentation'] }), row('c', 'C', { tier: 1, keys: ['travel_incomplete'], sections: ['travel'] })]
    expect(summaryCounts(rows)).toEqual({ all: 3, urgent: 1, registration: 1, documentation: 1, travel: 1 })
    expect(filterActionRows(rows, { category: 'travel' }).map((r) => r.id)).toEqual(['c'])
    expect(activeShortcut({ category: 'travel' })).toBe('travel')
    expect(activeShortcut({ urgent: '1' })).toBe('urgent')
    expect(activeShortcut({})).toBe('all')
  })

  it('selection can never include a row that left the filtered result', () => {
    const selected = new Set(['a', 'b', 'c'])
    const shown = filterActionRows([row('a', 'C'), row('b', 'C'), row('c', 'W')], { subgroup: 'c' })
    expect([...pruneToVisible(selected, shown)]).toEqual(['a', 'b'])
  })
})
