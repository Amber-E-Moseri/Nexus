/**
 * tasks + task_assignees — RLS policy-logic tests.
 *
 * Policy-logic assertion tests, not live Postgres integration tests — same
 * approach as tests/ideaBankRls.test.js. Re-implements the exact boolean
 * predicates from each policy's USING / WITH CHECK clause.
 *
 * Migrations read (chronological; current effective policy noted):
 *   tasks SELECT:
 *     20260608000000_initial_blw_canada_os_schema.sql     — first policy shape
 *     20261216000000_phase3_rls_swap.sql                  — phase-3 overhaul
 *     20270101000004_tasks_follower_visibility.sql         — tasks_select_follower added
 *     20270716000002_regional_secretary_tasks_select.sql   — tasks_select_admin rebuilt
 *     20270724000103_pastors_space_privacy.sql             — RESTRICTIVE tasks_pastors_privacy added
 *     20270804000010_sprint_members_task_access.sql        — ← CURRENT tasks_select_member
 *
 *   task_assignees SELECT:
 *     20270718000007_task_assignees.sql                   — initial policy
 *     20270724000103_pastors_space_privacy.sql            — RESTRICTIVE task_assignees_pastors_privacy
 *     20270724000114_fix_tasks_task_assignees_recursion.sql
 *     20270730000005_tasks_assignee_visibility.sql
 *     20270730000009_fix_task_assignees_self_visibility.sql
 *     20270802000001_fix_task_assignees_write_recursion.sql
 *     20270805000002_fix_task_assignees_rls_for_sprint.sql
 *     20270805000004_fix_task_assignees_sprint_select.sql  — ← CURRENT task_assignees_select
 *
 * Effective-policy summary:
 *   tasks SELECT = permissive policies OR'd:
 *     tasks_select_admin  : deleted_at IS NULL AND role IN (super_admin, regional_secretary)
 *                           AND (is_personal=false OR created_by=uid OR assignee_id=uid)
 *     tasks_select_member : deleted_at IS NULL AND (assignee_id=uid OR created_by=uid
 *                           OR (same dept + not personal + meeting visible if meeting-origin)
 *                           OR sprint task + is_sprint_member)
 *     tasks_select_follower: in task_follows
 *     tasks_select_lead   : dept_lead OR has follower from same dept
 *   … AND'd with restrictive policy tasks_pastors_privacy:
 *     NOT pastors_space OR assignee_id=uid OR created_by=uid OR regional_secretary
 *     OR is_task_assignee(id, uid)
 *
 *   task_assignees_select : user_id=uid
 *     OR (task visible: primary-assignee, creator, same-dept-non-personal,
 *         super_admin/regional_secretary, sprint-member)
 *   … AND'd with restrictive task_assignees_pastors_privacy.
 */

import { describe, it, expect } from 'vitest'

// ────────────────────────────────────────────────────────────────────────────
// tasks_select_admin predicate
// ────────────────────────────────────────────────────────────────────────────
function tasksSelectAdmin({ userRole, isPersonal, createdBy, assigneeId, uid }) {
  if (!['super_admin', 'regional_secretary'].includes(userRole)) return false
  return !isPersonal || createdBy === uid || assigneeId === uid
}

// ────────────────────────────────────────────────────────────────────────────
// tasks_select_member predicate (simplified — omits meeting-origin subquery
// which can't be inlined without a live DB; tests focus on the main branches)
// ────────────────────────────────────────────────────────────────────────────
function tasksSelectMember({ uid, assigneeId, createdBy, isPersonal, taskDept, userDept, taskType, sprintId, isSprintMember }) {
  if (assigneeId === uid) return true
  if (createdBy === uid) return true
  if (!isPersonal && taskDept === userDept) return true
  if (taskType === 'sprint' && sprintId !== null && isSprintMember) return true
  return false
}

// ────────────────────────────────────────────────────────────────────────────
// tasks_pastors_privacy (RESTRICTIVE — must ALSO pass for select to succeed)
// ────────────────────────────────────────────────────────────────────────────
function tasksPastorsPrivacy({ isPastorsSpace, assigneeId, createdBy, uid, userRole, isTaskAssignee }) {
  return (
    !isPastorsSpace
    || assigneeId === uid
    || createdBy === uid
    || userRole === 'regional_secretary'
    || isTaskAssignee
  )
}

// ────────────────────────────────────────────────────────────────────────────
// task_assignees_select predicate (current effective: 20270805000004)
// ────────────────────────────────────────────────────────────────────────────
function taskAssigneesSelect({ userId, uid, taskAssigneeId, taskCreatedBy, taskDept, userDept, taskIsPersonal, userRole, taskSprintId, isSprintMember }) {
  // Escape hatch: you always see your own row
  if (userId === uid) return true

  // Task-level visibility check (mirrors tasks subquery)
  const taskVisible = (
    taskAssigneeId === uid
    || taskCreatedBy === uid
    || (!taskIsPersonal && taskDept === userDept)
    || ['super_admin', 'regional_secretary'].includes(userRole)
    || (taskSprintId !== null && isSprintMember)
  )
  return taskVisible
}

// ────────────────────────────────────────────────────────────────────────────
// task_assignees_pastors_privacy (RESTRICTIVE)
// ────────────────────────────────────────────────────────────────────────────
function taskAssigneesPastorsPrivacy({ isPastorsSpace, taskAssigneeId, taskCreatedBy, uid, userRole, rowUserId }) {
  return (
    !isPastorsSpace
    || taskAssigneeId === uid
    || taskCreatedBy === uid
    || userRole === 'regional_secretary'
    || rowUserId === uid
  )
}

// ─────────────────────────────────────────────────────────────────────────────

describe('tasks_select_admin RLS policy logic', () => {
  it('allows super_admin to read a non-personal task from any department', () => {
    expect(tasksSelectAdmin({ userRole: 'super_admin', isPersonal: false, createdBy: 'x', assigneeId: 'y', uid: 'admin' })).toBe(true)
  })

  it('allows regional_secretary to read a non-personal task from any department', () => {
    expect(tasksSelectAdmin({ userRole: 'regional_secretary', isPersonal: false, createdBy: 'x', assigneeId: 'y', uid: 'rs' })).toBe(true)
  })

  it('denies super_admin reading a personal task that belongs to someone else', () => {
    // isPersonal=true, admin is neither creator nor assignee
    expect(tasksSelectAdmin({ userRole: 'super_admin', isPersonal: true, createdBy: 'user-A', assigneeId: 'user-A', uid: 'admin' })).toBe(false)
  })

  it('allows super_admin to read their own personal task', () => {
    expect(tasksSelectAdmin({ userRole: 'super_admin', isPersonal: true, createdBy: 'admin', assigneeId: 'admin', uid: 'admin' })).toBe(true)
  })

  it('denies a plain member using the admin policy path', () => {
    expect(tasksSelectAdmin({ userRole: 'member', isPersonal: false, createdBy: 'x', assigneeId: 'y', uid: 'member-1' })).toBe(false)
  })
})

describe('tasks_select_member RLS policy logic', () => {
  it('allows the primary assignee to see the task', () => {
    expect(tasksSelectMember({ uid: 'u1', assigneeId: 'u1', createdBy: 'u2', isPersonal: false, taskDept: 'dept-B', userDept: 'dept-A', taskType: 'normal', sprintId: null, isSprintMember: false })).toBe(true)
  })

  it('allows the creator to see the task', () => {
    expect(tasksSelectMember({ uid: 'u1', assigneeId: 'u2', createdBy: 'u1', isPersonal: false, taskDept: 'dept-B', userDept: 'dept-A', taskType: 'normal', sprintId: null, isSprintMember: false })).toBe(true)
  })

  it('allows a same-dept member to see a non-personal department task', () => {
    expect(tasksSelectMember({ uid: 'u1', assigneeId: 'u2', createdBy: 'u3', isPersonal: false, taskDept: 'dept-A', userDept: 'dept-A', taskType: 'normal', sprintId: null, isSprintMember: false })).toBe(true)
  })

  it('denies a cross-dept member who is neither assignee nor creator', () => {
    expect(tasksSelectMember({ uid: 'u1', assigneeId: 'u2', createdBy: 'u3', isPersonal: false, taskDept: 'dept-B', userDept: 'dept-A', taskType: 'normal', sprintId: null, isSprintMember: false })).toBe(false)
  })

  it('denies a same-dept member from reading a personal task they did not create or own', () => {
    expect(tasksSelectMember({ uid: 'u1', assigneeId: 'u2', createdBy: 'u2', isPersonal: true, taskDept: 'dept-A', userDept: 'dept-A', taskType: 'normal', sprintId: null, isSprintMember: false })).toBe(false)
  })

  it('allows a sprint member to see a sprint task even with null department (custom sprint)', () => {
    expect(tasksSelectMember({ uid: 'u1', assigneeId: 'u2', createdBy: 'u3', isPersonal: false, taskDept: null, userDept: 'dept-A', taskType: 'sprint', sprintId: 'sprint-X', isSprintMember: true })).toBe(true)
  })

  it('denies a non-member from reading a sprint task', () => {
    expect(tasksSelectMember({ uid: 'u1', assigneeId: 'u2', createdBy: 'u3', isPersonal: false, taskDept: null, userDept: 'dept-A', taskType: 'sprint', sprintId: 'sprint-X', isSprintMember: false })).toBe(false)
  })
})

describe('tasks_pastors_privacy RESTRICTIVE policy logic', () => {
  it('passes for any non-pastors-space task (restriction does not apply)', () => {
    expect(tasksPastorsPrivacy({ isPastorsSpace: false, assigneeId: 'u2', createdBy: 'u3', uid: 'u1', userRole: 'member', isTaskAssignee: false })).toBe(true)
  })

  it('denies a Pastors-space task to a pastor who is not the assignee, creator, or secondary assignee', () => {
    expect(tasksPastorsPrivacy({ isPastorsSpace: true, assigneeId: 'pastor-B', createdBy: 'pastor-B', uid: 'pastor-A', userRole: 'pastor', isTaskAssignee: false })).toBe(false)
  })

  it('allows a pastor to see their own assigned Pastors-space task', () => {
    expect(tasksPastorsPrivacy({ isPastorsSpace: true, assigneeId: 'pastor-A', createdBy: 'pastor-B', uid: 'pastor-A', userRole: 'pastor', isTaskAssignee: false })).toBe(true)
  })

  it('allows regional_secretary to see any Pastors-space task', () => {
    expect(tasksPastorsPrivacy({ isPastorsSpace: true, assigneeId: 'pastor-A', createdBy: 'pastor-A', uid: 'rs', userRole: 'regional_secretary', isTaskAssignee: false })).toBe(true)
  })

  it('super_admin does NOT bypass Pastors-space privacy (only regional_secretary does)', () => {
    // tasks_pastors_privacy lists only regional_secretary, not super_admin
    expect(tasksPastorsPrivacy({ isPastorsSpace: true, assigneeId: 'pastor-A', createdBy: 'pastor-A', uid: 'admin', userRole: 'super_admin', isTaskAssignee: false })).toBe(false)
  })

  it('allows a secondary assignee (task_assignees row) in the Pastors space', () => {
    expect(tasksPastorsPrivacy({ isPastorsSpace: true, assigneeId: 'pastor-B', createdBy: 'pastor-B', uid: 'pastor-A', userRole: 'pastor', isTaskAssignee: true })).toBe(true)
  })
})

describe('task_assignees_select RLS policy logic (20270805000004)', () => {
  it('allows a user to always see their own task_assignees row regardless of task type', () => {
    // The sprint-custom-task bug: userId = uid escape hatch fixes null-dept tasks
    expect(taskAssigneesSelect({ userId: 'u1', uid: 'u1', taskAssigneeId: 'u2', taskCreatedBy: 'u3', taskDept: null, userDept: 'dept-A', taskIsPersonal: false, userRole: 'member', taskSprintId: 'sprint-X', isSprintMember: false })).toBe(true)
  })

  it('denies a cross-dept non-sprint member from seeing another user\'s task_assignees row', () => {
    expect(taskAssigneesSelect({ userId: 'u2', uid: 'u1', taskAssigneeId: 'u3', taskCreatedBy: 'u3', taskDept: 'dept-B', userDept: 'dept-A', taskIsPersonal: false, userRole: 'member', taskSprintId: null, isSprintMember: false })).toBe(false)
  })

  it('allows a sprint member to see assignee rows for their sprint tasks', () => {
    expect(taskAssigneesSelect({ userId: 'u2', uid: 'u1', taskAssigneeId: 'u3', taskCreatedBy: 'u3', taskDept: null, userDept: 'dept-A', taskIsPersonal: false, userRole: 'member', taskSprintId: 'sprint-X', isSprintMember: true })).toBe(true)
  })

  it('allows super_admin to see any task_assignees row via the task-level role check', () => {
    expect(taskAssigneesSelect({ userId: 'u2', uid: 'admin', taskAssigneeId: 'u3', taskCreatedBy: 'u3', taskDept: 'dept-B', userDept: null, taskIsPersonal: false, userRole: 'super_admin', taskSprintId: null, isSprintMember: false })).toBe(true)
  })

  it('allows a same-dept member to see assignees for a shared department task', () => {
    expect(taskAssigneesSelect({ userId: 'u2', uid: 'u1', taskAssigneeId: 'u3', taskCreatedBy: 'u3', taskDept: 'dept-A', userDept: 'dept-A', taskIsPersonal: false, userRole: 'member', taskSprintId: null, isSprintMember: false })).toBe(true)
  })
})

describe('task_assignees_pastors_privacy RESTRICTIVE policy logic', () => {
  it('passes for non-pastors-space tasks', () => {
    expect(taskAssigneesPastorsPrivacy({ isPastorsSpace: false, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', rowUserId: 'p2' })).toBe(true)
  })

  it('denies a pastor seeing another pastor\'s task_assignees row in the Pastors space', () => {
    // Neither the row's user_id matches, nor assignee/creator/rs
    expect(taskAssigneesPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', rowUserId: 'p2' })).toBe(false)
  })

  it('allows a pastor to see their own task_assignees row (rowUserId = uid)', () => {
    expect(taskAssigneesPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'p1', userRole: 'pastor', rowUserId: 'p1' })).toBe(true)
  })

  it('allows regional_secretary to see any task_assignees row in the Pastors space', () => {
    expect(taskAssigneesPastorsPrivacy({ isPastorsSpace: true, taskAssigneeId: 'p2', taskCreatedBy: 'p2', uid: 'rs', userRole: 'regional_secretary', rowUserId: 'p2' })).toBe(true)
  })
})
