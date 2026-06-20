import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createTask, deleteTask, getDeptTasks, getSprintTasks, updateTask } from './lib/tasks'
import { listTaskStatuses, selectDefaultStatus } from '../../lib/taskStatuses'

export const TasksContext = createContext(null)

export function TasksProvider({ departmentId, sprintId, children }) {
  const [tasks, setTasks] = useState([])
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadStatuses = useCallback(async () => {
    const data = await listTaskStatuses({ departmentId: sprintId ? null : departmentId })
    setStatuses(data)
  }, [departmentId, sprintId])

  const loadTasks = useCallback(async () => {
    if (!departmentId && !sprintId) return
    try {
      setLoading(true)
      setError(null)
      const [taskData, statusData] = await Promise.all([
        sprintId ? getSprintTasks(sprintId) : getDeptTasks(departmentId),
        listTaskStatuses({ departmentId: sprintId ? null : departmentId }),
      ])
      const data = taskData
      setStatuses(statusData)
      setTasks(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [departmentId, sprintId])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

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

  return (
    <TasksContext.Provider
      value={{
        tasks,
        statuses,
        defaultStatusId: defaultStatus?.id ?? null,
        loading,
        error,
        moveTask,
        addTask,
        editTask,
        removeTask,
        reload: loadTasks,
        reloadStatuses: loadStatuses,
      }}
    >
      {children}
    </TasksContext.Provider>
  )
}

export function useTasks() {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasks must be used inside TasksProvider')
  return ctx
}
