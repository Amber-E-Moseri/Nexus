import { describe, expect, test } from 'vitest'
import { computeTimeBlockWarnings, worstSeverity } from '../src/features/planner/lib/warningEngine'

const TODAY = '2026-07-09'

const block = (scheduled_date) => ({ id: 'b1', scheduled_date, scheduled_start_time: '14:00:00', scheduled_end_time: '15:00:00' })
const task = (due_date, title = 'Follow Up Report') => ({ id: 't1', title, due_date })

describe('warningEngine', () => {
  test('no warnings when scheduled before a future due date', () => {
    const warnings = computeTimeBlockWarnings({ block: block('2026-07-10'), task: task('2026-07-12'), todayISO: TODAY })
    expect(warnings).toEqual([])
  })

  test('no warnings when the task has no due date', () => {
    const warnings = computeTimeBlockWarnings({ block: block('2026-07-10'), task: task(null), todayISO: TODAY })
    expect(warnings).toEqual([])
  })

  test('type 1 (yellow) when scheduled after due date', () => {
    const warnings = computeTimeBlockWarnings({ block: block('2026-07-12'), task: task('2026-07-10'), todayISO: TODAY })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].type).toBe(1)
    expect(warnings[0].severity).toBe('yellow')
  })

  test('overdue task scheduled in the future gets red warning with "already overdue" phrasing', () => {
    const warnings = computeTimeBlockWarnings({ block: block('2026-07-12'), task: task('2026-07-07'), todayISO: TODAY })
    const overdue = warnings.find((w) => w.type === 4)
    expect(overdue).toBeDefined()
    expect(overdue.severity).toBe('red')
    expect(overdue.message).toContain('already overdue')
  })

  test('overdue task scheduled today gets the plain overdue message', () => {
    const warnings = computeTimeBlockWarnings({ block: block(TODAY), task: task('2026-07-07'), todayISO: TODAY })
    const overdue = warnings.find((w) => w.type === 4)
    expect(overdue).toBeDefined()
    expect(overdue.message).toContain('is overdue')
  })

  test('type 3 fires once on parent/subtask due mismatch', () => {
    const subtasks = [
      { id: 's1', title: 'Research', due_date: '2026-07-10' },
      { id: 's2', title: 'Outline', due_date: '2026-07-11' },
    ]
    const warnings = computeTimeBlockWarnings({
      block: block('2026-07-11'),
      task: task('2026-07-13', 'Prep Sermon'),
      subtasks,
      todayISO: TODAY,
    })
    const mismatches = warnings.filter((w) => w.type === 3)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0].message).toContain('Research')
  })

  test('type 3 skipped when subtask has no due date', () => {
    const warnings = computeTimeBlockWarnings({
      block: block('2026-07-10'),
      task: task('2026-07-13'),
      subtasks: [{ id: 's1', title: 'Research', due_date: null }],
      todayISO: TODAY,
    })
    expect(warnings.filter((w) => w.type === 3)).toHaveLength(0)
  })

  test('worst severity wins and warnings sort worst-first', () => {
    // Overdue AND scheduled after due: type 1 (yellow) + type 4 (red)
    const warnings = computeTimeBlockWarnings({ block: block('2026-07-12'), task: task('2026-07-07'), todayISO: TODAY })
    expect(warnings.length).toBeGreaterThanOrEqual(2)
    expect(warnings[0].severity).toBe('red')
    expect(worstSeverity(warnings)).toBe('red')
  })
})
