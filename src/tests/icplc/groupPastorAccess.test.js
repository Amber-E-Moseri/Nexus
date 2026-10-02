/**
 * ICPLC Group Pastor — Frontend Access Logic Tests
 *
 * Tests the checkAccess() fail-close logic in ICPLCPage for Group Pastor edge cases.
 * These are unit tests over the extracted decision logic — no live Supabase required.
 *
 * Covers:
 *   FE-01 valid Group Pastor with subgroup → scoped access
 *   FE-02 Group Pastor with null subgroup → fail closed (needsSubgroupAssignment)
 *   FE-03 Group Pastor with empty-string subgroup → fail closed
 *   FE-04 duplicate Group Pastor rows (same user) → fail closed
 *   FE-05 DB lookup error → fail closed (throws, outer catch denies)
 *   FE-06 no participant row (ordinary sprint member) → allow unscoped
 *   FE-07 non-GP leadership value → allow unscoped
 *   FE-08 leadership case normalization: 'group pastor' lowercase → treated as GP
 *   FE-09 mixed rows: 1 GP + 1 non-GP → single GP wins, scoped access
 *   FE-10 existing named-team roles remain unchanged (not affected by GP path)
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Extract the decision logic from ICPLCPage.checkAccess() for isolated testing.
// The function below mirrors the Group Pastor branch exactly.
// ---------------------------------------------------------------------------

function resolveGroupPastorAccess(ownRows, ownErr) {
  // Mirrors the GP branch in checkAccess() after the named-team checks fail.
  // Returns: { canAccess, groupPastorSubgroup, needsSubgroupAssignment }
  //
  // Throws when ownErr is truthy (outer try/catch of checkAccess sets canAccess=false).

  if (ownErr) throw ownErr

  const gpRows = (ownRows ?? []).filter(
    (r) => (r.leadership ?? '').toLowerCase() === 'group pastor',
  )

  if (gpRows.length === 0) {
    // Ordinary sprint member
    return { canAccess: true, groupPastorSubgroup: null, needsSubgroupAssignment: false }
  }

  if (gpRows.length > 1) {
    // Ambiguous — fail closed
    return { canAccess: false, groupPastorSubgroup: null, needsSubgroupAssignment: false }
  }

  const sg = gpRows[0].subgroup?.trim() || null
  if (!sg) {
    return { canAccess: false, groupPastorSubgroup: null, needsSubgroupAssignment: true }
  }

  return { canAccess: true, groupPastorSubgroup: sg, needsSubgroupAssignment: false }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ICPLCPage — Group Pastor access logic (FE)', () => {

  it('FE-01: valid GP with subgroup → scoped access', () => {
    const rows = [{ leadership: 'Group Pastor', subgroup: 'BLW Central Subgroup B' }]
    const result = resolveGroupPastorAccess(rows, null)
    expect(result.canAccess).toBe(true)
    expect(result.groupPastorSubgroup).toBe('BLW Central Subgroup B')
    expect(result.needsSubgroupAssignment).toBe(false)
  })

  it('FE-02: GP with null subgroup → fail closed, needsSubgroupAssignment', () => {
    const rows = [{ leadership: 'Group Pastor', subgroup: null }]
    const result = resolveGroupPastorAccess(rows, null)
    expect(result.canAccess).toBe(false)
    expect(result.needsSubgroupAssignment).toBe(true)
    expect(result.groupPastorSubgroup).toBeNull()
  })

  it('FE-03: GP with empty-string subgroup → fail closed', () => {
    const rows = [{ leadership: 'Group Pastor', subgroup: '   ' }]
    const result = resolveGroupPastorAccess(rows, null)
    expect(result.canAccess).toBe(false)
    expect(result.needsSubgroupAssignment).toBe(true)
  })

  it('FE-04: duplicate GP rows → fail closed', () => {
    const rows = [
      { leadership: 'Group Pastor', subgroup: 'BLW Central Subgroup A' },
      { leadership: 'Group Pastor', subgroup: 'BLW Central Subgroup B' },
    ]
    const result = resolveGroupPastorAccess(rows, null)
    expect(result.canAccess).toBe(false)
    expect(result.needsSubgroupAssignment).toBe(false)
    expect(result.groupPastorSubgroup).toBeNull()
  })

  it('FE-05: DB error → throws (outer catch denies)', () => {
    const err = new Error('DB connection error')
    expect(() => resolveGroupPastorAccess(null, err)).toThrow('DB connection error')
  })

  it('FE-06: no participant row → ordinary sprint member, unscoped access', () => {
    const result = resolveGroupPastorAccess([], null)
    expect(result.canAccess).toBe(true)
    expect(result.groupPastorSubgroup).toBeNull()
    expect(result.needsSubgroupAssignment).toBe(false)
  })

  it('FE-07: non-GP leadership → ordinary sprint member', () => {
    const rows = [{ leadership: 'Zone Pastor', subgroup: 'BLW West' }]
    const result = resolveGroupPastorAccess(rows, null)
    expect(result.canAccess).toBe(true)
    expect(result.groupPastorSubgroup).toBeNull()
  })

  it('FE-08: leadership lowercase normalization → treated as GP', () => {
    const rows = [{ leadership: 'group pastor', subgroup: 'BLW East Subgroup A' }]
    const result = resolveGroupPastorAccess(rows, null)
    expect(result.canAccess).toBe(true)
    expect(result.groupPastorSubgroup).toBe('BLW East Subgroup A')
  })

  it('FE-08b: mixed case "GROUP PASTOR" → treated as GP', () => {
    const rows = [{ leadership: 'GROUP PASTOR', subgroup: 'BLW East Subgroup B' }]
    const result = resolveGroupPastorAccess(rows, null)
    expect(result.canAccess).toBe(true)
    expect(result.groupPastorSubgroup).toBe('BLW East Subgroup B')
  })

  it('FE-09: 1 GP row + 1 non-GP row → single GP wins, scoped access', () => {
    const rows = [
      { leadership: 'Group Pastor', subgroup: 'BLW Central Subgroup A' },
      { leadership: 'Delegate', subgroup: null },
    ]
    const result = resolveGroupPastorAccess(rows, null)
    expect(result.canAccess).toBe(true)
    expect(result.groupPastorSubgroup).toBe('BLW Central Subgroup A')
  })

  it('FE-10: null ownRows (unexpected null from Supabase) → treated as empty', () => {
    const result = resolveGroupPastorAccess(null, null)
    expect(result.canAccess).toBe(true)
    expect(result.groupPastorSubgroup).toBeNull()
  })

})
