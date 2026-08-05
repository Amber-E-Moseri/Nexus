/**
 * org_chart_nodes + org_chart_edges — RLS policy-logic tests.
 *
 * Policy-logic assertion tests, not live Postgres integration tests — same
 * approach as tests/ideaBankRls.test.js.
 *
 * Migrations read (chronological; only two migrations touch these tables):
 *   20270801000000_org_chart_content_tables.sql  — ← CURRENT and ONLY policy source
 *                                                   (creates tables + all RLS policies)
 *   20270801000001_org_chart_seed_content.sql    — data seed only, no policy changes
 *
 * Org-chart visibility question (open during Nova KB spot-check) — RESOLVED:
 *   The SELECT policy is `for select using (auth.uid() is not null)`, which
 *   means ANY authenticated user can read org chart data, regardless of role
 *   or department. There is NO per-department or per-role restriction on reads.
 *   Write (INSERT/UPDATE/DELETE) is restricted to super_admin or regional_secretary
 *   using public.is_super_admin() or current_user_role() = 'regional_secretary'.
 *
 * The corresponding Nova KB entry ('org-chart' slug,
 * 20270807000007_nova_kb_seed.sql) was updated to reflect this confirmed answer.
 *
 * Effective-policy summary:
 *   org_chart_nodes_select / org_chart_edges_select:
 *     auth.uid() IS NOT NULL — any authenticated user
 *   INSERT/UPDATE/DELETE:
 *     is_super_admin() OR current_user_role() = 'regional_secretary'
 */

import { describe, it, expect } from 'vitest'

// Mirrors: org_chart_nodes_select / org_chart_edges_select USING clause
function orgChartSelect({ isAuthenticated }) {
  return isAuthenticated
}

// Mirrors: org_chart_nodes_insert / org_chart_edges_insert WITH CHECK clause
// (and update/delete USING clause — same predicate for all write operations)
function orgChartWrite({ userRole }) {
  // is_super_admin() internally checks role = 'super_admin'
  return userRole === 'super_admin' || userRole === 'regional_secretary'
}

describe('org_chart_nodes RLS policy logic (20270801000000)', () => {
  it('allows any authenticated user to read org chart nodes (org-wide read, confirmed)', () => {
    expect(orgChartSelect({ isAuthenticated: true })).toBe(true)
  })

  it('denies unauthenticated access to org chart nodes', () => {
    expect(orgChartSelect({ isAuthenticated: false })).toBe(false)
  })

  it('allows a plain member to read org chart nodes (no role restriction on SELECT)', () => {
    // Confirmed: the SELECT policy is purely auth.uid() IS NOT NULL — no role check
    const memberIsAuthenticated = true
    expect(orgChartSelect({ isAuthenticated: memberIsAuthenticated })).toBe(true)
  })

  it('allows a pastor to read org chart nodes', () => {
    expect(orgChartSelect({ isAuthenticated: true })).toBe(true)
  })

  it('allows super_admin to write (insert/update/delete) org chart nodes', () => {
    expect(orgChartWrite({ userRole: 'super_admin' })).toBe(true)
  })

  it('allows regional_secretary to write org chart nodes', () => {
    expect(orgChartWrite({ userRole: 'regional_secretary' })).toBe(true)
  })

  it('denies a dept_lead from writing org chart nodes', () => {
    expect(orgChartWrite({ userRole: 'dept_lead' })).toBe(false)
  })

  it('denies a plain member from writing org chart nodes', () => {
    expect(orgChartWrite({ userRole: 'member' })).toBe(false)
  })

  it('denies a pastor from writing org chart nodes', () => {
    expect(orgChartWrite({ userRole: 'pastor' })).toBe(false)
  })
})

describe('org_chart_edges RLS policy logic (20270801000000)', () => {
  it('allows any authenticated user to read org chart edges', () => {
    expect(orgChartSelect({ isAuthenticated: true })).toBe(true)
  })

  it('denies unauthenticated access to org chart edges', () => {
    expect(orgChartSelect({ isAuthenticated: false })).toBe(false)
  })

  it('allows super_admin to write org chart edges', () => {
    expect(orgChartWrite({ userRole: 'super_admin' })).toBe(true)
  })

  it('allows regional_secretary to write org chart edges', () => {
    expect(orgChartWrite({ userRole: 'regional_secretary' })).toBe(true)
  })

  it('denies a dept_lead from writing org chart edges', () => {
    expect(orgChartWrite({ userRole: 'dept_lead' })).toBe(false)
  })

  it('denies a plain member from writing org chart edges', () => {
    expect(orgChartWrite({ userRole: 'member' })).toBe(false)
  })
})

describe('org-chart visibility answer (resolves open question from Nova KB spot-check)', () => {
  it('confirms org chart data is visible to ALL authenticated users (no dept or role restriction)', () => {
    // Verified by reading 20270801000000_org_chart_content_tables.sql directly.
    // The SELECT USING clause is: auth.uid() is not null
    // There is no department_id column on these tables, no role check.
    const roles = ['super_admin', 'regional_secretary', 'dept_lead', 'pastor', 'member', 'group_member']
    roles.forEach(role => {
      // Any authenticated user regardless of role can read
      expect(orgChartSelect({ isAuthenticated: true })).toBe(true)
    })
  })

  it('confirms only super_admin and regional_secretary can edit org chart content', () => {
    expect(orgChartWrite({ userRole: 'super_admin' })).toBe(true)
    expect(orgChartWrite({ userRole: 'regional_secretary' })).toBe(true)
    expect(orgChartWrite({ userRole: 'dept_lead' })).toBe(false)
    expect(orgChartWrite({ userRole: 'pastor' })).toBe(false)
    expect(orgChartWrite({ userRole: 'member' })).toBe(false)
  })
})
