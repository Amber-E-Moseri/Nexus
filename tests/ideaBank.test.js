/**
 * Idea Bank — data layer tests (src/features/ideaBank/lib/ideaBank.js).
 * Uses an in-memory fake table store so insert/update/select/eq chains
 * behave like a real Supabase client for these self-contained scenarios,
 * following the chainable-builder mock pattern from tests/taskListQueries.test.js.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

let nextId = 1
function makeId() {
  return `id-${nextId++}`
}

const store = {
  idea_bank_items: [],
  tasks: [],
}

function matches(row, filters) {
  return filters.every(([type, field, value]) => {
    if (type === 'eq') return row[field] === value
    if (type === 'is') return value === null ? row[field] === null || row[field] === undefined : row[field] === value
    return true
  })
}

function makeBuilder(table) {
  const filters = []
  let pendingInsert = null
  let pendingUpdate = null
  let wantsSingle = false

  const builder = {
    select() { return builder },
    eq(field, value) { filters.push(['eq', field, value]); return builder },
    is(field, value) { filters.push(['is', field, value]); return builder },
    order() { return builder },
    insert(rows) {
      pendingInsert = Array.isArray(rows) ? rows : [rows]
      return builder
    },
    update(patch) {
      pendingUpdate = patch
      return builder
    },
    delete() {
      pendingUpdate = '__delete__'
      return builder
    },
    single() { wantsSingle = true; return builder },
    then(resolve) {
      resolve(execute())
      return Promise.resolve()
    },
  }

  function execute() {
    if (pendingInsert) {
      const inserted = pendingInsert.map((row) => ({
        id: makeId(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parent_item_id: null,
        status: 'open',
        item_type: 'exploration',
        converted_to_task_id: null,
        ...row,
      }))
      store[table].push(...inserted)
      return { data: wantsSingle ? inserted[0] : inserted, error: null }
    }

    let rows = store[table].filter((row) => matches(row, filters))

    if (pendingUpdate === '__delete__') {
      store[table] = store[table].filter((row) => !matches(row, filters))
      return { data: null, error: null }
    }

    if (pendingUpdate) {
      rows = rows.map((row) => Object.assign(row, pendingUpdate))
      return { data: wantsSingle ? rows[0] : rows, error: null }
    }

    return { data: wantsSingle ? (rows[0] ?? null) : rows, error: null }
  }

  return builder
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from(table) {
      return makeBuilder(table)
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
  },
}))

const { createIdea, getSubIdeas, convertIdeaToTask } =
  await import('../src/features/ideaBank/lib/ideaBank.js')

beforeEach(() => {
  store.idea_bank_items = []
  store.tasks = []
  nextId = 1
})

describe('Idea Bank data layer', () => {
  it('creates an idea, a sub-idea, and returns the sub-idea via getSubIdeas', async () => {
    const parent = await createIdea({
      spaceId: 'space-1',
      title: 'Parent idea',
      itemText: 'Should we explore X?',
      itemType: 'question',
    })
    expect(parent.parent_item_id).toBeNull()

    const child = await createIdea({
      spaceId: 'space-1',
      title: 'Sub idea',
      itemText: 'A follow-up thought',
      itemType: 'exploration',
      parentItemId: parent.id,
    })
    expect(child.parent_item_id).toBe(parent.id)

    const subIdeas = await getSubIdeas(parent.id)
    expect(subIdeas).toHaveLength(1)
    expect(subIdeas[0].id).toBe(child.id)
  })

  it('convertIdeaToTask creates a task, marks the idea resolved, and links converted_to_task_id', async () => {
    const idea = await createIdea({
      spaceId: 'space-1',
      title: 'Ship the thing',
      itemText: 'We should ship it',
      itemType: 'decision_point',
    })

    const { task, idea: updatedIdea } = await convertIdeaToTask(idea.id)

    expect(task.title).toBe('Ship the thing')
    expect(task.department_id).toBe('space-1')
    expect(updatedIdea.status).toBe('resolved')
    expect(updatedIdea.converted_to_task_id).toBe(task.id)
  })
})
