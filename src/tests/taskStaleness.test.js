import { describe, test, expect } from 'vitest'
import { isStaleCompletedTask, STATUS_CATEGORIES } from '../lib/taskStatuses'
import { applyTaskFilters, EMPTY_FILTERS } from '../features/tasks/hooks/useTaskFilters'

const THRESHOLD_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

function completedTask(completedAt) {
  return {
    status_category: STATUS_CATEGORIES.COMPLETED,
    completed_at: completedAt,
  }
}

describe('isStaleCompletedTask', () => {
  test('completed task well past the threshold is stale', () => {
    expect(isStaleCompletedTask(completedTask(daysAgo(30)), THRESHOLD_DAYS)).toBe(true)
  })

  test('completed task within the threshold is not stale', () => {
    expect(isStaleCompletedTask(completedTask(daysAgo(1)), THRESHOLD_DAYS)).toBe(false)
  })

  test('completed task exactly at the threshold boundary is not stale (strictly greater-than only)', () => {
    expect(isStaleCompletedTask(completedTask(daysAgo(THRESHOLD_DAYS)), THRESHOLD_DAYS)).toBe(false)
  })

  test('completed task with missing completed_at fails open (not stale)', () => {
    expect(isStaleCompletedTask(completedTask(null), THRESHOLD_DAYS)).toBe(false)
    expect(isStaleCompletedTask(completedTask(undefined), THRESHOLD_DAYS)).toBe(false)
  })

  test('completed task with a malformed completed_at fails open (not stale)', () => {
    expect(isStaleCompletedTask(completedTask('not-a-real-date'), THRESHOLD_DAYS)).toBe(false)
  })

  test('non-completed category tasks are never stale, regardless of completed_at', () => {
    const oldTimestamp = daysAgo(30)
    expect(isStaleCompletedTask({ status_category: STATUS_CATEGORIES.OPEN, completed_at: oldTimestamp }, THRESHOLD_DAYS)).toBe(false)
    expect(isStaleCompletedTask({ status_category: STATUS_CATEGORIES.IN_PROGRESS, completed_at: oldTimestamp }, THRESHOLD_DAYS)).toBe(false)
    expect(isStaleCompletedTask({ status_category: STATUS_CATEGORIES.CANCELLED, completed_at: oldTimestamp }, THRESHOLD_DAYS)).toBe(false)
  })
})

describe('applyTaskFilters — dateClosedOperator/dateClosedRangeDays composition', () => {
  function task(id, { category = STATUS_CATEGORIES.COMPLETED, completedAt } = {}) {
    return { id, status_category: category, completed_at: completedAt }
  }

  test('dateClosedRangeDays: null filters out nothing, regardless of operator', () => {
    const tasks = [task('recent', { completedAt: daysAgo(1) }), task('old', { completedAt: daysAgo(30) })]
    const filtersIs = { ...EMPTY_FILTERS, dateClosedOperator: 'is', dateClosedRangeDays: null }
    const filtersIsNot = { ...EMPTY_FILTERS, dateClosedOperator: 'is_not', dateClosedRangeDays: null }
    expect(applyTaskFilters(tasks, filtersIs).map((t) => t.id)).toEqual(['recent', 'old'])
    expect(applyTaskFilters(tasks, filtersIsNot).map((t) => t.id)).toEqual(['recent', 'old'])
  })

  test('operator "is" with a 7-day range keeps recently-closed, filters out older', () => {
    const tasks = [task('recent', { completedAt: daysAgo(1) }), task('old', { completedAt: daysAgo(30) })]
    const filters = { ...EMPTY_FILTERS, dateClosedOperator: 'is', dateClosedRangeDays: 7 }
    expect(applyTaskFilters(tasks, filters).map((t) => t.id)).toEqual(['recent'])
  })

  test('operator "is_not" with a 7-day range inverts the result', () => {
    const tasks = [task('recent', { completedAt: daysAgo(1) }), task('old', { completedAt: daysAgo(30) })]
    const filters = { ...EMPTY_FILTERS, dateClosedOperator: 'is_not', dateClosedRangeDays: 7 }
    expect(applyTaskFilters(tasks, filters).map((t) => t.id)).toEqual(['old'])
  })

  test('open/in-progress tasks are always kept, regardless of operator/range', () => {
    const tasks = [
      task('open', { category: STATUS_CATEGORIES.OPEN, completedAt: null }),
      task('in-progress', { category: STATUS_CATEGORIES.IN_PROGRESS, completedAt: null }),
    ]
    const filters = { ...EMPTY_FILTERS, dateClosedOperator: 'is', dateClosedRangeDays: 7 }
    expect(applyTaskFilters(tasks, filters).map((t) => t.id)).toEqual(['open', 'in-progress'])
  })
})
