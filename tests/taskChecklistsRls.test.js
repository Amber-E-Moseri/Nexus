/**
 * task_checklists — RLS policy-logic tests.
 *
 * Policy-logic assertion tests, not live Postgres integration tests — same
 * approach as tests/ideaBankRls.test.js.
 *
 * Migrations read (chronological; current effective policy noted):
 *   20270724000103_pastors_space_privacy.sql          — initial checklists_select + checklists_pastors_privacy added
 *   20270724000113_fix_pastors_privacy_perf_chain.sql — RESTRICTIVE pastors_privacy rebuilt to use is_task_assignee
 *                                                       (fixes statement timeout from nested RLS re-evaluation)
 *   20270802000009_fix_checklist_dependency_rls.sql   — ← CURRENT checklists_select rebuilt
 *                                                       (was causing infinite recursion via tasks RLS;
 *                                                       now uses task_meta() SECURITY DEFINER helper + adds
 *                                                       dept_lead + is_task_assignee + task_follows paths)
 *
 * Effective-policy summary:
 *   checklists_select (PERMISSIVE, current effective: 20270802000009):
 *     Uses task_meta(task_id) to avoid triggering tasks RLS mid-evaluation.
 *     Viewer can see checklist if task satisfies ANY of:
 *       - task.assignee_id = uid
 *       - task.created_by = uid
 *       - role IN (super_admin, regional_secretary)
 *       - has_space_role(uid, dept, 'dept_lead')
 *       - same-dept non-personal (dept IS NOT NULL AND dept = current_dept)
 *       - is_task_assignee(task_id, uid)
 *       - task_follows row exists
 *
 *   checklists_pastors_privacy (RESTRICTIVE, final: 20270724000113):
 *     Also requires one of:
 *       - NOT pastors_space
 *       - assignee_id = uid
 *       - created_by = uid
 *       - regional_secretary
 *       - is_task_assignee(task_id, uid)
 *
 * Key bug history exercised here:
 *   • 20270724000113 (fix_pastors_privacy_perf_chain): the original pastors_privacy
 *     restrictive policy ran a raw `EXISTS (SELECT 1 FROM task_assignees ...)` which
 *     triggered task_assignees' own RLS → re-queried tasks → re-evaluated tasks RLS →
 *     causing statement_timeout on every checklist load for Pastors-space tasks.
 *     Fixed by replacing the subquery with is_task_assignee() SECURITY DEFINER.
 *   • 20270802000009 (fix_checklist_dependency_rls): checklists_select used
 *     `EXISTS (SELECT 1 FROM tasks WHERE ...)` which triggered tasks' RLS, which
 *     calls is_task_assignee() → queries task_assignees → task_assignees_write policy
 *     calls task_meta() → queries tasks again → infinite recursion (42P17).
 *     Fixed by rewriting checklists_select to use task_meta() directly (same SECURITY
 *     DEFINER helper tasks uses internally).
 */

import { describe, it, expect } from 'vitest'

// Mirrors: checklists_select USING clause (current effective: 20270802000009)
// Uses task_meta() in practice; here we represent its fields directly.
function checklistsSelect({ uid, taskAssigneeId, taskCreatedBy, userRole, taskDept, userDept, taskIsPersonal, isDeptLead, isTaskAssignee, isTaskFollower }) {
  if (taskAssigneeId === uid) return true
  if (taskCreatedBy === uid) return true
  if (['super_admin', 'regional_secretary'].includes(userRole)) return true
  if (isDeptLead) return true
  if (!taskIsPersonal && taskDept !== null && taskDept === userDept) return true
  if (isTaskAssignee) return true
  if (isTaskFollower) return true
  return false
}

// Mirrors: checklists_pastors_privacy RESTRICTIVE USING clause (20270724000113)
function checklistsPastorsPrivacy({ isPastorsSpace, taskAssigneeId, taskCreatedBy, uid, userRole, isTaskAssignee }) {
  return (
    !isPastorsSpace
    || taskAssigneeId === uid
    || taskCreatedBy === uid
    || userRole === 'regional_secretary'
    || isTaskAssignee
  )
}

// Full effective check: BOTH policies must pass
function canEffectivelySelectChecklist(args) {
  return checklistsSelect(args) && checklistsPastorsPrivacy(args)
}

describe('checklists_select RLS policy logic (20270802000009)', () => {
  it('allows the primary assignee to see checklists', () => {
    expect(checklistsSelect({ uid: 'u1', taskAssigneeId: 'u1', taskCreatedBy: 'u2', userRole: 'member', taskDept: 'dept-B', userDept: 'dept-A', taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false })).toBe(true)
  })

  it('allows the task creator to see checklists', () => {
    expect(checklistsSelect({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u1', userRole: 'member', taskDept: 'dept-B', userDept: 'dept-A', taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false })).toBe(true)
  })

  it('allows a same-dept member to see checklists on a non-personal dept task', () => {
    expect(checklistsSelect({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', taskDept: 'dept-A', userDept: 'dept-A', taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false })).toBe(true)
  })

  it('denies a cross-dept member with no task relationship', () => {
    expect(checklistsSelect({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', taskDept: 'dept-B', userDept: 'dept-A', taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false })).toBe(false)
  })

  it('allows super_admin and regional_secretary cross-dept checklist access', () => {
    expect(checklistsSelect({ uid: 'admin', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'super_admin', taskDept: 'dept-B', userDept: null, taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false })).toBe(true)
    expect(checklistsSelect({ uid: 'rs', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'regional_secretary', taskDept: 'dept-B', userDept: null, taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false })).toBe(true)
  })

  it('allows a dept_lead to see checklists in their space (new in 20270802000009)', () => {
    // Before this migration dept_lead had no explicit path; now has_space_role covers it
    expect(checklistsSelect({ uid: 'lead', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'dept_lead', taskDept: 'dept-A', userDept: 'dept-A', taskIsPersonal: false, isDeptLead: true, isTaskAssignee: false, isTaskFollower: false })).toBe(true)
  })

  it('allows a secondary assignee to see checklists (new in 20270802000009)', () => {
    expect(checklistsSelect({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', taskDept: 'dept-B', userDept: 'dept-A', taskIsPersonal: false, isDeptLead: false, isTaskAssignee: true, isTaskFollower: false })).toBe(true)
  })

  it('allows a task follower to see checklists', () => {
    expect(checklistsSelect({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', taskDept: 'dept-B', userDept: 'dept-A', taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: true })).toBe(true)
  })

  it('denies access when task dept is null and user is not otherwise related (null-dept guard)', () => {
    // task_dept IS NULL: the (dept IS NOT NULL AND dept = current_dept) clause is false
    expect(checklistsSelect({ uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', userRole: 'member', taskDept: null, userDept: 'dept-A', taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false })).toBe(false)
  })
})

describe('checklists_pastors_privacy RESTRICTIVE policy logic', () => {
  it('does not restrict non-Pastors-space checklists', () => {
    expect(checklistsPastorsPrivacy({ isPastorsSpace: false, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', isTaskAssignee: false })).toBe(true)
  })

  it('denies a Pastors-space checklist to a pastor with no task relationship', () => {
    expect(checklistsPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', isTaskAssignee: false })).toBe(false)
  })

  it('allows the primary assignee to see their own Pastors-space checklists', () => {
    expect(checklistsPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p1', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', isTaskAssignee: false })).toBe(true)
  })

  it('allows regional_secretary to see any Pastors-space checklist', () => {
    expect(checklistsPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'rs', userRole: 'regional_secretary', isTaskAssignee: false })).toBe(true)
  })

  it('super_admin does NOT bypass Pastors-space checklist privacy', () => {
    expect(checklistsPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'admin', userRole: 'super_admin', isTaskAssignee: false })).toBe(false)
  })

  it('allows a secondary assignee (is_task_assignee) to see Pastors-space checklists', () => {
    expect(checklistsPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', isTaskAssignee: true })).toBe(true)
  })
})

describe('combined effective task_checklists visibility (permissive AND restrictive)', () => {
  it('denies super_admin checklist access on a Pastors-space task (permissive passes, restrictive blocks)', () => {
    // super_admin passes checklists_select but not checklists_pastors_privacy
    expect(canEffectivelySelectChecklist({ uid: 'admin', taskAssigneeId: 'p2', taskCreatedBy: 'p2', userRole: 'super_admin', taskDept: 'pastors-dept', userDept: null, taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false, isPastorsSpace: true })).toBe(false)
  })

  it('allows the assigned pastor to see their own checklist in the Pastors space', () => {
    expect(canEffectivelySelectChecklist({ uid: 'p1', taskAssigneeId: 'p1', taskCreatedBy: 'p2', userRole: 'pastor', taskDept: 'pastors-dept', userDept: 'pastors-dept', taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false, isPastorsSpace: true })).toBe(true)
  })

  it('denies a different pastor from seeing a co-pastor\'s checklist (cross-pastor privacy)', () => {
    expect(canEffectivelySelectChecklist({ uid: 'pastor-A', taskAssigneeId: 'pastor-B', taskCreatedBy: 'pastor-B', userRole: 'pastor', taskDept: 'pastors-dept', userDept: 'pastors-dept', taskIsPersonal: false, isDeptLead: false, isTaskAssignee: false, isTaskFollower: false, isPastorsSpace: true })).toBe(false)
  })
})
