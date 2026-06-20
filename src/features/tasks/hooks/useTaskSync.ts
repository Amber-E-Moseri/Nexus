import { useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'

interface TaskUpdatePayload {
  id: string
  new: any
  old: any
  eventType: string
}

/**
 * Real-time task synchronization hook
 * Listens to task changes and triggers updates across all views
 *
 * Usage:
 * const handleTaskUpdate = (updatedTask) => {
 *   setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t))
 * }
 * useTaskSync(userId, handleTaskUpdate)
 */
export function useTaskSync(userId: string | undefined, onTaskUpdate?: (task: any) => void) {
  const handleRealtimeUpdate = useCallback((payload: TaskUpdatePayload) => {
    if (!userId) return

    // Only process updates for tasks assigned to current user
    if (payload.new?.assignee_id === userId || payload.old?.assignee_id === userId) {
      if (onTaskUpdate) {
        onTaskUpdate(payload.new)
      }
    }
  }, [userId, onTaskUpdate])

  useEffect(() => {
    if (!userId) return

    // Subscribe to real-time task changes
    const subscription = supabase
      .channel(`tasks:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assignee_id=eq.${userId}`,
        },
        (payload: any) => {
          handleRealtimeUpdate({
            id: payload.new?.id || payload.old?.id,
            new: payload.new,
            old: payload.old,
            eventType: payload.eventType,
          })
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [userId, handleRealtimeUpdate])
}

/**
 * Hook to listen for personal task changes
 * Includes personal, flexible, and fixed tasks
 */
export function useTaskSyncAll(userId: string | undefined, onTaskUpdate?: (task: any) => void) {
  const handleRealtimeUpdate = useCallback((payload: TaskUpdatePayload) => {
    if (!userId) return

    // Process all task updates for this user
    const task = payload.new || payload.old
    if (task?.assignee_id === userId || task?.created_by === userId || task?.is_personal) {
      if (onTaskUpdate) {
        onTaskUpdate(payload.new)
      }
    }
  }, [userId, onTaskUpdate])

  useEffect(() => {
    if (!userId) return

    const subscription = supabase
      .channel(`tasks-all:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        (payload: any) => {
          handleRealtimeUpdate({
            id: payload.new?.id || payload.old?.id,
            new: payload.new,
            old: payload.old,
            eventType: payload.eventType,
          })
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [userId, handleRealtimeUpdate])
}
