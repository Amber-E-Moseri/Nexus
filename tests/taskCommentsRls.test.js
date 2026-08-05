/**
 * task_comments — RLS policy-logic tests.
 *
 * Policy-logic assertion tests, not live Postgres integration tests — same
 * approach as tests/ideaBankRls.test.js.
 *
 * Migrations read (chronological; current effective policy noted):
 *   20260608000000_initial_blw_canada_os_schema.sql  — initial task_comments table
 *   20260613000000_task_maturity.sql                 — initial comment RLS
 *   20260622000001_task_comments_rls_fix.sql         — early dept-scoping fix
 *   20260627000004_task_comments_not_null.sql         — structural only
 *   20260703000000_assigned_comments.sql              — inbox-style comments
 *   20260710000000_fix_null_department_rls.sql        — null-dept guard
 *   20260710000001_fix_null_department_rls_extended.sql
 *   20270101000005_task_comments_follower_visibility.sql — follower path
 *   20270719000013_p0_task_comments_insert_gate.sql   — insert policy
 *   20270724000103_pastors_space_privacy.sql          — RESTRICTIVE task_comments_pastors_privacy added
 *   20270724000113_fix_pastors_privacy_perf_chain.sql — RESTRICTIVE policy rebuilt (is_task_assignee)
 *   20270730000011_fix_mention_auth_and_comment_visibility.sql — task_comments_select_related + is_task_assignee
 *   20270802000005_fix_subtask_mention_auth.sql       — ← CURRENT task_comments_select_related
 *                                                       (adds parent-task dept fallback for null-dept subtasks)
 *
 * Effective-policy summary:
 *   task_comments_select_related (PERMISSIVE, current effective):
 *     Viewer can read comment if task satisfies ANY of:
 *       - task.assignee_id = uid
 *       - task.created_by = uid
 *       - role IN (super_admin, regional_secretary)
 *       - task_follows row exists
 *       - is_task_assignee(task_id, uid)
 *       - same-dept non-personal: task.department_id = current_dept
 *           OR (task.department_id IS NULL AND parent task's dept = current_dept)
 *
 *   task_comments_pastors_privacy (RESTRICTIVE, final: 20270724000113):
 *     Comment only visible if ALSO:
 *       - NOT pastors_space
 *       - OR assignee_id = uid
 *       - OR created_by = uid
 *       - OR regional_secretary
 *       - OR is_task_assignee(task_id, uid)
 *
 * Key edge case exercised: a cross-dept user @mentioned on a null-dept subtask
 * comment can read the thread once they are in task_follows/task_assignees —
 * this was the precise bug fixed by 20270802000005 (fix_subtask_mention_auth).
 */

import { describe, it, expect } from 'vitest'

// Mirrors: task_comments_select_related USING clause (current effective: 20270802000005)
function canSelectComment({ uid, taskAssigneeId, taskCreatedBy, userRole, isTaskFollower, isTaskAssignee, taskIsPersonal, taskDept, userDept, taskParentDept }) {
  if (taskAssigneeId === uid) return true
  if (taskCreatedBy === uid) return true
  if (['super_admin', 'regional_secretary'].includes(userRole)) return true
  if (isTaskFollower) return true
  if (isTaskAssignee) return true
  if (!taskIsPersonal) {
    // task has own department
    if (taskDept !== null && taskDept === userDept) return true
    // null-dept subtask: fall back to parent task's department (fix from 20270802000005)
    if (taskDept === null && taskParentDept !== null && taskParentDept === userDept) return true
  }
  return false
}

// Mirrors: task_comments_pastors_privacy USING clause (RESTRICTIVE, 20270724000113)
function commentsPastorsPrivacy({ isPastorsSpace, taskAssigneeId, taskCreatedBy, uid, userRole, isTaskAssignee }) {
  return (
    !isPastorsSpace
    || taskAssigneeId === uid
    || taskCreatedBy === uid
    || userRole === 'regional_secretary'
    || isTaskAssignee
  )
}

// Full effective check: BOTH policies must pass
function canEffectivelySelectComment(args) {
  return canSelectComment(args) && commentsPastorsPrivacy(args)
}

describe('task_comments_select_related RLS policy logic', () => {
  it('allows the primary assignee to read comments on their task', () => {
    expect(canSelectComment({ uid: 'u1', taskAssigneeId: 'u1', taskCreatedBy: 'u2', userRole: 'member', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: 'dept-B', userDept: 'dept-A', taskParentDept: null })).toBe(true)
  })

  it('allows the task creator to read comments', () => {
    expect(canSelectComment({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u1', userRole: 'member', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: 'dept-B', userDept: 'dept-A', taskParentDept: null })).toBe(true)
  })

  it('allows a same-dept member to read comments on a non-personal dept task', () => {
    expect(canSelectComment({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: 'dept-A', userDept: 'dept-A', taskParentDept: null })).toBe(true)
  })

  it('denies a cross-dept member with no relationship to the task', () => {
    expect(canSelectComment({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: 'dept-B', userDept: 'dept-A', taskParentDept: null })).toBe(false)
  })

  it('allows a user in task_follows to read comments (follower path)', () => {
    expect(canSelectComment({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', isTaskFollower: true, isTaskAssignee: false, taskIsPersonal: false, taskDept: 'dept-B', userDept: 'dept-A', taskParentDept: null })).toBe(true)
  })

  it('allows a secondary assignee (task_assignees row) to read comments', () => {
    expect(canSelectComment({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', isTaskFollower: false, isTaskAssignee: true, taskIsPersonal: false, taskDept: 'dept-B', userDept: 'dept-A', taskParentDept: null })).toBe(true)
  })

  it('allows super_admin and regional_secretary to read any comment', () => {
    expect(canSelectComment({ uid: 'admin', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'super_admin', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: 'dept-B', userDept: null, taskParentDept: null })).toBe(true)
    expect(canSelectComment({ uid: 'rs', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'regional_secretary', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: 'dept-B', userDept: null, taskParentDept: null })).toBe(true)
  })

  // Specific fix from 20270802000005: @mentioned user on null-dept subtask
  it('allows a user @mentioned on a null-dept subtask comment to read the thread via task_follows (20270802000005 fix)', () => {
    // The subtask has no department_id (quick-add path), but its parent task is in dept-A.
    // The @mentioned user is in dept-A and was added to task_follows by the mention.
    // Before the fix: dept check failed (null != dept-A); task_follows check was the only rescue.
    expect(canSelectComment({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', isTaskFollower: true, isTaskAssignee: false, taskIsPersonal: false, taskDept: null, userDept: 'dept-A', taskParentDept: 'dept-A' })).toBe(true)
  })

  it('falls back to parent task dept when subtask dept is null and no explicit relationship exists', () => {
    // Same-dept member can read null-dept subtask comments if parent dept matches
    expect(canSelectComment({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: null, userDept: 'dept-A', taskParentDept: 'dept-A' })).toBe(true)
  })

  it('denies a cross-dept user with no relationship even when subtask dept is null', () => {
    expect(canSelectComment({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: null, userDept: 'dept-B', taskParentDept: 'dept-A' })).toBe(false)
  })
})

describe('task_comments_pastors_privacy RESTRICTIVE policy logic', () => {
  it('does not restrict comments on non-Pastors-space tasks', () => {
    expect(commentsPastorsPrivacy({ isPastorsSpace: false, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', isTaskAssignee: false })).toBe(true)
  })

  it('denies a Pastors-space comment to a pastor with no task relationship', () => {
    expect(commentsPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', isTaskAssignee: false })).toBe(false)
  })

  it('allows regional_secretary to read Pastors-space comments', () => {
    expect(commentsPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'rs', userRole: 'regional_secretary', isTaskAssignee: false })).toBe(true)
  })

  it('super_admin does NOT bypass Pastors-space comment privacy (only regional_secretary does)', () => {
    expect(commentsPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'admin', userRole: 'super_admin', isTaskAssignee: false })).toBe(false)
  })

  it('allows a secondary assignee (task_assignees row) to read Pastors-space comments', () => {
    expect(commentsPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', isTaskAssignee: true })).toBe(true)
  })
})

describe('combined effective task_comments visibility (permissive AND restrictive)', () => {
  it('denies a cross-dept user even when they pass the permissive check, if Pastors-space blocks them', () => {
    // super_admin passes permissive but NOT pastors_privacy restrictive
    expect(canEffectivelySelectComment({ uid: 'admin', taskAssigneeId: 'p2', taskCreatedBy: 'p2', userRole: 'super_admin', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: 'pastors-dept', userDept: null, taskParentDept: null, isPastorsSpace: true })).toBe(false)
  })

  it('allows regional_secretary through both policies on a Pastors-space comment', () => {
    expect(canEffectivelySelectComment({ uid: 'rs', taskAssigneeId: 'p2', taskCreatedBy: 'p2', userRole: 'regional_secretary', isTaskFollower: false, isTaskAssignee: false, taskIsPersonal: false, taskDept: 'pastors-dept', userDept: null, taskParentDept: null, isPastorsSpace: true })).toBe(true)
  })
})
