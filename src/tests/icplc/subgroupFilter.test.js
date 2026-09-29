/**
 * Subgroup exclusion filter — unit tests for fetchParticipants query logic.
 *
 * We test the filter-building logic in isolation by mocking the supabase
 * client and inspecting which chained calls were made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Minimal participant factory ─────────────────────────────────────────────
function p(id, subgroup) {
  return { id, full_name: `P${id}`, subgroup: subgroup ?? null, icplc_participant_tags: [] }
}

// ── Mock supabase builder ───────────────────────────────────────────────────
// Records the chain of calls so we can assert query shape without a real DB.
function makeBuilder(rows = []) {
  const calls = []
  const builder = {
    _calls: calls,
    _rows: rows,
    from() { return this },
    select() { calls.push(['select', ...arguments]); return this },
    eq() { calls.push(['eq', ...arguments]); return this },
    order() { calls.push(['order', ...arguments]); return this },
    or(...args) { calls.push(['or', ...args]); return this },
    in() { calls.push(['in', ...arguments]); return this },
    neq() { calls.push(['neq', ...arguments]); return this },
    then(resolve) {
      resolve({ data: this._rows, error: null })
      return this
    },
  }
  // Make it thenable (so await builder works)
  builder[Symbol.thenPromise] = undefined
  return builder
}

// ── Helper: run the filter logic extracted from fetchParticipants ──────────
// We extract the filter-building logic into a pure function here to unit-test
// without needing the real supabase import.
function applySubgroupFilter(builder, subgroupExclusions) {
  if (subgroupExclusions?.length) {
    for (const sg of subgroupExclusions) {
      const escaped = sg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      builder = builder.or(`subgroup.neq."${escaped}",subgroup.is.null`)
    }
  }
  return builder
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('subgroup exclusion filter — query shape', () => {
  it('no exclusions → no or() calls added', () => {
    const b = makeBuilder()
    applySubgroupFilter(b, [])
    const orCalls = b._calls.filter(c => c[0] === 'or')
    expect(orCalls).toHaveLength(0)
  })

  it('exclude one subgroup → one or() call with neq + is.null', () => {
    const b = makeBuilder()
    applySubgroupFilter(b, ['West Subgroup A'])
    const orCalls = b._calls.filter(c => c[0] === 'or')
    expect(orCalls).toHaveLength(1)
    expect(orCalls[0][1]).toBe('subgroup.neq."West Subgroup A",subgroup.is.null')
  })

  it('exclude two subgroups → two or() calls', () => {
    const b = makeBuilder()
    applySubgroupFilter(b, ['West Subgroup A', 'East Subgroup B'])
    const orCalls = b._calls.filter(c => c[0] === 'or')
    expect(orCalls).toHaveLength(2)
    expect(orCalls[0][1]).toContain('West Subgroup A')
    expect(orCalls[1][1]).toContain('East Subgroup B')
  })

  it('escapes double-quotes in subgroup name', () => {
    const b = makeBuilder()
    applySubgroupFilter(b, ['Group "A"'])
    const orCalls = b._calls.filter(c => c[0] === 'or')
    expect(orCalls[0][1]).toContain('\\"A\\"')
  })

  it('null arm always included so unassigned participants remain visible', () => {
    const b = makeBuilder()
    applySubgroupFilter(b, ['West Subgroup A'])
    const orCalls = b._calls.filter(c => c[0] === 'or')
    expect(orCalls[0][1]).toContain('subgroup.is.null')
  })
})

// ── In-memory filter simulation (what the query would produce) ─────────────
// Simulates the AND semantics of chained or() calls on a local array.
function simulateExclusionFilter(participants, excluded) {
  if (!excluded.length) return participants
  return participants.filter(p => {
    // Each excluded subgroup adds: keep if (subgroup != sg OR subgroup IS NULL)
    // Chained = AND of all those conditions
    return excluded.every(sg => p.subgroup !== sg)
  })
}

describe('subgroup exclusion filter — result semantics', () => {
  const participants = [
    p(1, 'West Subgroup A'),
    p(2, 'West Subgroup A'),
    p(3, 'East Subgroup B'),
    p(4, null),            // no subgroup assigned
    p(5, 'West Subgroup A'),
  ]

  it('no exclusions → all 5 participants visible', () => {
    expect(simulateExclusionFilter(participants, [])).toHaveLength(5)
  })

  it('exclude West Subgroup A → 2 remain (East B + null)', () => {
    const result = simulateExclusionFilter(participants, ['West Subgroup A'])
    expect(result).toHaveLength(2)
    expect(result.every(p => p.subgroup !== 'West Subgroup A')).toBe(true)
  })

  it('NULL-subgroup participant remains visible when hiding named subgroup', () => {
    const result = simulateExclusionFilter(participants, ['West Subgroup A'])
    expect(result.some(p => p.subgroup === null)).toBe(true)
  })

  it('exclude two subgroups → only null-subgroup participant visible', () => {
    const result = simulateExclusionFilter(participants, ['West Subgroup A', 'East Subgroup B'])
    expect(result).toHaveLength(1)
    expect(result[0].subgroup).toBeNull()
  })

  it('toggle subgroup back on (remove from exclusion list) → participants restored', () => {
    const withExclusion = simulateExclusionFilter(participants, ['West Subgroup A'])
    expect(withExclusion).toHaveLength(2)
    const restored = simulateExclusionFilter(participants, [])
    expect(restored).toHaveLength(5)
  })

  it('Clear all (empty exclusion list) → all participants visible', () => {
    const result = simulateExclusionFilter(participants, [])
    expect(result).toHaveLength(5)
  })
})

// ── Composition tests ───────────────────────────────────────────────────────
describe('subgroup filter composes with other filters', () => {
  const participants = [
    { ...p(1, 'West Subgroup A'), participation_status: 'confirmed', registration_link_status: 'registered' },
    { ...p(2, 'East Subgroup B'), participation_status: 'confirmed', registration_link_status: 'not_registered' },
    { ...p(3, 'West Subgroup A'), participation_status: 'tracking', registration_link_status: 'not_registered' },
    { ...p(4, null),             participation_status: 'confirmed', registration_link_status: 'registered' },
  ]

  function applyAll(ps, { excluded = [], participationStatus = null, registrationStatus = null } = {}) {
    let result = simulateExclusionFilter(ps, excluded)
    if (participationStatus) result = result.filter(p => p.participation_status === participationStatus)
    if (registrationStatus) result = result.filter(p => p.registration_link_status === registrationStatus)
    return result
  }

  it('subgroup + participation_status composition', () => {
    const result = applyAll(participants, {
      excluded: ['West Subgroup A'],
      participationStatus: 'confirmed',
    })
    // East B confirmed + null confirmed = 2
    expect(result).toHaveLength(2)
    expect(result.every(p => p.subgroup !== 'West Subgroup A')).toBe(true)
    expect(result.every(p => p.participation_status === 'confirmed')).toBe(true)
  })

  it('subgroup + search composition', () => {
    const withSearch = participants.filter(p =>
      p.full_name.toLowerCase().includes('p2') || p.full_name.toLowerCase().includes('p4')
    )
    const result = simulateExclusionFilter(withSearch, ['West Subgroup A'])
    expect(result).toHaveLength(2) // P2 (East B) + P4 (null)
  })

  it('subgroup + registered composition', () => {
    const result = applyAll(participants, {
      excluded: ['West Subgroup A'],
      registrationStatus: 'registered',
    })
    // Only P4 (null subgroup, registered) — P2 is not_registered
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(4)
  })
})

// ── No stale include-semantics caller ──────────────────────────────────────
describe('no stale include-semantics caller', () => {
  it('filters.subgroup is not passed to q.in() anywhere in useICPLCParticipants', async () => {
    // Read the hook source and assert .in('subgroup', ...) is absent
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/icplc/hooks/useICPLCParticipants.js'),
      'utf-8'
    )
    // Should NOT contain the old include pattern
    expect(src).not.toMatch(/q\.in\('subgroup'/)
    expect(src).not.toMatch(/q\.in\("subgroup"/)
    // Should contain the new exclusion pattern
    expect(src).toMatch(/subgroup\.neq\./)
    expect(src).toMatch(/subgroup\.is\.null/)
  })
})
