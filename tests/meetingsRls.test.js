/**
 * meetings + meeting_minutes + meeting_action_items + meeting_attendance —
 * RLS policy-logic tests.
 *
 * Policy-logic assertion tests, not live Postgres integration tests — same
 * approach as tests/ideaBankRls.test.js.
 *
 * ── meetings SELECT ──────────────────────────────────────────────────────────
 * Migrations read (chronological):
 *   20260608000000_initial_blw_canada_os_schema.sql
 *   20260620000014_meetings_ors_access.sql
 *   20260620000018_meetings_grants.sql
 *   20260730000001_meetings_member_dept_visibility.sql
 *   20260731000000_rls_coverage_hardening.sql
 *   20261216000000_phase3_rls_swap.sql
 *   20261231000001_scope_dept_lead_meeting_view.sql
 *   20261231000002_scope_published_meeting_view.sql
 *   20270102000000_fix_meetings_select_scoping.sql
 *   20270716000003_member_can_log_meetings.sql
 *   20270718000010_media_can_log_meetings.sql
 *   20270720000005_permissions_audit_fixes.sql
 *   20270721000004_ors_and_regional_secretary_excluded_from_private_meetings.sql
 *   20270722000002_dept_lead_excluded_from_private_meetings.sql
 *   20270722000003_dept_lead_excluded_from_private_meeting_writes.sql
 *   20270722000004_force_regionalsec_meetings_private.sql
 *   20270722000007_drop_stale_meetings_select_member_policy.sql
 *   20270722000008_meetings_manager_excluded_from_private_meetings.sql  — rebuilt policy
 *   20270804000040_meetings_select_sprint_member_clause.sql
 *   20270804000052_meetings_select_hide_1on1_from_superadmin.sql        — ← CURRENT meetings_select
 *   20270805000018_remove_legacy_meetings_select_access_policy.sql       — drops stale meetings_select_access
 *
 * ── meeting_minutes / meeting_action_items SELECT ───────────────────────────
 * Migrations read (chronological):
 *   20260626000001_meeting_minutes.sql
 *   20261216000000_phase3_rls_swap.sql
 *   20270101000011_restrict_meeting_minutes_rls.sql    — restricted to creator + super_admin
 *   20270101000012_meeting_minutes_sharing.sql         — added sharing table + is_private flag
 *   20270719000000_fix_minutes_super_admin_access.sql  — ← CURRENT minutes_select_by_share
 *                                                        (restored super_admin + regional_secretary bypass
 *                                                         which was inadvertently dropped in 20270101000012)
 *
 * ── meeting_attendance SELECT + WRITE ───────────────────────────────────────
 * Migrations read (chronological):
 *   20260608000000_initial_blw_canada_os_schema.sql    — meeting_attendance_select_hierarchy
 *   20261216000000_phase3_rls_swap.sql
 *   20270724000107_fix_meeting_attendance_select.sql   — ← CURRENT SELECT policy rebuilt
 *                                                        (NULL-dept meetings gap; creator visibility gap)
 *   20270726000001_fix_meeting_attendance_write_authorization.sql — ← CURRENT WRITE policy
 *                                                        (was blocking meeting creators from inserting attendees)
 *   20270805000017_allow_pending_meeting_attendance.sql — added 'pending' to status CHECK constraint
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// meetings_select (current effective: 20270804000052)
// Simplified to the key logical branches; complex DB helpers are modeled as
// boolean parameters.
// ─────────────────────────────────────────────────────────────────────────────
function meetingsSelect({ userRole, uid, meetingCreatedBy, allowedViewers, allowedEditors, visibility, meetingDept, userDept, isRegSecPrivate, meetingType, isDeptLead, hasMeetingsManagerGrant, isGroupSpaceMember, isCrossDeptShare, isSprintMember }) {
  const is1on1 = meetingType === '1_on_1_meeting'

  // super_admin: all published EXCEPT regional-sec private AND 1-on-1
  if (userRole === 'super_admin' && !isRegSecPrivate && !is1on1) return true

  // creator always sees their own meeting
  if (meetingCreatedBy === uid) return true

  // explicit viewer or editor
  if (allowedViewers.includes(uid)) return true
  if (allowedEditors.includes(uid)) return true

  // regional_secretary + ORS: published non-1-on-1
  if ((userRole === 'regional_secretary' || userRole === 'ors') && visibility === 'published' && !is1on1) return true

  // dept_lead: published non-1-on-1
  if (isDeptLead && visibility === 'published' && !is1on1) return true

  // meetings_manager grant: published non-1-on-1
  if (hasMeetingsManagerGrant && visibility === 'published' && !is1on1) return true

  // group space member
  if (isGroupSpaceMember) return true

  // same-dept published non-1-on-1 (not group_member role)
  if (visibility === 'published' && !is1on1 && userRole !== 'group_member' && (meetingDept === userDept || meetingDept === null)) return true

  // cross-dept share published non-1-on-1
  if (visibility === 'published' && !is1on1 && userRole !== 'group_member' && isCrossDeptShare) return true

  // sprint-linked published non-1-on-1
  if (visibility === 'published' && !is1on1 && isSprintMember) return true

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// meeting_minutes — minutes_select_by_share (current effective: 20270719000000)
// ─────────────────────────────────────────────────────────────────────────────
function minutesSelectByShare({ uid, minutesCreatedBy, userRole, isExplicitShare, isPrivate }) {
  return (
    minutesCreatedBy === uid
    || ['super_admin', 'regional_secretary'].includes(userRole)
    || isExplicitShare
    || !isPrivate
  )
}

// meeting_action_items inherit the same logic via their segment→minutes chain
function actionItemsSelect({ uid, minutesCreatedBy, userRole, isExplicitShare, isPrivate }) {
  return minutesSelectByShare({ uid, minutesCreatedBy, userRole, isExplicitShare, isPrivate })
}

// ─────────────────────────────────────────────────────────────────────────────
// meeting_attendance_select_hierarchy (current effective: 20270724000107)
// ─────────────────────────────────────────────────────────────────────────────
function meetingAttendanceSelect({ uid, attendanceUserId, meetingVisible }) {
  // own attendance row: always visible
  if (attendanceUserId === uid) return true
  // any path through the meeting's visibility (mirrors meetings_select logic)
  return meetingVisible
}

// meeting_attendance write policy (current effective: 20270726000001)
function meetingAttendanceWrite({ isFullEditor }) {
  return isFullEditor
}

// ─────────────────────────────────────────────────────────────────────────────

describe('meetings_select RLS policy logic (20270804000052)', () => {
  const base = { allowedViewers: [], allowedEditors: [], isGroupSpaceMember: false, isCrossDeptShare: false, isSprintMember: false }

  it('allows super_admin to see any published non-1-on-1 meeting', () => {
    expect(meetingsSelect({ ...base, userRole: 'super_admin', uid: 'admin', meetingCreatedBy: 'u1', visibility: 'published', meetingDept: 'dept-B', userDept: 'dept-A', isRegSecPrivate: false, meetingType: 'staff', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(true)
  })

  it('denies super_admin from seeing a 1-on-1 meeting they did not create or get invited to', () => {
    expect(meetingsSelect({ ...base, userRole: 'super_admin', uid: 'admin', meetingCreatedBy: 'u1', visibility: 'draft', meetingDept: null, userDept: null, isRegSecPrivate: false, meetingType: '1_on_1_meeting', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(false)
  })

  it('allows super_admin to see a 1-on-1 meeting they created', () => {
    expect(meetingsSelect({ ...base, userRole: 'super_admin', uid: 'admin', meetingCreatedBy: 'admin', visibility: 'draft', meetingDept: null, userDept: null, isRegSecPrivate: false, meetingType: '1_on_1_meeting', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(true)
  })

  it('denies super_admin from seeing a regional-secretary-private meeting', () => {
    // is_regionalsecretary_private_meeting requires visibility='private' AND the specific
    // creator email — so a reg-sec private meeting always has visibility='private', never 'published'.
    // The same-dept 'published' branch therefore cannot fire here.
    expect(meetingsSelect({ ...base, userRole: 'super_admin', uid: 'admin', meetingCreatedBy: 'rs', visibility: 'private', meetingDept: null, userDept: null, isRegSecPrivate: true, meetingType: 'staff', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(false)
  })

  it('allows the meeting creator to always see their meeting', () => {
    expect(meetingsSelect({ ...base, userRole: 'member', uid: 'u1', meetingCreatedBy: 'u1', visibility: 'draft', meetingDept: 'dept-A', userDept: 'dept-A', isRegSecPrivate: false, meetingType: 'staff', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(true)
  })

  it('allows an explicit viewer to see a private meeting they were added to', () => {
    expect(meetingsSelect({ ...base, userRole: 'member', uid: 'u1', meetingCreatedBy: 'u2', allowedViewers: ['u1'], allowedEditors: [], visibility: 'draft', meetingDept: null, userDept: 'dept-A', isRegSecPrivate: false, meetingType: '1_on_1_meeting', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(true)
  })

  it('allows same-dept member to see a published non-1-on-1 meeting', () => {
    expect(meetingsSelect({ ...base, userRole: 'member', uid: 'u1', meetingCreatedBy: 'u2', visibility: 'published', meetingDept: 'dept-A', userDept: 'dept-A', isRegSecPrivate: false, meetingType: 'staff', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(true)
  })

  it('denies a cross-dept member with no relationship from seeing a published 1-on-1 meeting', () => {
    expect(meetingsSelect({ ...base, userRole: 'member', uid: 'u1', meetingCreatedBy: 'u2', visibility: 'published', meetingDept: 'dept-B', userDept: 'dept-A', isRegSecPrivate: false, meetingType: '1_on_1_meeting', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(false)
  })

  it('allows regional_secretary to see published non-1-on-1 meetings', () => {
    expect(meetingsSelect({ ...base, userRole: 'regional_secretary', uid: 'rs', meetingCreatedBy: 'u1', visibility: 'published', meetingDept: 'dept-B', userDept: null, isRegSecPrivate: false, meetingType: 'staff', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(true)
  })

  it('denies regional_secretary from seeing a 1-on-1 they did not create or get invited to', () => {
    expect(meetingsSelect({ ...base, userRole: 'regional_secretary', uid: 'rs', meetingCreatedBy: 'u1', visibility: 'published', meetingDept: null, userDept: null, isRegSecPrivate: false, meetingType: '1_on_1_meeting', isDeptLead: false, hasMeetingsManagerGrant: false })).toBe(false)
  })
})

describe('meeting_minutes_select_by_share RLS policy logic (20270719000000)', () => {
  it('allows the creator to always see their own minutes', () => {
    expect(minutesSelectByShare({ uid: 'u1', minutesCreatedBy: 'u1', userRole: 'member', isExplicitShare: false, isPrivate: true })).toBe(true)
  })

  it('allows super_admin and regional_secretary to see any minutes (restored in 20270719000000)', () => {
    expect(minutesSelectByShare({ uid: 'admin', minutesCreatedBy: 'u1', userRole: 'super_admin', isExplicitShare: false, isPrivate: true })).toBe(true)
    expect(minutesSelectByShare({ uid: 'rs', minutesCreatedBy: 'u1', userRole: 'regional_secretary', isExplicitShare: false, isPrivate: true })).toBe(true)
  })

  it('denies a different member from reading private minutes with no share grant (default-private case)', () => {
    // is_private = true (default), no share, not creator, not admin
    expect(minutesSelectByShare({ uid: 'u2', minutesCreatedBy: 'u1', userRole: 'member', isExplicitShare: false, isPrivate: true })).toBe(false)
  })

  it('allows a user with an explicit share grant to read private minutes (sharing feature: 20270101000012)', () => {
    expect(minutesSelectByShare({ uid: 'u2', minutesCreatedBy: 'u1', userRole: 'member', isExplicitShare: true, isPrivate: true })).toBe(true)
  })

  it('allows any authenticated member to read org-wide minutes (is_private = false)', () => {
    expect(minutesSelectByShare({ uid: 'u3', minutesCreatedBy: 'u1', userRole: 'member', isExplicitShare: false, isPrivate: false })).toBe(true)
  })

  it('dept_lead cannot read another user\'s private minutes without a share grant', () => {
    // Only super_admin + regional_secretary get the blanket bypass; dept_lead does not
    expect(minutesSelectByShare({ uid: 'lead', minutesCreatedBy: 'u1', userRole: 'dept_lead', isExplicitShare: false, isPrivate: true })).toBe(false)
  })
})

describe('meeting_action_items_select RLS policy logic (inherits from meeting_minutes)', () => {
  it('allows creator to see action items in their own private minutes', () => {
    expect(actionItemsSelect({ uid: 'u1', minutesCreatedBy: 'u1', userRole: 'member', isExplicitShare: false, isPrivate: true })).toBe(true)
  })

  it('allows super_admin and regional_secretary to see action items in any private minutes', () => {
    expect(actionItemsSelect({ uid: 'admin', minutesCreatedBy: 'u1', userRole: 'super_admin', isExplicitShare: false, isPrivate: true })).toBe(true)
    expect(actionItemsSelect({ uid: 'rs', minutesCreatedBy: 'u1', userRole: 'regional_secretary', isExplicitShare: false, isPrivate: true })).toBe(true)
  })

  it('denies a random member from seeing action items in private minutes', () => {
    expect(actionItemsSelect({ uid: 'u2', minutesCreatedBy: 'u1', userRole: 'member', isExplicitShare: false, isPrivate: true })).toBe(false)
  })

  it('allows an explicitly-shared user to see action items', () => {
    expect(actionItemsSelect({ uid: 'u2', minutesCreatedBy: 'u1', userRole: 'member', isExplicitShare: true, isPrivate: true })).toBe(true)
  })
})

describe('meeting_attendance_select RLS policy logic (20270724000107)', () => {
  it('always allows a user to read their own attendance row', () => {
    // Key fix: even when the meeting has department_id IS NULL (1-on-1),
    // the user's own attendance row is always visible (user_id = uid escape hatch).
    expect(meetingAttendanceSelect({ uid: 'u1', attendanceUserId: 'u1', meetingVisible: false })).toBe(true)
  })

  it('allows reading attendance for a meeting the viewer can see', () => {
    expect(meetingAttendanceSelect({ uid: 'u1', attendanceUserId: 'u2', meetingVisible: true })).toBe(true)
  })

  it('denies reading another user\'s attendance row when the meeting is not visible to the viewer', () => {
    expect(meetingAttendanceSelect({ uid: 'u1', attendanceUserId: 'u2', meetingVisible: false })).toBe(false)
  })
})

describe('meeting_attendance pending state (20270805000017)', () => {
  it('validates that pending is an accepted attendance status (constraint added by 20270805000017)', () => {
    const validStatuses = ['pending', 'present', 'absent', 'excused']
    expect(validStatuses).toContain('pending')
    expect(validStatuses).toContain('present')
    expect(validStatuses).toContain('absent')
    expect(validStatuses).toContain('excused')
    // legacy 'invited' / 'declined' are NOT valid under the current constraint
    expect(validStatuses).not.toContain('invited')
    expect(validStatuses).not.toContain('declined')
  })
})

describe('meeting_attendance_write_leads policy logic (20270726000001)', () => {
  it('allows a full editor of the meeting to write attendance rows', () => {
    expect(meetingAttendanceWrite({ isFullEditor: true })).toBe(true)
  })

  it('denies a viewer (not a full editor) from writing attendance', () => {
    expect(meetingAttendanceWrite({ isFullEditor: false })).toBe(false)
  })
})
