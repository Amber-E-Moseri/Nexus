import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createTask, deleteTask, getDeptTasks, getSprintTasks, updateTask } from '../../lib/tasks'
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
    async (taskId, newStatusId) => {
      const targetStatus = statuses.find((status) => status.id === newStatusId) ?? null
      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
                ...task,
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
      const newTask = await createTask({
        ...taskData,
        statusId: taskData.statusId ?? resolvedStatus?.id,
        statusCategory: resolvedStatus?.category,
        department_id: sprintId ? null : departmentId,
        sprint_id: sprintId ?? null,
        task_type: taskData.is_personal ? 'personal' : sprintId ? 'sprint' : 'space',
      })
      setTasks((prev) => [newTask, ...prev])
      return newTask
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
