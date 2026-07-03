import { useMemo, useState } from 'react'
import { isTaskCompleted } from '../../../lib/taskStatuses'

const EMPTY_FILTERS = {
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
  milestoneStatus: [],
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
      if (filters.taskType.length && !filters.taskType.includes(task.task_type)) return false
      if (filters.source.length && !filters.source.includes(task.source ?? 'manual')) return false
      if (filters.hasComments && (task.comments?.[0]?.count ?? 0) < 1) return false
      if (filters.hasDependencies && (task.dependencies?.[0]?.count ?? 0) < 1) return false
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

      if (filters.dateRange?.startDate || filters.dateRange?.endDate) {
        const due = task.due_date ? startOfDay(new Date(task.due_date)) : null
        if (!due) return false
        if (filters.dateRange.startDate) {
          const start = startOfDay(new Date(filters.dateRange.startDate))
          if (due < start) return false
        }
        if (filters.dateRange.endDate) {
          const end = startOfDay(new Date(filters.dateRange.endDate))
          if (due > end) return false
        }
      }

      if (filters.milestoneStatus.length > 0) {
        let matchesMilestoneFilter = false
        for (const filter of filters.milestoneStatus) {
          if (filter === 'no_milestone' && !task.milestone_id) {
            matchesMilestoneFilter = true
            break
          }
          if (filter === 'milestone_overdue') {
            const today = startOfDay(new Date())
            if (task.milestone_due_date) {
              const due = startOfDay(new Date(task.milestone_due_date))
              if (due < today) {
                matchesMilestoneFilter = true
                break
              }
            }
          }
          if (filter === 'milestone_today') {
            const today = startOfDay(new Date())
            if (task.milestone_due_date) {
              const due = startOfDay(new Date(task.milestone_due_date))
              const tomorrow = new Date(today)
              tomorrow.setDate(tomorrow.getDate() + 1)
              if (due >= today && due < tomorrow) {
                matchesMilestoneFilter = true
                break
              }
            }
          }
          if (filter === 'milestone_upcoming') {
            const today = startOfDay(new Date())
            if (task.milestone_due_date) {
              const due = startOfDay(new Date(task.milestone_due_date))
              if (due > today) {
                matchesMilestoneFilter = true
                break
              }
            }
          }
        }
        if (!matchesMilestoneFilter) return false
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
      (filters.dateRange?.startDate !== null || filters.dateRange?.endDate !== null) ||
      filters.taskType.length > 0 ||
      filters.source.length > 0 ||
      filters.hasComments ||
      filters.hasDependencies ||
      !filters.showDone ||
      filters.milestoneStatus.length > 0
    )
  }

  return { filters, setFilters, filtered, clearFilters, hasActiveFilters }
}
