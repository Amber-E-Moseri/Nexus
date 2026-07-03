import { useState } from 'react'
import { deleteTask } from '../lib/tasks'

export function useDeleteTask() {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState(null)

  const handleDelete = async (taskId, permanent = false) => {
    setIsDeleting(true)
    setError(null)
    try {
      await deleteTask(taskId, permanent)
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setIsDeleting(false)
    }
  }

  return {
    isDeleting,
    error,
    deleteTask: handleDelete,
  }
}
