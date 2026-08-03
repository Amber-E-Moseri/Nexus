import { useEffect, useMemo, useState } from 'react'
import { isStaleCompletedTask, isTaskCompleted } from '../../../lib/taskStatuses'

export const EMPTY_FILTERS = {
  status: [],
  priority: [],
  assigneeId: null,
  dueDateRange: null, // 'overdue' | 'today' | 'this_week' | null
  dateRange: { startDate: null, endDate: null },
  taskType: [],
  source: [],
  hasComments: false,
  hasDependencies: false,
  showDone: true,
  // "Date closed" filter — independent of showDone. rangeDays: null means
  // "Any time" (inert, never checked). A caller opts in by seeding a
  // non-null default via useTaskFilters' `defaultDateClosedRangeDays`
  // option; callers that never do keep this at null forever, so the check
  // in applyTaskFilters below is a no-op for them.
  dateClosedOperator: 'is', // 'is' | 'is_not'
  dateClosedRangeDays: null, // null | 7 | 14 | 30 | 'custom'
  dateClosedCustom: { startDate: null, endDate: null }, // for 'custom' range
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

// Pure filter predicate shared by the hook and by pages that own their
// filter state directly (e.g. MyTasks, which expands status ids across
// same-named statuses before applying).
export function applyTaskFilters(tasks = [], filters = EMPTY_FILTERS) {
  return tasks.filter((task) => {
    if (filters.status.length && !filters.status.includes(task.status_id)) return false
    if (filters.priority.length && !filters.priority.includes(task.priority)) return false
    if (filters.assigneeId && task.assignee_id !== filters.assigneeId) return false
    if (filters.taskType.length && !filters.taskType.includes(task.task_type)) return false
    if (filters.source.length && !filters.source.includes(task.source ?? 'manual')) return false
    if (filters.hasComments && (task.comments?.[0]?.count ?? 0) < 1) return false
    if (filters.hasDependencies && (task.dependencies?.[0]?.count ?? 0) < 1) return false
    if (!filters.showDone && isTaskCompleted(task)) return false
    if (isTaskCompleted(task)) {
      if (filters.dateClosedRangeDays === 'custom') {
        // Custom date range for date closed
        if (filters.dateClosedCustom?.startDate || filters.dateClosedCustom?.endDate) {
          const completed = task.completed_at ? startOfDay(new Date(task.completed_at)) : null
          if (!completed) return filters.dateClosedOperator === 'is'

          let isInRange = true
          if (filters.dateClosedCustom.startDate) {
            const start = startOfDay(new Date(filters.dateClosedCustom.startDate))
            isInRange = isInRange && completed >= start
          }
          if (filters.dateClosedCustom.endDate) {
            const end = startOfDay(new Date(filters.dateClosedCustom.endDate))
            isInRange = isInRange && completed <= end
          }

          const matches = filters.dateClosedOperator === 'is_not' ? !isInRange : isInRange
          if (!matches) return false
        }
      } else if (filters.dateClosedRangeDays) {
        // Preset range (7, 14, 30 days)
        const isOutsideRange = isStaleCompletedTask(task, filters.dateClosedRangeDays)
        const matches = filters.dateClosedOperator === 'is_not' ? isOutsideRange : !isOutsideRange
        if (!matches) return false
      }
    }

    if (filters.dueDateRange) {
      const today = startOfDay(new Date())
      const due = task.due_date ? startOfDay(new Date(task.due_date + 'T00:00:00')) : null

      if (filters.dueDateRange === 'overdue') {
        if (!due || due >= today) return false
      } else if (filters.dueDateRange === 'today') {
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        if (!due || due < today || due >= tomorrow) return false
      } else if (filters.dueDateRange === 'this_week') {
        const weekEnd = new Date(today)
        weekEnd.setDate(weekEnd.getDate() + 7)
        if (!due || due < today || due >= weekEnd) return false
      }
    }

    if (filters.dateRange?.startDate || filters.dateRange?.endDate) {
      const due = task.due_date ? startOfDay(new Date(task.due_date + 'T00:00:00')) : null
      if (!due) return false
      if (filters.dateRange.startDate) {
        const start = startOfDay(new Date(filters.dateRange.startDate + 'T00:00:00'))
        if (due < start) return false
      }
      if (filters.dateRange.endDate) {
        const end = startOfDay(new Date(filters.dateRange.endDate + 'T00:00:00'))
        if (due > end) return false
      }
    }

    return true
  })
}

function readPersistedDateClosedFilter(persistKey, defaultDateClosedRangeDays) {
  const base = { operator: 'is', rangeDays: defaultDateClosedRangeDays, custom: { startDate: null, endDate: null } }
  if (!persistKey) return base
  try {
    const stored = localStorage.getItem(persistKey)
    if (!stored) return base
    const parsed = JSON.parse(stored)
    const rangeDays = parsed.rangeDays === null ? null : (parsed.rangeDays === 'custom' ? 'custom' : Number(parsed.rangeDays)) || defaultDateClosedRangeDays
    return {
      operator: parsed.operator === 'is_not' ? 'is_not' : 'is',
      rangeDays,
      custom: rangeDays === 'custom' ? (parsed.custom || { startDate: null, endDate: null }) : { startDate: null, endDate: null },
    }
  } catch {
    return base
  }
}

export function useTaskFilters(tasks = [], options = {}) {
  const { defaultDateClosedRangeDays = null, persistKey } = options

  const [filters, setFilters] = useState(() => {
    const { operator, rangeDays, custom } = readPersistedDateClosedFilter(persistKey, defaultDateClosedRangeDays)
    return { ...EMPTY_FILTERS, dateClosedOperator: operator, dateClosedRangeDays: rangeDays, dateClosedCustom: custom }
  })

  useEffect(() => {
    if (!persistKey) return
    try {
      localStorage.setItem(persistKey, JSON.stringify({
        operator: filters.dateClosedOperator,
        rangeDays: filters.dateClosedRangeDays,
        custom: filters.dateClosedCustom,
      }))
    } catch {
      // Ignore write failures (e.g. private browsing) — persistence is a nicety, not a requirement.
    }
  }, [persistKey, filters.dateClosedOperator, filters.dateClosedRangeDays, filters.dateClosedCustom])

  const filtered = useMemo(() => applyTaskFilters(tasks, filters), [tasks, filters])

  function clearFilters() {
    setFilters((prev) => ({
      ...EMPTY_FILTERS,
      dateClosedOperator: prev.dateClosedOperator,
      dateClosedRangeDays: prev.dateClosedRangeDays,
      dateClosedCustom: prev.dateClosedCustom,
    }))
  }

  function hasActiveFilters() {
    return (
      filters.status.length > 0 ||
      filters.priority.length > 0 ||
      filters.assigneeId !== null ||
      filters.dueDateRange !== null ||
      (filters.dateRange?.startDate !== null || filters.dateRange?.endDate !== null) ||
      filters.taskType.length > 0 ||
      filters.source.length > 0 ||
      filters.dateClosedRangeDays !== defaultDateClosedRangeDays ||
      (filters.dateClosedRangeDays !== null && filters.dateClosedOperator !== 'is') ||
      (filters.dateClosedRangeDays === 'custom' && (filters.dateClosedCustom?.startDate !== null || filters.dateClosedCustom?.endDate !== null)) ||
      filters.hasComments ||
      filters.hasDependencies ||
      !filters.showDone
    )
  }

  return { filters, setFilters, filtered, clearFilters, hasActiveFilters }
}
