import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getArchivedTasks, unarchiveTask } from '../lib/tasks'

export const archivedTasksKey = ['archived_tasks']

export function useArchivedTasks() {
  const queryClient = useQueryClient()

  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey: archivedTasksKey,
    queryFn: getArchivedTasks,
  })

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: archivedTasksKey }),
    [queryClient],
  )

  const unarchive = useCallback(
    async (taskId) => {
      await unarchiveTask(taskId)
      await invalidate()
    },
    [invalidate],
  )

  return { tasks, isLoading, error, unarchive }
}
