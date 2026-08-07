/**
 * Nova project analysis — risk signal evaluation logic.
 *
 * Re-implements the exact predicates from
 * supabase/functions/nova-orchestrate/intents/projectAnalysis.ts
 * (evaluateRisks) as pure JS so they can be asserted without a Deno runtime.
 */

import { describe, it, expect } from 'vitest'

const TODAY = '2026-08-07'
const YESTERDAY = '2026-08-06'
const NINE_DAYS_AGO = '2026-07-29'
const IN_2_DAYS = '2026-08-09'
const IN_4_DAYS = '2026-08-11'

function todayISO() { return TODAY }
function daysAgoISO(n) {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// Mirrors evaluateRisks() from projectAnalysis.ts
function evaluateRisks(sprint, tasks) {
  const signals = []
  const today = todayISO()
  const sevenDaysAgo = daysAgoISO(7)
  const now = new Date().toISOString()

  const isIncomplete = (t) => {
    const cat = t.status_definition?.category
    return cat !== 'completed' && cat !== 'cancelled'
  }
  const incomplete = tasks.filter(isIncomplete)

  for (const t of incomplete) {
    if (t.due_date && t.due_date < today) {
      signals.push({
        code: 'TASK_OVERDUE',
        severity: t.priority === 'urgent' ? 'critical' : t.priority === 'high' ? 'high' : 'medium',
        entityType: 'task', entityId: t.id, entityLabel: t.title,
        evidenceIds: [t.id], detectedAt: now,
      })
    }
    if (!t.assignee) {
      signals.push({
        code: 'MISSING_ASSIGNEE', severity: 'medium',
        entityType: 'task', entityId: t.id, entityLabel: t.title,
        evidenceIds: [t.id], detectedAt: now,
      })
    }
    if (!t.due_date && t.priority === 'urgent') {
      signals.push({
        code: 'MISSING_DUE_DATE', severity: 'medium',
        entityType: 'task', entityId: t.id, entityLabel: t.title,
        evidenceIds: [t.id], detectedAt: now,
      })
    }
    if (t.updated_at && t.updated_at < sevenDaysAgo && t.created_at < sevenDaysAgo) {
      signals.push({
        code: 'NO_UPDATE_7_DAYS', severity: 'low',
        entityType: 'task', entityId: t.id, entityLabel: t.title,
        evidenceIds: [t.id], detectedAt: now,
      })
    }
  }

  const assigneeLoad = {}
  for (const t of incomplete) {
    if (t.assignee) {
      const id = t.assignee.id
      if (!assigneeLoad[id]) assigneeLoad[id] = { name: t.assignee.name, count: 0, taskIds: [] }
      assigneeLoad[id].count++
      assigneeLoad[id].taskIds.push(t.id)
    }
  }
  for (const [id, info] of Object.entries(assigneeLoad)) {
    if (info.count > 8) {
      signals.push({
        code: 'OVERLOADED_ASSIGNEE',
        severity: info.count > 15 ? 'high' : 'medium',
        entityType: 'member', entityId: id, entityLabel: info.name,
        evidenceIds: info.taskIds.slice(0, 5), detectedAt: now,
      })
    }
  }

  if (sprint?.end_date) {
    const daysLeft = Math.ceil(
      (new Date(sprint.end_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24),
    )
    const overdueCount = signals.filter((s) => s.code === 'TASK_OVERDUE').length
    if (daysLeft <= 3 && overdueCount > 0) {
      signals.push({
        code: 'MILESTONE_AT_RISK', severity: 'high',
        entityType: 'sprint', entityId: sprint.id, entityLabel: sprint.name,
        evidenceIds: signals.filter((s) => s.code === 'TASK_OVERDUE').map((s) => s.entityId),
        detectedAt: now,
      })
    }
  }

  return signals
}

function makeTask(overrides = {}) {
  return {
    id: 'task-1',
    title: 'Test task',
    priority: 'normal',
    due_date: null,
    created_at: TODAY,
    updated_at: TODAY,
    assignee: { id: 'user-1', name: 'Alice' },
    status_definition: { name: 'In Progress', category: 'in_progress' },
    ...overrides,
  }
}

// ─── TASK_OVERDUE ─────────────────────────────────────────────────────────────

describe('TASK_OVERDUE signals', () => {
  it('fires for an incomplete task with a past due_date', () => {
    const tasks = [makeTask({ due_date: YESTERDAY })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'TASK_OVERDUE')).toBe(true)
  })

  it('does not fire for a task due in the future', () => {
    const tasks = [makeTask({ due_date: IN_4_DAYS })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'TASK_OVERDUE')).toBe(false)
  })

  it('does not fire for a completed task even with a past due_date', () => {
    const tasks = [makeTask({ due_date: YESTERDAY, status_definition: { category: 'completed' } })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'TASK_OVERDUE')).toBe(false)
  })

  it('sets severity=critical for urgent overdue tasks', () => {
    const tasks = [makeTask({ due_date: YESTERDAY, priority: 'urgent' })]
    const signals = evaluateRisks(null, tasks)
    const overdue = signals.find(s => s.code === 'TASK_OVERDUE')
    expect(overdue?.severity).toBe('critical')
  })

  it('sets severity=high for high-priority overdue tasks', () => {
    const tasks = [makeTask({ due_date: YESTERDAY, priority: 'high' })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.find(s => s.code === 'TASK_OVERDUE')?.severity).toBe('high')
  })

  it('sets severity=medium for normal overdue tasks', () => {
    const tasks = [makeTask({ due_date: YESTERDAY, priority: 'normal' })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.find(s => s.code === 'TASK_OVERDUE')?.severity).toBe('medium')
  })
})

// ─── MISSING_ASSIGNEE ─────────────────────────────────────────────────────────

describe('MISSING_ASSIGNEE signals', () => {
  it('fires for an incomplete task with no assignee', () => {
    const tasks = [makeTask({ assignee: null })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'MISSING_ASSIGNEE')).toBe(true)
  })

  it('does not fire when the task is assigned', () => {
    const tasks = [makeTask({ assignee: { id: 'u1', name: 'Bob' } })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'MISSING_ASSIGNEE')).toBe(false)
  })

  it('does not fire for cancelled tasks with no assignee', () => {
    const tasks = [makeTask({ assignee: null, status_definition: { category: 'cancelled' } })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'MISSING_ASSIGNEE')).toBe(false)
  })
})

// ─── MISSING_DUE_DATE ─────────────────────────────────────────────────────────

describe('MISSING_DUE_DATE signals', () => {
  it('fires for an urgent task with no due_date', () => {
    const tasks = [makeTask({ due_date: null, priority: 'urgent' })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'MISSING_DUE_DATE')).toBe(true)
  })

  it('does not fire for a normal-priority task with no due_date', () => {
    const tasks = [makeTask({ due_date: null, priority: 'normal' })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'MISSING_DUE_DATE')).toBe(false)
  })

  it('does not fire for an urgent task that has a due_date', () => {
    const tasks = [makeTask({ due_date: IN_4_DAYS, priority: 'urgent' })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'MISSING_DUE_DATE')).toBe(false)
  })
})

// ─── NO_UPDATE_7_DAYS ─────────────────────────────────────────────────────────

describe('NO_UPDATE_7_DAYS signals', () => {
  it('fires when both created_at and updated_at are older than 7 days', () => {
    const tasks = [makeTask({ created_at: NINE_DAYS_AGO, updated_at: NINE_DAYS_AGO })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'NO_UPDATE_7_DAYS')).toBe(true)
  })

  it('does not fire when task was recently updated', () => {
    const tasks = [makeTask({ created_at: NINE_DAYS_AGO, updated_at: TODAY })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'NO_UPDATE_7_DAYS')).toBe(false)
  })

  it('does not fire for a task created less than 7 days ago', () => {
    const tasks = [makeTask({ created_at: YESTERDAY, updated_at: YESTERDAY })]
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'NO_UPDATE_7_DAYS')).toBe(false)
  })
})

// ─── OVERLOADED_ASSIGNEE ──────────────────────────────────────────────────────

describe('OVERLOADED_ASSIGNEE signals', () => {
  function makeTasksForUser(n, userId = 'u1', name = 'Alice') {
    return Array.from({ length: n }, (_, i) => makeTask({
      id: `task-${i}`,
      assignee: { id: userId, name },
    }))
  }

  it('fires when an assignee has more than 8 incomplete tasks', () => {
    const tasks = makeTasksForUser(9)
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'OVERLOADED_ASSIGNEE')).toBe(true)
  })

  it('does not fire at exactly 8 tasks', () => {
    const tasks = makeTasksForUser(8)
    const signals = evaluateRisks(null, tasks)
    expect(signals.some(s => s.code === 'OVERLOADED_ASSIGNEE')).toBe(false)
  })

  it('sets severity=high when assignee has more than 15 tasks', () => {
    const tasks = makeTasksForUser(16)
    const signals = evaluateRisks(null, tasks)
    const sig = signals.find(s => s.code === 'OVERLOADED_ASSIGNEE')
    expect(sig?.severity).toBe('high')
  })

  it('sets severity=medium when assignee has 9-15 tasks', () => {
    const tasks = makeTasksForUser(10)
    const signals = evaluateRisks(null, tasks)
    expect(signals.find(s => s.code === 'OVERLOADED_ASSIGNEE')?.severity).toBe('medium')
  })
})

// ─── MILESTONE_AT_RISK ────────────────────────────────────────────────────────

describe('MILESTONE_AT_RISK signals', () => {
  const sprint = { id: 'sprint-1', name: 'Sprint August', end_date: IN_2_DAYS }
  const overdueTask = makeTask({ due_date: YESTERDAY })

  it('fires when sprint ends in ≤3 days and there are overdue tasks', () => {
    const signals = evaluateRisks(sprint, [overdueTask])
    expect(signals.some(s => s.code === 'MILESTONE_AT_RISK')).toBe(true)
  })

  it('does not fire when sprint ends in >3 days even with overdue tasks', () => {
    const farSprint = { ...sprint, end_date: IN_4_DAYS }
    const signals = evaluateRisks(farSprint, [overdueTask])
    expect(signals.some(s => s.code === 'MILESTONE_AT_RISK')).toBe(false)
  })

  it('does not fire when sprint ends soon but there are no overdue tasks', () => {
    const cleanTask = makeTask({ due_date: IN_4_DAYS })
    const signals = evaluateRisks(sprint, [cleanTask])
    expect(signals.some(s => s.code === 'MILESTONE_AT_RISK')).toBe(false)
  })

  it('does not fire when no sprint is present', () => {
    const signals = evaluateRisks(null, [overdueTask])
    expect(signals.some(s => s.code === 'MILESTONE_AT_RISK')).toBe(false)
  })

  it('includes overdue task IDs in evidenceIds', () => {
    const signals = evaluateRisks(sprint, [overdueTask])
    const sig = signals.find(s => s.code === 'MILESTONE_AT_RISK')
    expect(sig?.evidenceIds).toContain(overdueTask.id)
  })
})

// ─── zero signals ─────────────────────────────────────────────────────────────

describe('zero signals', () => {
  it('returns no signals for a healthy task (assigned, future due date, recently updated)', () => {
    const tasks = [makeTask({ due_date: IN_4_DAYS })]
    const signals = evaluateRisks(null, tasks)
    expect(signals).toHaveLength(0)
  })

  it('returns no signals for an empty task list', () => {
    expect(evaluateRisks(null, [])).toHaveLength(0)
  })
})
