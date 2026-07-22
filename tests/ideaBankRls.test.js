/**
 * Idea Bank — RLS policy-logic test (idea_bank_items_select).
 *
 * This is a policy-logic assertion test, not a real Postgres integration
 * test — the repo has no existing harness that exercises RLS against a
 * live/local Postgres instance (the closest precedent,
 * src/tests/null_department_superadmin.test.js, follows the same
 * documentation-style approach). It re-implements the exact boolean
 * predicate from the "idea_bank_items_select" policy in
 * supabase/migrations/20270721000000_idea_bank_items.sql and asserts it
 * evaluates correctly for the cases called out in the feature spec:
 *   - a member outside the idea's space cannot select it
 *   - an idea with space_id IS NULL is visible to everyone
 */

import { describe, it, expect } from 'vitest'

// Mirrors: idea_bank_items_select USING clause.
function canSelect({ userRole, userDepartmentId, ideaSpaceId }) {
  return (
    userRole === 'super_admin'
    || userRole === 'regional_secretary'
    || userDepartmentId === ideaSpaceId
    || ideaSpaceId === null
  )
}

describe('idea_bank_items_select RLS policy logic', () => {
  it('denies a member of a different department from selecting a space-scoped idea', () => {
    const allowed = canSelect({ userRole: 'member', userDepartmentId: 'dept-A', ideaSpaceId: 'dept-B' })
    expect(allowed).toBe(false)
  })

  it('allows a member of the matching department to select the idea', () => {
    const allowed = canSelect({ userRole: 'member', userDepartmentId: 'dept-A', ideaSpaceId: 'dept-A' })
    expect(allowed).toBe(true)
  })

  it('allows any member to select an idea with space_id IS NULL', () => {
    const allowed = canSelect({ userRole: 'member', userDepartmentId: 'dept-A', ideaSpaceId: null })
    expect(allowed).toBe(true)
  })

  it('allows super_admin to select ideas from any department', () => {
    const allowed = canSelect({ userRole: 'super_admin', userDepartmentId: 'dept-A', ideaSpaceId: 'dept-B' })
    expect(allowed).toBe(true)
  })

  it('allows regional_secretary to select ideas from any department', () => {
    const allowed = canSelect({ userRole: 'regional_secretary', userDepartmentId: 'dept-A', ideaSpaceId: 'dept-B' })
    expect(allowed).toBe(true)
  })
})
