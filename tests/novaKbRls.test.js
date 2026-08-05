/**
 * Nova knowledge base — RLS policy-logic test (nova_kb_read / nova_kb_write).
 *
 * Policy-logic assertion test, not a live Postgres integration test — same
 * approach as tests/ideaBankRls.test.js, the established precedent for this
 * repo (no harness exercises RLS against a live/local Postgres instance).
 * Re-implements the exact boolean predicates from the policies in
 * supabase/migrations/20270807000006_nova_knowledge_base.sql and asserts
 * they evaluate correctly for the cases called out in the build prompt's
 * acceptance criteria:
 *   - a `member`-role account cannot read a KB entry tagged only for
 *     super_admin/regional_secretary
 *   - archived/needs_review entries are invisible via the read-only policy
 *   - dept_lead+ can write, plain members cannot
 *   - nova_query_log rows are visible only to their own author, plus
 *     super_admin/regional_secretary (the two Nova review roles)
 */

import { describe, it, expect } from 'vitest'

// Mirrors: nova_kb_read USING clause.
function canReadKbEntry({ userRole, entryStatus, applicableRoles }) {
  return entryStatus === 'active' && applicableRoles.includes(userRole)
}

// Mirrors: nova_kb_write USING clause (applies to insert/update/delete, and
// — since it's a `for all` policy — also OR's into SELECT visibility).
function canWriteKbEntry({ userRole }) {
  return ['super_admin', 'regional_secretary', 'dept_lead'].includes(userRole)
}

// Mirrors: nova_log_own_select USING clause.
function canSelectQueryLog({ userRole, userId, logOwnerId }) {
  return userId === logOwnerId || ['super_admin', 'regional_secretary'].includes(userRole)
}

// Mirrors: nova_log_insert WITH CHECK clause.
function canInsertQueryLog({ userId, insertedUserId }) {
  return userId === insertedUserId
}

describe('nova_kb_read RLS policy logic', () => {
  it('denies a member-role account reading an entry tagged only for admin roles', () => {
    const allowed = canReadKbEntry({
      userRole: 'member',
      entryStatus: 'active',
      applicableRoles: ['super_admin', 'regional_secretary'],
    })
    expect(allowed).toBe(false)
  })

  it('allows a member-role account reading an entry that includes member in applicable_roles', () => {
    const allowed = canReadKbEntry({
      userRole: 'member',
      entryStatus: 'active',
      applicableRoles: ['super_admin', 'regional_secretary', 'dept_lead', 'pastor', 'member'],
    })
    expect(allowed).toBe(true)
  })

  it('denies reading a needs_review entry even if the role matches, via the read-only policy', () => {
    const allowed = canReadKbEntry({
      userRole: 'member',
      entryStatus: 'needs_review',
      applicableRoles: ['member'],
    })
    expect(allowed).toBe(false)
  })

  it('denies reading an archived entry even if the role matches, via the read-only policy', () => {
    const allowed = canReadKbEntry({
      userRole: 'super_admin',
      entryStatus: 'archived',
      applicableRoles: ['super_admin'],
    })
    expect(allowed).toBe(false)
  })

  it('never lets a member see super_admin-only content even under a pastor tag set', () => {
    const allowed = canReadKbEntry({
      userRole: 'member',
      entryStatus: 'active',
      applicableRoles: ['super_admin', 'regional_secretary', 'pastor'],
    })
    expect(allowed).toBe(false)
  })
})

describe('nova_kb_write RLS policy logic', () => {
  it('allows dept_lead to write KB entries', () => {
    expect(canWriteKbEntry({ userRole: 'dept_lead' })).toBe(true)
  })

  it('allows super_admin and regional_secretary to write KB entries', () => {
    expect(canWriteKbEntry({ userRole: 'super_admin' })).toBe(true)
    expect(canWriteKbEntry({ userRole: 'regional_secretary' })).toBe(true)
  })

  it('denies plain member and pastor roles from writing KB entries', () => {
    expect(canWriteKbEntry({ userRole: 'member' })).toBe(false)
    expect(canWriteKbEntry({ userRole: 'pastor' })).toBe(false)
  })

  it('lets a dept_lead see a needs_review/archived row via the write policy\'s OR\'d SELECT visibility even though nova_kb_read alone would deny it', () => {
    // Postgres OR's multiple permissive policies for the same command — a
    // dept_lead can SELECT via nova_kb_write even when nova_kb_read denies
    // (status != 'active'). This is why the NovaReview admin queue can see
    // stale/needs_review rows without a separate policy.
    const deniedByReadPolicy = canReadKbEntry({ userRole: 'dept_lead', entryStatus: 'needs_review', applicableRoles: ['dept_lead'] })
    const allowedByWritePolicy = canWriteKbEntry({ userRole: 'dept_lead' })
    expect(deniedByReadPolicy).toBe(false)
    expect(allowedByWritePolicy).toBe(true)
  })
})

describe('nova_query_log RLS policy logic', () => {
  it('lets a user select only their own query log rows', () => {
    const allowed = canSelectQueryLog({ userRole: 'member', userId: 'user-A', logOwnerId: 'user-A' })
    expect(allowed).toBe(true)
  })

  it('denies a member selecting another user\'s query log row', () => {
    const allowed = canSelectQueryLog({ userRole: 'member', userId: 'user-A', logOwnerId: 'user-B' })
    expect(allowed).toBe(false)
  })

  it('allows super_admin and regional_secretary to select any user\'s query log row (Nova review view)', () => {
    expect(canSelectQueryLog({ userRole: 'super_admin', userId: 'admin-1', logOwnerId: 'user-B' })).toBe(true)
    expect(canSelectQueryLog({ userRole: 'regional_secretary', userId: 'rs-1', logOwnerId: 'user-B' })).toBe(true)
  })

  it('denies a dept_lead selecting another user\'s query log row — only super_admin/regional_secretary get cross-user visibility', () => {
    const allowed = canSelectQueryLog({ userRole: 'dept_lead', userId: 'lead-1', logOwnerId: 'user-B' })
    expect(allowed).toBe(false)
  })

  it('only allows inserting a query log row under the caller\'s own user_id', () => {
    expect(canInsertQueryLog({ userId: 'user-A', insertedUserId: 'user-A' })).toBe(true)
    expect(canInsertQueryLog({ userId: 'user-A', insertedUserId: 'user-B' })).toBe(false)
  })
})
