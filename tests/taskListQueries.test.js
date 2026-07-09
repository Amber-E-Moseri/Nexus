/**
 * BLW-01 — task list queries must return counts, not nested arrays.
 * Detail views lazy-load subtasks via getSubtasks().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Chainable Supabase query-builder mock that records every step so tests can
// assert on the generated select strings and filters.
const queries = []

function makeBuilder(capture) {
  const builder = {}
  const methods = [
    'select', 'eq', 'neq', 'is', 'in', 'not', 'or',
    'gte', 'lte', 'order', 'limit', 'single', 'insert', 'update', 'upsert', 'delete',
  ]
  for (const name of methods) {
    builder[name] = (...args) => {
      capture.steps.push([name, ...args])
      return builder
    }
  }
  // Make the builder awaitable at any point in the chain.
  builder.then = (resolve) => resolve({ data: [], error: null, count: 0 })
  return builder
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from(table) {
      const capture = { table, steps: [] }
      queries.push(capture)
      return makeBuilder(capture)
    },
    rpc: async () => ({ data: null, error: null }),
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
  },
}))

const { getDeptTasks, getSprintTasks, getMyTasks, getFlockTasks, getSubtasks } =
  await import('../src/features/tasks/lib/tasks.js')

function selectStringsFor(table) {
  return queries
    .filter((q) => q.table === table)
    .flatMap((q) => q.steps.filter(([m]) => m === 'select').map(([, sel]) => sel))
}

beforeEach(() => {
  queries.length = 0
})

describe('BLW-01: list queries fetch counts, not nested arrays', () => {
  it('getDeptTasks selects subtask/comment/file counts only', async () => {
    await getDeptTasks('dept-1')
    const [sel] = selectStringsFor('tasks')
    expect(sel).toContain('subtask_count:tasks!parent_task_id(count)')
    expect(sel).toContain('comments:task_comments(count)')
    expect(sel).toContain('files:task_files(count)')
    // No eagerly-embedded subtask rows in the list query
    expect(sel).not.toMatch(/subtasks:tasks!parent_task_id\(\s*[^c)]/)
    expect(sel).not.toContain('*')
  })

  it('getSprintTasks selects counts only', async () => {
    await getSprintTasks('sprint-1')
    const [sel] = selectStringsFor('tasks')
    expect(sel).toContain('subtask_count:tasks!parent_task_id(count)')
    expect(sel).not.toMatch(/subtasks:tasks!parent_task_id\(\s*[^c)]/)
  })

  it('getMyTasks selects counts only across all three queries', async () => {
    await getMyTasks('user-1')
    const selects = selectStringsFor('tasks')
    expect(selects.length).toBeGreaterThanOrEqual(2)
    for (const sel of selects) {
      expect(sel).toContain('subtask_count:tasks!parent_task_id(count)')
      expect(sel).not.toMatch(/subtasks:tasks!parent_task_id\(\s*[^c)]/)
    }
  })

  it('getFlockTasks uses explicit columns, not select *', async () => {
    await getFlockTasks('pastor-1')
    const [sel] = selectStringsFor('pastor_members')
    expect(sel).toBeTruthy()
    expect(sel).not.toContain('*')
    expect(sel).toContain('subtask_count:tasks!parent_task_id(count)')
  })
})

describe('BLW-01: subtasks are lazy-loaded per task', () => {
  it('getSubtasks queries by parent_task_id', async () => {
    await getSubtasks('task-1')
    const q = queries.find((entry) => entry.table === 'tasks')
    expect(q).toBeTruthy()
    expect(q.steps).toContainEqual(['eq', 'parent_task_id', 'task-1'])
    const [sel] = selectStringsFor('tasks')
    // Subtask fetch returns row data (not just counts) for the detail view
    expect(sel).toContain('assignee:users!assignee_id')
  })
})
