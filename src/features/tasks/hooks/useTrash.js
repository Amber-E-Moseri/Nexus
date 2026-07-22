import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getTrashTasks, hardDeleteTask, restoreTask } from '../lib/tasks'

export const trashTasksKey = ['trash_tasks']

export function useTrash() {
  const queryClient = useQueryClient()

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: trashTasksKey,
    queryFn: getTrashTasks,
  })

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trashTasksKey }),
    [queryClient],
  )

  const restore = useCallback(
    async (taskId) => {
      await restoreTask(taskId)
      await invalidate()
    },
    [invalidate],
  )

  const permanentlyDelete = useCallback(
    async (taskId) => {
      await hardDeleteTask(taskId)
      await invalidate()
    },
    [invalidate],
  )

  return { tasks, isLoading, error, restore, permanentlyDelete }
}
