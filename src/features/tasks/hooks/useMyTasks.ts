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
  milestoneStatus?: string[] | null
  showDone?: boolean
  hasComments?: boolean
  hasDependencies?: boolean
}

interface UseMyTasksReturn {
  tasks: any[]
  milestones: any[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Unified hook for My Tasks and Planner pages
 * Fetches all personal tasks: created_by, assigned_to, or owned spaces
 * Includes real-time sync for both tasks and milestones
 */
export function useMyTasks(userId: string, filters?: UseMyTasksFilter, dateRange?: [Date, Date]): UseMyTasksReturn {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<any[]>([])
  const [milestones, setMilestones] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const TASK_SELECT = `
    id, title, description, priority, status, status_id, due_date, created_at,
    department_id, assignee_id, created_by, task_type, sprint_id, list_id,
    source, meeting_id,
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

  // Fetch tasks and milestones
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

      // Fetch milestones for this user
      const { data: milestonesData, error: milestonesError } = await supabase
        .from('task_milestones')
        .select('id, task_id, user_id, milestone_date, label, created_at, updated_at')
        .eq('user_id', userId)

      if (milestonesError) throw milestonesError

      // Normalize task rows (status handling, etc.)
      const normalizedTasks = normalizeTaskRows(tasksData || [])

      // Attach milestone data to each task for easier access
      const milestoneMap = Object.fromEntries(
        (milestonesData || []).map((m) => [m.task_id, m])
      )
      const tasksWithMilestones = normalizedTasks.map((task) => ({
        ...task,
        milestone: milestoneMap[task.id] || null,
      }))

      // Apply client-side filters if needed
      let filtered = tasksWithMilestones

      if (filters?.status && filters.status.length > 0) {
        filtered = filtered.filter((t) => filters.status.includes(t.status_id))
      }
      if (filters?.priority && filters.priority.length > 0) {
        filtered = filtered.filter((t) => filters.priority.includes(t.priority))
      }
      if (filters?.assigneeId) {
        filtered = filtered.filter((t) => t.assignee_id === filters.assigneeId)
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
        filtered = filtered.filter((t) => t.comments?.count > 0)
      }
      if (filters?.hasDependencies) {
        filtered = filtered.filter((t) => t.dependencies?.count > 0)
      }
      if (filters?.milestoneStatus && filters.milestoneStatus.length > 0) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayISO = today.toISOString().split('T')[0]

        filtered = filtered.filter((t) => {
          const milestone = t.milestone
          for (const statusFilter of filters.milestoneStatus) {
            if (statusFilter === 'no_milestone' && !milestone) return true
            if (statusFilter === 'milestone_overdue' && milestone) {
              const milestoneDate = milestone.milestone_date.slice(0, 10)
              if (milestoneDate < todayISO && !isTaskCompleted(t)) return true
            }
            if (statusFilter === 'milestone_today' && milestone) {
              const milestoneDate = milestone.milestone_date.slice(0, 10)
              if (milestoneDate === todayISO) return true
            }
            if (statusFilter === 'milestone_upcoming' && milestone) {
              const milestoneDate = milestone.milestone_date.slice(0, 10)
              if (milestoneDate > todayISO) return true
            }
          }
          return false
        })
      }

      setTasks(filtered)
      setMilestones(milestonesData || [])
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load tasks')
      setError(error)
      showToast(error.message, { tone: 'error' })
    } finally {
      setIsLoading(false)
    }
  }, [userId, filters?.status, filters?.assignee, filters?.space, dateRange, filters?.dateRange, showToast])

  // Initial load
  useEffect(() => {
    load()
  }, [load])

  // Real-time sync for tasks
  // Realtime postgres_changes filters only support a single column=op.value
  // clause, not the or(...) syntax used for PostgREST queries — so this
  // needs two separate subscriptions (created_by and assignee_id) rather
  // than one filter with an or().
  useEffect(() => {
    if (!userId) return

    const handlePayload = (payload) => {
      if (payload.eventType === 'DELETE') {
        setTasks((prev) => prev.filter((t) => t.id !== payload.old.id))
      } else {
        // Refetch to get full normalized data
        load()
      }
    }

    const createdSubscription = supabase
      .channel(`tasks:created_by:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `created_by=eq.${userId}`,
        },
        handlePayload,
      )
      .subscribe()

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
      supabase.removeChannel(createdSubscription)
      supabase.removeChannel(assignedSubscription)
    }
  }, [userId, load])

  // Real-time sync for milestones
  useEffect(() => {
    if (!userId) return

    const milestoneSubscription = supabase
      .channel(`task_milestones:user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_milestones',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setMilestones((prev) => prev.filter((m) => m.id !== payload.old.id))
          } else if (payload.eventType === 'INSERT') {
            setMilestones((prev) => [...prev, payload.new])
          } else {
            setMilestones((prev) =>
              prev.map((m) => (m.id === payload.new.id ? payload.new : m)),
            )
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(milestoneSubscription)
    }
  }, [userId])

  return {
    tasks,
    milestones,
    isLoading,
    error,
    refetch: load,
  }
}

/**
 * Helper to get milestone for a specific task
 */
export function getMilestoneForTask(milestones: any[], taskId: string) {
  return milestones.find((m) => m.task_id === taskId)
}

/**
 * Save or update milestone
 */
export async function saveMilestone(
  taskId: string,
  userId: string,
  milestoneDate: string | null,
  label?: string,
) {
  if (!milestoneDate) {
    // Delete milestone
    const { error } = await supabase
      .from('task_milestones')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', userId)
    if (error) throw error
    return null
  }

  // Upsert milestone
  const { data, error } = await supabase.from('task_milestones').upsert(
    {
      task_id: taskId,
      user_id: userId,
      milestone_date: milestoneDate,
      label: label || null,
    },
    { onConflict: 'task_id,user_id' },
  ).select().single()

  if (error) throw error

  // Create reminders for the milestone
  if (data?.id) {
    try {
      await supabase.rpc('create_milestone_reminders', {
        p_task_milestone_id: data.id,
        p_user_id: userId,
      })
    } catch (reminderError) {
      console.error('Failed to create milestone reminders:', reminderError)
      // Don't throw - milestone was saved successfully
    }
  }

  return data
}
