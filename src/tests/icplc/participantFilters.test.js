import { describe, it, expect } from 'vitest'
import { applyClientFilters, matchesTags, UNTAGGED } from '../../features/icplc/lib/participantFilters.js'

const tag = (name) => ({ id: name, name, color: '#000' })
const mk = (over = {}) => ({ id: 'x', participation_status: 'confirmed', passport_readiness: 'ready', visa_requirement: 'review', tags: [], ...over })

describe('matchesTags', () => {
  const p = mk({ tags: [tag('Finances'), tag('School')] })
  it('no selection matches everyone', () => expect(matchesTags(p, [], 'any')).toBe(true))
  it('any: at least one tag', () => {
    expect(matchesTags(p, ['School', 'Work'], 'any')).toBe(true)
    expect(matchesTags(p, ['Work'], 'any')).toBe(false)
  })
  it('all: every selected tag', () => {
    expect(matchesTags(p, ['School', 'Finances'], 'all')).toBe(true)
    expect(matchesTags(p, ['School', 'Work'], 'all')).toBe(false)
  })
  it('untagged matches only participants with no tags', () => {
    expect(matchesTags(mk(), [UNTAGGED], 'any')).toBe(true)
    expect(matchesTags(p, [UNTAGGED], 'any')).toBe(false)
    expect(matchesTags(p, [UNTAGGED, 'School'], 'any')).toBe(true)
  })
})

describe('applyClientFilters', () => {
  it('filters by effective visa requirement (ECOWAS default counts as not_required)', () => {
    const amber = mk({ id: 'a', source_values: { cmp_documentation: { passport_region: 'ECOWAS' } } })
    const other = mk({ id: 'b', passport_country: 'Kenya' })
    const rows = applyClientFilters([amber, other], { visa_requirement: ['not_required'] })
    expect(rows.map((r) => r.id)).toEqual(['a'])
  })
  it('combines filters with AND', () => {
    const a = mk({ id: 'a', tags: [tag('School')], passport_country: 'Ghana' })
    const b = mk({ id: 'b', tags: [tag('School')], passport_country: 'Kenya' })
    const rows = applyClientFilters([a, b], { tags: ['School'], visa_requirement: ['review'] })
    expect(rows.map((r) => r.id)).toEqual(['b'])
  })
  it('empty filters return everything', () => {
    expect(applyClientFilters([mk(), mk()], {})).toHaveLength(2)
  })
})
