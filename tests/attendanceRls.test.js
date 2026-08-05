/**
 * attendance_groups / attendance_members / attendance_records — RLS policy-logic tests.
 *
 * Policy-logic assertion tests, not live Postgres integration tests — same
 * approach as tests/ideaBankRls.test.js.
 *
 * NOTE: These three tables belong to the Attendance Trends system
 * (attendance tracking against subgroups/groups/roles). They are distinct
 * from public.meetings / public.meeting_attendance, which track department
 * meeting OS records. The table names avoid collision by design —
 * see the comment at the top of 20260718000000_attendance_trends.sql.
 *
 * Migrations read (chronological; only one migration touches these tables):
 *   20260718000000_attendance_trends.sql  — ← CURRENT and ONLY policy source
 *                                           (creates tables + all RLS policies)
 *   20260724000001_fix_get_subgroup_ranking_rpc.sql — RPC fix only, no policy changes
 *
 * Effective-policy summary (all three tables share the same pattern):
 *   SELECT: auth.role() = 'authenticated'   — any logged-in user can read
 *   INSERT/UPDATE/DELETE: auth.jwt() ->> 'user_role' IN ('super_admin', 'dept_lead')
 *
 * Coordination note: attendance_records, attendance_groups, and attendance_members
 * are written as one file because they share identical RLS logic and are tightly
 * coupled in queries (records reference members, members reference groups). Testing
 * them together makes that relationship explicit.
 *
 * Org-chart visibility analogy: same open-read / restricted-write pattern as
 * org_chart_nodes/edges — any authenticated user can see the data, only admins
 * can modify it.
 */

import { describe, it, expect } from 'vitest'

// Mirrors: SELECT policy USING clause for attendance_groups, attendance_members,
// and attendance_records (identical predicate for all three tables).
function attendanceSelect({ isAuthenticated }) {
  return isAuthenticated
}

// Mirrors: ALL (INSERT/UPDATE/DELETE) policy USING + WITH CHECK clauses.
// Uses raw JWT claim (auth.jwt() ->> 'user_role'), not current_user_role() helper.
function attendanceWrite({ jwtUserRole }) {
  return ['super_admin', 'dept_lead'].includes(jwtUserRole)
}

describe('attendance_groups RLS policy logic (20260718000000)', () => {
  it('allows any authenticated user to read attendance groups', () => {
    expect(attendanceSelect({ isAuthenticated: true })).toBe(true)
  })

  it('denies unauthenticated access to attendance groups', () => {
    expect(attendanceSelect({ isAuthenticated: false })).toBe(false)
  })

  it('allows super_admin to write attendance groups', () => {
    expect(attendanceWrite({ jwtUserRole: 'super_admin' })).toBe(true)
  })

  it('allows dept_lead to write attendance groups', () => {
    expect(attendanceWrite({ jwtUserRole: 'dept_lead' })).toBe(true)
  })

  it('denies a plain member from writing attendance groups', () => {
    expect(attendanceWrite({ jwtUserRole: 'member' })).toBe(false)
  })

  it('denies a pastor from writing attendance groups', () => {
    expect(attendanceWrite({ jwtUserRole: 'pastor' })).toBe(false)
  })

  it('denies regional_secretary from writing attendance groups (not in the write policy)', () => {
    // Note: regional_secretary is NOT in the attendance write policy — only
    // super_admin and dept_lead are. This differs from most other tables
    // where regional_secretary shares the super_admin bypass.
    expect(attendanceWrite({ jwtUserRole: 'regional_secretary' })).toBe(false)
  })
})

describe('attendance_members RLS policy logic (20260718000000)', () => {
  it('allows any authenticated user to read attendance members', () => {
    expect(attendanceSelect({ isAuthenticated: true })).toBe(true)
  })

  it('denies unauthenticated access to attendance members', () => {
    expect(attendanceSelect({ isAuthenticated: false })).toBe(false)
  })

  it('allows super_admin to write attendance members', () => {
    expect(attendanceWrite({ jwtUserRole: 'super_admin' })).toBe(true)
  })

  it('denies a regular member from writing attendance members', () => {
    expect(attendanceWrite({ jwtUserRole: 'member' })).toBe(false)
  })
})

describe('attendance_records RLS policy logic (20260718000000)', () => {
  it('allows any authenticated user to read attendance records', () => {
    expect(attendanceSelect({ isAuthenticated: true })).toBe(true)
  })

  it('denies unauthenticated access to attendance records', () => {
    expect(attendanceSelect({ isAuthenticated: false })).toBe(false)
  })

  it('allows super_admin to write attendance records', () => {
    expect(attendanceWrite({ jwtUserRole: 'super_admin' })).toBe(true)
  })

  it('allows dept_lead to record attendance', () => {
    expect(attendanceWrite({ jwtUserRole: 'dept_lead' })).toBe(true)
  })

  it('denies a plain member from writing attendance records', () => {
    expect(attendanceWrite({ jwtUserRole: 'member' })).toBe(false)
  })
})

describe('attendance data model coordination note', () => {
  // These aren't RLS tests — they document the referential structure so a future
  // maintainer understands why the three tables are tested together.
  it('documents that records reference members (meeting_id, member_id composite unique)', () => {
    const exampleRecord = { meeting_id: 'mtg-1', member_id: 'mbr-1', status: 'present' }
    expect(exampleRecord.meeting_id).toBeTruthy()
    expect(exampleRecord.member_id).toBeTruthy()
    // Valid status values for attendance_records
    const validStatuses = ['present', 'absent', 'late', 'excused']
    expect(validStatuses).toContain(exampleRecord.status)
  })

  it('documents that members reference groups (group_id FK, no required subgroup)', () => {
    const exampleMember = { role: 'cell_leader', group_id: 'grp-1', subgroup_id: null }
    const validRoles = ['cell_leader', 'bsc_teacher', 'coordinator', 'leader_in_training', 'leader']
    expect(validRoles).toContain(exampleMember.role)
  })
})
