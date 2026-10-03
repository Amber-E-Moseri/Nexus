/**
 * Revived reminder jobs must only act on actionable work (Phase 0 precheck, 2026-10-02).
 *
 * Findings that motivated this (production, read-only): `due-date-reminders` has created ZERO
 * notifications in its entire history. Its query embedded a relation that does not exist
 * (`status_definition`; the table is `task_status_definitions`), used an embedded-resource filter that
 * never excludes parent rows, ignored deleted/archived tasks, and read its de-duplication key from a
 * column name PostgREST does not return — so, once revived, it would remind about deleted/cancelled
 * tasks and repeat every run. `task-overdue-trigger` had the same de-dup key problem and ignored
 * deleted/archived tasks.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isActionableTask, taskCategory } from '../../supabase/functions/_shared/taskActionable.ts'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

describe('isActionableTask', () => {
  const open = { status_def: { category: 'open' } }
  it.each([
    ['open', open, true],
    ['in progress', { status_def: { category: 'in_progress' } }, true],
    ['no status category resolved (open work with unset status)', { status_def: null }, true],
    ['status embed as array', { status_def: [{ category: 'open' }] }, true],
    ['deleted', { ...open, deleted_at: '2026-09-01T00:00:00Z' }, false],
    ['archived', { ...open, archived_at: '2026-09-01T00:00:00Z' }, false],
    ['completed_at set', { ...open, completed_at: '2026-09-01T00:00:00Z' }, false],
    ['category completed', { status_def: { category: 'completed' } }, false],
    ['category cancelled', { status_def: { category: 'cancelled' } }, false],
    ['cancelled via array embed', { status_def: [{ category: 'cancelled' }] }, false],
    ['deleted AND open', { deleted_at: 'x', status_def: { category: 'open' } }, false],
  ])('%s → %s', (_label, row, expected) => {
    expect(isActionableTask(row as never)).toBe(expected)
  })

  it('taskCategory handles object, array and missing embeds', () => {
    expect(taskCategory({ status_def: { category: 'open' } })).toBe('open')
    expect(taskCategory({ status_def: [{ category: 'completed' }] })).toBe('completed')
    expect(taskCategory({})).toBeNull()
  })
})

describe('due-date-reminders (static)', () => {
  const src = read('supabase/functions/due-date-reminders/index.ts')

  it('uses the real relation and excludes deleted/archived/completed at the database', () => {
    expect(src).toContain('status_def:task_status_definitions!status_id(category)')
    expect(src).not.toMatch(/status_definition!status_id/)
    expect(src).not.toMatch(/\.neq\('status_definition\.category'/)
    for (const col of ['deleted_at', 'archived_at', 'completed_at']) {
      expect(src).toContain(`.is('${col}', null)`)
    }
  })

  it('also applies the shared actionability check (completed / cancelled categories)', () => {
    expect(src).toContain("from '../_shared/taskActionable.ts'")
    expect(src).toMatch(/\.filter\(\(t\) => isActionableTask\(/)
  })

  it('reads the de-duplication key by an explicit alias, not a literal "payload->>task_id" column', () => {
    expect(src).toContain('task_id:payload->>task_id')
    expect(src).not.toMatch(/n\['payload->>task_id'\]/)
    expect(src).toContain('${n.task_id}:${n.user_id}')
  })

  it('keeps overdue tasks that are still open (only non-actionable entities are dropped)', () => {
    expect(src).toContain('.lte(\'due_date\', inThreeDaysStr)')
    expect(src).toContain('.eq(\'due_date\', tomorrowStr)')
  })
})

describe('task-overdue-trigger (static)', () => {
  const src = read('supabase/functions/task-overdue-trigger/index.ts')
  it('de-dup key is read by explicit alias and deleted/archived tasks are excluded', () => {
    expect(src).toContain('task_id:trigger_payload->>task_id')
    expect(src).not.toMatch(/r\['trigger_payload->>task_id'\]/)
    expect(src).toContain(".is('deleted_at', null)")
    expect(src).toContain(".is('archived_at', null)")
    expect(src).toContain("['open', 'in_progress']")
  })
})
