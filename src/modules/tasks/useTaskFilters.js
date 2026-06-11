import { useMemo, useState } from 'react'
import { isTaskCompleted } from '../../lib/taskStatuses'

const EMPTY_FILTERS = {
  status: [],
  priority: [],
  assigneeId: null,
  dueDateRange: null, // 'overdue' | 'today' | 'this_week' | null
  showDone: false,
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function useTaskFilters(tasks = []) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (filters.status.length && !filters.status.includes(task.status_id)) return false
      if (filters.priority.length && !filters.priority.includes(task.priority)) return false
      if (filters.assigneeId && task.assignee_id !== filters.assigneeId) return false
      if (!filters.showDone && isTaskCompleted(task)) return false

      if (filters.dueDateRange) {
        const today = startOfDay(new Date())
        const due = task.due_date ? startOfDay(new Date(task.due_date)) : null

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

      return true
    })
  }, [tasks, filters])

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
  }

  function hasActiveFilters() {
    return (
      filters.status.length > 0 ||
      filters.priority.length > 0 ||
      filters.assigneeId !== null ||
      filters.dueDateRange !== null ||
      filters.showDone
    )
  }

  return { filters, setFilters, filtered, clearFilters, hasActiveFilters }
}
