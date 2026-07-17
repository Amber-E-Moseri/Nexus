import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import { supabase } from '../../../lib/supabase'
import { normalizeTaskRows, isTaskCompleted, isTaskActionable } from '../../../lib/taskStatuses'

// Quick-view scope (sidebar shortcut). Assignee-only — delegated tasks
// (created for someone else) are excluded, which matches the realtime
// subscription below, so the scoped view stays fully live.
// - 'today_tomorrow': assigned tasks due today or tomorrow (local timezone),
//   completed/cancelled excluded.
export type MyTasksScope = 'today_tomorrow'

interface UseMyTasksFilter {
  scope?: MyTasksScope | null
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
  optimisticStatusUpdate: (taskId: string, newStatus: any) => void
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

function toDateOnly(value: Date | string | null | undefined) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().split('T')[0]
  return value.slice(0, 10)
}

// Local-timezone date string — toISOString() would shift to UTC and flip the
// day near midnight for users west of Greenwich.
export function localDateOnly(date: Date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function localTomorrowDateOnly(date: Date = new Date()) {
  const tomorrow = new Date(date)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return localDateOnly(tomorrow)
}

export function useMyTasks(userId: string, filters?: UseMyTasksFilter, dateRange?: [Date, Date]): UseMyTasksReturn {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Optimistically update a single task's status without triggering a loading state.
  const optimisticStatusUpdate = useCallback((taskId: string, newStatus: any) => {
    setTasks((prev) => prev.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status: newStatus.legacy_key ?? t.status,
            status_id: newStatus.id,
            status_definition: newStatus,
            status_name: newStatus.name ?? t.status_name,
            status_color: newStatus.color ?? t.status_color,
            status_category: newStatus.category ?? t.status_category,
          }
        : t,
    ))
  }, [])

  // Create a stable dependency key from filter values to avoid unnecessary re-renders
  const filterKey = useMemo(() => {
    const key = {
      scope: filters?.scope,
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

  // Fetch tasks. Pass silent=true to refresh in the background without showing
  // a loading spinner (used by the realtime UPDATE handler).
  const load = useCallback(async (silent = false) => {
    if (!userId) return
    if (!silent) setIsLoading(true)
    setError(null)

    try {
      // Build base query: created_by OR assigned_to OR space owner
      let query = supabase.from('tasks').select(TASK_SELECT).is('deleted_at', null)

      // Filter by user. Quick-view scopes are assignee-only; the default view
      // also includes tasks the user created (for the Delegated tab).
      if (filters?.scope) {
        query = query.eq('assignee_id', userId)
      } else {
        query = query.or(`created_by.eq.${userId},assignee_id.eq.${userId}`)
      }

      if (filters?.scope === 'today_tomorrow') {
        query = query.gte('due_date', localDateOnly()).lte('due_date', localTomorrowDateOnly())
      }

      // Filter by date range if provided. The hook arg is a Date tuple; filters.dateRange is a form object.
      if (dateRange) {
        const [start, end] = dateRange
        const startISO = toDateOnly(start)
        const endISO = toDateOnly(end)
        if (startISO) query = query.gte('due_date', startISO)
        if (endISO) query = query.lte('due_date', endISO)
      } else if (filters?.dateRange?.startDate || filters?.dateRange?.endDate) {
        const startISO = toDateOnly(filters.dateRange.startDate)
        const endISO = toDateOnly(filters.dateRange.endDate)
        if (startISO) query = query.gte('due_date', startISO)
        if (endISO) query = query.lte('due_date', endISO)
      }

      // Order by due date, then creation
      query = query.order('due_date', { ascending: true }).order('created_at', { ascending: false })

      const { data: tasksData, error: tasksError } = await query

      if (tasksError) throw tasksError

      // Normalize task rows (status handling, etc.)
      const normalizedTasks = normalizeTaskRows(tasksData || [])

      // Apply client-side filters if needed
      let filtered = normalizedTasks

      if (filters?.scope === 'today_tomorrow') {
        // A completed or cancelled task shouldn't linger in this view
        filtered = filtered.filter((t) => t.due_date && isTaskActionable(t))
      }

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

  const loadRef = useRef(load)

  useEffect(() => {
    loadRef.current = load
  }, [load])

  // Initial load + refetch when filters change
  useEffect(() => {
    load()
  }, [userId, filterKey, dateRange])

  // Real-time sync for tasks
  // Subscribe only to tasks assigned to this user. We do not subscribe to
  // created_by because delegated tasks (created by user, assigned to someone
  // else) are excluded from My Tasks — patching them in would contradict the
  // fetch query. Quick-view scopes are assignee-only, so this filter covers
  // them fully; INSERT/UPDATE re-fetches through load(), which re-applies the
  // scope's server + client filters.
  useEffect(() => {
    if (!userId) return

    const handlePayload = (payload) => {
      if (payload.eventType === 'DELETE') {
        setTasks((prev) => prev.filter((t) => t.id !== payload.old.id))
      } else if (payload.eventType === 'INSERT') {
        loadRef.current()
      } else if (payload.eventType === 'UPDATE') {
        // Silent refresh — don't flash a loading spinner for background updates
        loadRef.current(true)
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
  }, [userId])

  return {
    tasks,
    isLoading,
    error,
    refetch: load,
    optimisticStatusUpdate,
  }
}

interface UseWatchedTasksReturn {
  tasks: any[]
  isLoading: boolean
  refetch: () => Promise<void>
}

/**
 * Tasks the user follows via task_follows — separate from "Mine"/"Delegated" (assignee_id/
 * created_by), since a followed task may belong to another department or another user's
 * personal task the owner explicitly looped this user into. Excludes tasks already covered
 * by assignee_id/created_by to avoid duplicate rows across tabs.
 */
export function useWatchedTasks(userId: string): UseWatchedTasksReturn {
  const [tasks, setTasks] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    try {
      const { data: follows, error: followsError } = await supabase
        .from('task_follows')
        .select('task_id')
        .eq('user_id', userId)

      if (followsError) throw followsError

      const taskIds = (follows ?? []).map((f) => f.task_id)
      if (taskIds.length === 0) {
        setTasks([])
        return
      }

      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .in('id', taskIds)
        .is('deleted_at', null)

      if (tasksError) throw tasksError

      const followedOnly = (tasksData ?? []).filter(
        (t: any) => t.assignee_id !== userId && t.created_by !== userId,
      )
      setTasks(normalizeTaskRows(followedOnly))
    } catch (err) {
      console.error('[useWatchedTasks] Failed to load watched tasks:', err)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`task_follows:user_id:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_follows', filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, load])

  return { tasks, isLoading, refetch: load }
}
