import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createTask, deleteTask, getDeptTasks, getSprintTasks, updateTask } from './lib/tasks'
import { listTaskStatuses, selectDefaultStatus, selectActiveTaskStatuses } from '../../lib/taskStatuses'
import { supabase } from '../../lib/supabase'

export const TasksContext = createContext(null)

export function TasksProvider({ departmentId, sprintId, children }) {
  const [tasks, setTasks] = useState([])
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      if (!departmentId && !sprintId) {
        // No scope provided — provider is used for context/utilities only
        setTasks([])
        setStatuses([])
        return
      }

      // Load both global and department-specific statuses
      const statusPromises = [listTaskStatuses()]
      if (departmentId) {
        statusPromises.push(listTaskStatuses({ departmentId }))
      }

      const [taskData, ...statusResults] = await Promise.all([
        sprintId ? getSprintTasks(sprintId) : getDeptTasks(departmentId),
        ...statusPromises,
      ])

      // Deduplicate by category + legacy_key, preferring dept-specific over global
      const statusMap = new Map()
      for (let i = statusResults.length - 1; i >= 0; i--) {
        const statusList = statusResults[i]
        for (const status of statusList) {
          const key = `${status.category}:${status.legacy_key || status.name}`
          if (!statusMap.has(key)) {
            statusMap.set(key, status)
          }
        }
      }

      // Ensure an open-category status is always included (To Do / Not Started)
      if (!Array.from(statusMap.values()).some(s => s.category === 'open')) {
        try {
          const allStatuses = await listTaskStatuses({ departmentId, includeInactive: true })
          const openStatus = allStatuses.find(s => s.category === 'open')
          if (openStatus) {
            statusMap.set(`open:${openStatus.legacy_key || openStatus.name}`, { ...openStatus, active: true })
          }
        } catch { /* ignore */ }
        // Last resort: synthetic To Do if nothing in DB
        if (!Array.from(statusMap.values()).some(s => s.category === 'open')) {
          statusMap.set('open:to_do', {
            id: '__fallback_todo',
            name: 'To Do',
            color: '#378ADD',
            category: 'open',
            legacy_key: 'to_do',
            is_default: true,
            active: true,
            sort_order: 0,
          })
        }
      }

      const finalStatuses = selectActiveTaskStatuses(Array.from(statusMap.values()))
      setStatuses(finalStatuses)
      setTasks(taskData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [departmentId, sprintId])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Real-time sync for department/sprint tasks — update live as teammates edit
  useEffect(() => {
    if (!departmentId && !sprintId) return undefined

    const handlePayload = (payload) => {
      if (payload.eventType === 'DELETE') {
        setTasks((prev) => prev.filter((t) => t.id !== payload.old.id))
      } else if (payload.eventType === 'INSERT') {
        // Realtime payload has only flat fields; re-fetch to get full relations
        loadTasks()
      } else if (payload.eventType === 'UPDATE') {
        // Realtime payload has only flat fields; re-fetch to avoid stale joined relations.
        loadTasks()
      }
    }

    const channelId = departmentId ? `tasks:dept:${departmentId}` : `tasks:sprint:${sprintId}`
    const filter = departmentId ? `department_id=eq.${departmentId}` : `sprint_id=eq.${sprintId}`

    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter }, handlePayload)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [departmentId, sprintId, loadTasks])

  const moveTask = useCallback(
    async (taskId, nextStatus) => {
      const newStatusId = typeof nextStatus === 'string' ? nextStatus : nextStatus?.id ?? null
      if (!newStatusId) return
      const targetStatus = (typeof nextStatus === 'object' && nextStatus)
        ? nextStatus
        : statuses.find((status) => status.id === newStatusId) ?? null
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: targetStatus?.legacy_key ?? task.status,
                status_id: newStatusId,
                status_definition: targetStatus,
                status_name: targetStatus?.name ?? task.status_name,
                status_color: targetStatus?.color ?? task.status_color,
                status_category: targetStatus?.category ?? task.status_category,
              }
            : task,
        ),
      )
      try {
        await updateTask(taskId, {
          status: targetStatus?.legacy_key ?? undefined,
          statusId: newStatusId,
          statusCategory: targetStatus?.category,
        })
      } catch {
        loadTasks()
      }
    },
    [loadTasks, statuses],
  )

  const reloadStatuses = useCallback(() => {
    // Extract and re-run just the status loading portion of loadTasks
    const load = async () => {
      try {
        const statusPromises = [listTaskStatuses()]
        if (departmentId) {
          statusPromises.push(listTaskStatuses({ departmentId }))
        }
        const statusResults = await Promise.all(statusPromises)
        const statusMap = new Map()
        for (let i = statusResults.length - 1; i >= 0; i--) {
          const statusList = statusResults[i]
          for (const status of statusList) {
            const key = `${status.category}:${status.legacy_key || status.name}`
            if (!statusMap.has(key)) {
              statusMap.set(key, status)
            }
          }
        }
        if (!Array.from(statusMap.values()).some(s => s.category === 'open')) {
          try {
            const allStatuses = await listTaskStatuses({ departmentId, includeInactive: true })
            const openStatus = allStatuses.find(s => s.category === 'open')
            if (openStatus) {
              statusMap.set(`open:${openStatus.legacy_key || openStatus.name}`, { ...openStatus, active: true })
            }
          } catch { /* ignore */ }
          if (!Array.from(statusMap.values()).some(s => s.category === 'open')) {
            statusMap.set('open:to_do', {
              id: '__fallback_todo',
              name: 'To Do',
              color: '#378ADD',
              category: 'open',
              legacy_key: 'to_do',
              is_default: true,
              active: true,
              sort_order: 0,
            })
          }
        }
        const finalStatuses = selectActiveTaskStatuses(Array.from(statusMap.values()))
        setStatuses(finalStatuses)
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [departmentId])

  const addTask = useCallback(
    async (taskData) => {
      const resolvedStatus = statuses.find((status) => status.id === taskData.statusId)
        ?? selectDefaultStatus(statuses)
      const payload = {
        ...taskData,
        statusId: taskData.statusId ?? resolvedStatus?.id,
        statusCategory: resolvedStatus?.category,
        department_id: 'department_id' in taskData ? taskData.department_id : sprintId ? null : departmentId,
        sprint_id: sprintId ?? null,
        task_type: taskData.is_personal ? 'personal' : sprintId ? 'sprint' : 'space',
      }
      const tempId = `temp-${crypto.randomUUID()}`
      const optimisticTask = {
        id: tempId,
        title: payload.title,
        description: payload.description ?? null,
        status: payload.status ?? resolvedStatus?.legacy_key ?? 'backlog',
        status_id: payload.statusId ?? null,
        status_definition: resolvedStatus ?? null,
        status_name: resolvedStatus?.name ?? null,
        status_color: resolvedStatus?.color ?? null,
        status_category: resolvedStatus?.category ?? null,
        priority: payload.priority ?? 'medium',
        assignee_id: payload.assignee_id ?? null,
        assignee: null,
        due_date: payload.due_date ?? null,
        department_id: payload.department_id ?? null,
        department: taskData.department ?? null,
        sprint_id: payload.sprint_id ?? null,
        list_id: payload.list_id ?? null,
        list: taskData.list ?? null,
        is_personal: Boolean(payload.is_personal),
        source: payload.source ?? 'manual',
        task_type: payload.task_type,
        created_by: payload.created_by ?? null,
        created_at: new Date().toISOString(),
        subtasks: [],
        comments: [{ count: 0 }],
        files: [{ count: 0 }],
        dependencies: [{ count: 0 }],
      }

      setTasks((prev) => [...prev, optimisticTask])

      try {
        const newTask = await createTask(payload)
        setTasks((prev) => prev.map((task) => (task.id === tempId ? newTask : task)))
        return newTask
      } catch (error) {
        setTasks((prev) => prev.filter((task) => task.id !== tempId))
        throw error
      }
    },
    [departmentId, sprintId, statuses],
  )

  const editTask = useCallback(async (taskId, updates) => {
    const updated = await updateTask(taskId, updates)
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)))
    return updated
  }, [])

  const removeTask = useCallback(async (taskId) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
    await deleteTask(taskId)
  }, [])

  const defaultStatus = selectDefaultStatus(statuses)

  // Split context into data and actions to reduce re-renders
  // Data changes less frequently than actions
  const dataValue = useMemo(() => ({
    tasks,
    statuses,
    defaultStatusId: defaultStatus?.id ?? null,
    loading,
    error,
  }), [tasks, statuses, defaultStatus, loading, error])

  const actionsValue = useMemo(() => ({
    moveTask,
    addTask,
    editTask,
    removeTask,
    reload: loadTasks,
    reloadStatuses,
  }), [moveTask, addTask, editTask, removeTask, loadTasks, reloadStatuses])

  const value = useMemo(() => ({
    ...dataValue,
    ...actionsValue,
  }), [dataValue, actionsValue])

  return (
    <TasksContext.Provider value={value}>
      {children}
    </TasksContext.Provider>
  )
}

export function useTasks() {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasks must be used inside TasksProvider')
  return ctx
}
