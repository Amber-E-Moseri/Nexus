/**
 * Programs sprint write-access — policy-logic regression tests.
 *
 * Covers the predicates introduced by:
 *   20271003000000_programs_regional_sprint_access.sql  (can_write_sprint_tasks function)
 *   20271003000001_programs_regional_sprint_access_fix.sql  (tasks_insert WITH CHECK)
 *
 * These are pure JavaScript predicate tests — no live database required.
 * They re-implement the exact boolean logic from each function/policy clause.
 *
 * Regression focus:
 *   - Programs member access granted
 *   - Non-Programs member correctly denied
 *   - Regional-sprint access (super_admin, regional_secretary) granted
 *   - Unauthorized write denied
 *   - NULL / absent context setting fails closed
 *   - Malformed UUID context no accidental grant
 */

import { describe, it, expect } from 'vitest'

// ────────────────────────────────────────────────────────────────────────────
// can_write_sprint_tasks() predicate
//
// Mirrors the SQL function body from 20271003000000 (fixed form).
// The sprint-team membership branch requires an external context variable
// (app.current_sprint_id); modelled here as an optional `contextSprintId`
// parameter plus a `isTeamMember` flag that simulates the EXISTS sub-query.
// ────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {string}  p.role           - user's role string
 * @param {boolean} p.isProgramsMember - icplc_is_programs_member() result
 * @param {string|null} p.contextSprintId - raw value of app.current_sprint_id
 * @param {boolean} p.isTeamMemberOfContextSprint - EXISTS check result
 */
function canWriteSprintTasks({ role, isProgramsMember, contextSprintId, isTeamMemberOfContextSprint }) {
  if (role === 'super_admin' || role === 'regional_secretary') return true
  if (isProgramsMember) return true

  // Mirrors the CASE/regex guard in the fixed SQL function:
  //   CASE WHEN value ~* '^[0-9a-f]{8}-...' THEN value::uuid ELSE NULL END
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const resolvedId = (contextSprintId && UUID_RE.test(contextSprintId)) ? contextSprintId : null
  if (resolvedId !== null && isTeamMemberOfContextSprint) return true

  return false
}

// ────────────────────────────────────────────────────────────────────────────
// tasks_insert WITH CHECK predicate
//
// Mirrors the final policy from 20271003000001.
// The sprint-team membership branch uses tasks.sprint_id, not a context var.
// ────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {string}  p.role            - user's role string
 * @param {boolean} p.isProgramsMember
 * @param {string|null} p.taskSprintId  - tasks.sprint_id
 * @param {boolean} p.isTeamMemberOfTaskSprint - EXISTS on sprint_team_members
 */
function tasksInsertCheck({ role, isProgramsMember, taskSprintId, isTeamMemberOfTaskSprint }) {
  if (role === 'super_admin' || role === 'regional_secretary') return true
  if (isProgramsMember) return true
  if (taskSprintId !== null && isTeamMemberOfTaskSprint) return true
  return false
}

// ────────────────────────────────────────────────────────────────────────────
// can_write_sprint_tasks() — Programs member access
// ────────────────────────────────────────────────────────────────────────────
describe('can_write_sprint_tasks — Programs member access', () => {
  it('grants a Programs member regardless of sprint context', () => {
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: true,
      contextSprintId: null,
      isTeamMemberOfContextSprint: false,
    })).toBe(true)
  })

  it('grants a Programs dept_lead', () => {
    expect(canWriteSprintTasks({
      role: 'dept_lead',
      isProgramsMember: true,
      contextSprintId: null,
      isTeamMemberOfContextSprint: false,
    })).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// can_write_sprint_tasks() — Regional sprint access
// ────────────────────────────────────────────────────────────────────────────
describe('can_write_sprint_tasks — regional role access', () => {
  it('grants super_admin unconditionally', () => {
    expect(canWriteSprintTasks({
      role: 'super_admin',
      isProgramsMember: false,
      contextSprintId: null,
      isTeamMemberOfContextSprint: false,
    })).toBe(true)
  })

  it('grants regional_secretary unconditionally', () => {
    expect(canWriteSprintTasks({
      role: 'regional_secretary',
      isProgramsMember: false,
      contextSprintId: null,
      isTeamMemberOfContextSprint: false,
    })).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// can_write_sprint_tasks() — Sprint team member via context variable
// ────────────────────────────────────────────────────────────────────────────
describe('can_write_sprint_tasks — sprint team member via context', () => {
  it('grants a non-Programs sprint team member when context sprint id is valid and they are a member', () => {
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: false,
      contextSprintId: '550e8400-e29b-41d4-a716-446655440000',
      isTeamMemberOfContextSprint: true,
    })).toBe(true)
  })

  it('denies a non-Programs sprint team member when they are NOT on the context sprint', () => {
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: false,
      contextSprintId: '550e8400-e29b-41d4-a716-446655440000',
      isTeamMemberOfContextSprint: false,
    })).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// can_write_sprint_tasks() — Unauthorized write denied
// ────────────────────────────────────────────────────────────────────────────
describe('can_write_sprint_tasks — unauthorized denied', () => {
  it('denies a plain member who is not Programs and has no sprint context', () => {
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: false,
      contextSprintId: null,
      isTeamMemberOfContextSprint: false,
    })).toBe(false)
  })

  it('denies a dept_lead who is not Programs and has no sprint context', () => {
    expect(canWriteSprintTasks({
      role: 'dept_lead',
      isProgramsMember: false,
      contextSprintId: null,
      isTeamMemberOfContextSprint: false,
    })).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// can_write_sprint_tasks() — NULL / absent context fails closed
// ────────────────────────────────────────────────────────────────────────────
describe('can_write_sprint_tasks — NULL/absent context setting fails closed', () => {
  it('denies when context sprint id is null (setting not set)', () => {
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: false,
      contextSprintId: null,
      isTeamMemberOfContextSprint: true,  // would grant if id resolved
    })).toBe(false)
  })

  it('denies when context sprint id is empty string', () => {
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: false,
      contextSprintId: '',
      isTeamMemberOfContextSprint: true,
    })).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// can_write_sprint_tasks() — Malformed UUID no accidental grant
// ────────────────────────────────────────────────────────────────────────────
describe('can_write_sprint_tasks — malformed UUID no accidental grant', () => {
  it('denies when context sprint id is a non-UUID string', () => {
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: false,
      contextSprintId: 'not-a-uuid',
      isTeamMemberOfContextSprint: true,
    })).toBe(false)
  })

  it('denies when context sprint id is a partial UUID', () => {
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: false,
      contextSprintId: '550e8400-e29b',
      isTeamMemberOfContextSprint: true,
    })).toBe(false)
  })

  it('denies when context sprint id is an SQL injection attempt', () => {
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: false,
      contextSprintId: "'; DROP TABLE sprints; --",
      isTeamMemberOfContextSprint: true,
    })).toBe(false)
  })

  it('allows uppercase UUID format (PostgreSQL ~* is case-insensitive)', () => {
    // Uppercase UUIDs are valid; the regex is case-insensitive
    expect(canWriteSprintTasks({
      role: 'member',
      isProgramsMember: false,
      contextSprintId: '550E8400-E29B-41D4-A716-446655440000',
      isTeamMemberOfContextSprint: true,
    })).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// tasks_insert WITH CHECK — Programs member access
// ────────────────────────────────────────────────────────────────────────────
describe('tasks_insert WITH CHECK — Programs member access', () => {
  it('allows a Programs member to insert a sprint task', () => {
    expect(tasksInsertCheck({
      role: 'member',
      isProgramsMember: true,
      taskSprintId: 'sprint-A',
      isTeamMemberOfTaskSprint: false,
    })).toBe(true)
  })

  it('allows a Programs member to insert a non-sprint task', () => {
    expect(tasksInsertCheck({
      role: 'member',
      isProgramsMember: true,
      taskSprintId: null,
      isTeamMemberOfTaskSprint: false,
    })).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// tasks_insert WITH CHECK — Regional sprint access
// ────────────────────────────────────────────────────────────────────────────
describe('tasks_insert WITH CHECK — regional role access', () => {
  it('allows super_admin to insert any sprint task', () => {
    expect(tasksInsertCheck({
      role: 'super_admin',
      isProgramsMember: false,
      taskSprintId: 'sprint-A',
      isTeamMemberOfTaskSprint: false,
    })).toBe(true)
  })

  it('allows regional_secretary to insert any sprint task', () => {
    expect(tasksInsertCheck({
      role: 'regional_secretary',
      isProgramsMember: false,
      taskSprintId: 'sprint-A',
      isTeamMemberOfTaskSprint: false,
    })).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// tasks_insert WITH CHECK — Sprint team member access
// ────────────────────────────────────────────────────────────────────────────
describe('tasks_insert WITH CHECK — sprint team member access', () => {
  it('allows a sprint team member to insert a task in their sprint', () => {
    expect(tasksInsertCheck({
      role: 'member',
      isProgramsMember: false,
      taskSprintId: 'sprint-A',
      isTeamMemberOfTaskSprint: true,
    })).toBe(true)
  })

  it('denies a non-team member inserting a task in a sprint they are not on', () => {
    expect(tasksInsertCheck({
      role: 'member',
      isProgramsMember: false,
      taskSprintId: 'sprint-A',
      isTeamMemberOfTaskSprint: false,
    })).toBe(false)
  })

  it('denies inserting a sprint task when sprint_id is null and user is not Programs or admin', () => {
    expect(tasksInsertCheck({
      role: 'member',
      isProgramsMember: false,
      taskSprintId: null,
      isTeamMemberOfTaskSprint: false,
    })).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// tasks_insert WITH CHECK — Non-Programs behaviour unchanged
// ────────────────────────────────────────────────────────────────────────────
describe('tasks_insert WITH CHECK — non-Programs behaviour', () => {
  it('denies a plain member with no sprint connection', () => {
    expect(tasksInsertCheck({
      role: 'member',
      isProgramsMember: false,
      taskSprintId: null,
      isTeamMemberOfTaskSprint: false,
    })).toBe(false)
  })

  it('denies a dept_lead who is not Programs and not on the sprint team', () => {
    expect(tasksInsertCheck({
      role: 'dept_lead',
      isProgramsMember: false,
      taskSprintId: 'sprint-A',
      isTeamMemberOfTaskSprint: false,
    })).toBe(false)
  })
})
