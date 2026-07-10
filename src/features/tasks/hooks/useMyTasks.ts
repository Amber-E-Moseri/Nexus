import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../context/ToastContext'
import { supabase } from '../../../lib/supabase'
import { normalizeTaskRows, isTaskCompleted } from '../../../lib/taskStatuses'

interface UseMyTasksFilter {
  space?: string | null
  status?: string[] | null
  assignee?: string | null
  tag?: string | null
  priority?: string[] | null
  dateRange?: { startDate: string | null; endDate: string | null } | null
  dueDateRange?: string | null
  taskType?: string[] | null
  source?: string[] | null
  showDone?: boolean
  hasComments?: boolean
  hasDependencies?: boolean
}

interface UseMyTasksReturn {
  tasks: any[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Unified hook for My Tasks and Planner pages
 * Fetches all personal tasks: created_by, assigned_to, or owned spaces
 * Includes real-time sync
 */
const TASK_SELECT = `
  id, title, description, priority, status, status_id, due_date, created_at,
  department_id, assignee_id, created_by, task_type, sprint_id, list_id,
  source, meeting_id, parent_task_id, completed_at,
  subtask_count:tasks!parent_task_id(count),
  status_definition:task_status_definitions!status_id(
    id, name, color, category, legacy_key, department_id
  ),
  assignee:users!assignee_id(id, name, avatar_url),
  creator:users!created_by(id, name),
  space:departments(id, name, color),
  comments:task_comments(count),
  files:task_files(count),
  dependencies:task_dependencies!task_id(count)
`

export function useMyTasks(userId: string, filters?: UseMyTasksFilter, dateRange?: [Date, Date]): UseMyTasksReturn {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Create a stable dependency key from filter values to avoid unnecessary re-renders
  const filterKey = useMemo(() => {
    const key = {
      status: filters?.status,
      assignee: filters?.assignee,
      space: filters?.space,
      dateRange: filters?.dateRange,
      priority: filters?.priority,
      taskType: filters?.taskType,
      source: filters?.source,
      dueDateRange: filters?.dueDateRange,
      showDone: filters?.showDone,
      hasComments: filters?.hasComments,
      hasDependencies: filters?.hasDependencies,
    }
    return JSON.stringify(key)
  }, [filters])

  // Fetch tasks
  const load = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    setError(null)

    try {
      // Build base query: created_by OR assigned_to OR space owner
      let query = supabase.from('tasks').select(TASK_SELECT)

      // Filter by user
      query = query.or(`created_by.eq.${userId},assignee_id.eq.${userId}`)

      // Filter by date range if provided
      const actualDateRange = dateRange || filters?.dateRange
      if (actualDateRange) {
        const [start, end] = actualDateRange
        const startISO = start.toISOString().split('T')[0]
        const endISO = end.toISOString().split('T')[0]
        query = query.gte('due_date', startISO).lte('due_date', endISO)
      }

      // Order by due date, then creation
      query = query.order('due_date', { ascending: true }).order('created_at', { ascending: false })

      const { data: tasksData, error: tasksError } = await query

      if (tasksError) throw tasksError

      // Normalize task rows (status handling, etc.)
      const normalizedTasks = normalizeTaskRows(tasksData || [])

      // Apply client-side filters if needed
      let filtered = normalizedTasks

      if (filters?.status && filters.status.length > 0) {
        filtered = filtered.filter((t) => filters.status.includes(t.status_id))
      }
      if (filters?.priority && filters.priority.length > 0) {
        filtered = filtered.filter((t) => filters.priority.includes(t.priority))
      }
      if (filters?.assignee) {
        filtered = filtered.filter((t) => t.assignee_id === filters.assignee)
      }
      if (filters?.taskType && filters.taskType.length > 0) {
        filtered = filtered.filter((t) => filters.taskType.includes(t.task_type))
      }
      if (filters?.source && filters.source.length > 0) {
        filtered = filtered.filter((t) => filters.source.includes(t.source ?? 'manual'))
      }
      if (filters?.dueDateRange) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayISO = today.toISOString().split('T')[0]
        const weekStart = new Date(today)
        weekStart.setDate(weekStart.getDate() - weekStart.getDay())
        const weekStartISO = weekStart.toISOString().split('T')[0]
        const weekEndISO = new Date(weekStart)
        weekEndISO.setDate(weekEndISO.getDate() + 6)
        const weekEndDateISO = weekEndISO.toISOString().split('T')[0]

        filtered = filtered.filter((t) => {
          if (!t.due_date) return false
          const dueDateStr = t.due_date.slice(0, 10)
          if (filters.dueDateRange === 'overdue') return dueDateStr < todayISO && !isTaskCompleted(t)
          if (filters.dueDateRange === 'today') return dueDateStr === todayISO
          if (filters.dueDateRange === 'this_week') return dueDateStr >= weekStartISO && dueDateStr <= weekEndDateISO
          return true
        })
      }
      if (filters?.dateRange?.startDate || filters?.dateRange?.endDate) {
        const startISO = filters.dateRange.startDate || '0000-01-01'
        const endISO = filters.dateRange.endDate || '9999-12-31'
        filtered = filtered.filter((t) => {
          if (!t.due_date) return false
          const dueDateStr = t.due_date.slice(0, 10)
          return dueDateStr >= startISO && dueDateStr <= endISO
        })
      }
      if (filters?.showDone === false) {
        filtered = filtered.filter((t) => !isTaskCompleted(t))
      }
      if (filters?.hasComments) {
        filtered = filtered.filter((t) => (t.comments?.[0]?.count ?? 0) > 0)
      }
      if (filters?.hasDependencies) {
        filtered = filtered.filter((t) => (t.dependencies?.[0]?.count ?? 0) > 0)
      }
      setTasks(filtered)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load tasks')
      setError(error)
      showToast(error.message, { tone: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [userId, filters, dateRange, showToast])

  // Initial load + refetch when filters change
  useEffect(() => {
    load()
  }, [userId, filterKey, dateRange])

  // Real-time sync for tasks
  // Subscribe only to tasks assigned to this user. We do not subscribe to
  // created_by because delegated tasks (created by user, assigned to someone
  // else) are excluded from My Tasks — patching them in would contradict the
  // fetch query.
  useEffect(() => {
    if (!userId) return

    const handlePayload = (payload) => {
      if (payload.eventType === 'DELETE') {
        setTasks((prev) => prev.filter((t) => t.id !== payload.old.id))
      } else if (payload.eventType === 'INSERT') {
        // Realtime payload has only flat fields; re-fetch to get relations
        load()
      } else if (payload.eventType === 'UPDATE') {
        setTasks((prev) =>
          prev.map((t) => (t.id === payload.new.id ? { ...t, ...payload.new } : t)),
        )
      }
    }

    const assignedSubscription = supabase
      .channel(`tasks:assignee_id:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assignee_id=eq.${userId}`,
        },
        handlePayload,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(assignedSubscription)
    }
  }, [userId, load])

  return {
    tasks,
    isLoading,
    error,
    refetch: load,
  }
}
