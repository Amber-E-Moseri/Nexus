import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import {
  getPersonalSublists,
  createPersonalSublist,
  updatePersonalSublist,
  deletePersonalSublist,
  moveTaskToSublist,
  backfillPersonalTasksToDefaultSublist,
  getOrCreateDefaultSublist,
} from '../lib/personalSublist'
import { getPersonalTasks, getPinnedTasks } from '../lib/personalList'

/**
 * Manages personal list sublists + tasks with realtime subscriptions
 * Returns organized data: sublists, tasks grouped by sublist, and CRUD operations
 */
export function usePersonalSublist(userId) {
  const [sublists, setSublists] = useState([])
  const [personalTasks, setPersonalTasks] = useState([])
  const [pinnedTasks, setPinnedTasks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const backfillAttemptedRef = useRef(false)

  const load = useCallback(async () => {
    if (!userId) return

    setError(null)
    try {
      const [lists, personal, pinned] = await Promise.all([
        getPersonalSublists(userId),
        getPersonalTasks(userId),
        getPinnedTasks(userId),
      ])

      setSublists(lists)
      setPersonalTasks(personal)
      setPinnedTasks(pinned)

      // Lazy backfill: if user has personal tasks but no sublists, create default and backfill
      if (personal.length > 0 && lists.length === 0 && !backfillAttemptedRef.current) {
        backfillAttemptedRef.current = true
        try {
          await backfillPersonalTasksToDefaultSublist(userId)
          // Refresh to show backfilled tasks
          const [listsRefresh] = await Promise.all([getPersonalSublists(userId)])
          setSublists(listsRefresh)
        } catch (backfillErr) {
          console.error('[usePersonalSublist] Backfill failed:', backfillErr)
          // Don't fail the whole hook; user can manually create sublists
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load sublists'))
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  // Initial load
  useEffect(() => {
    setIsLoading(true)
    load()
  }, [load])

  // Realtime subscriptions: sublists + tasks
  useEffect(() => {
    if (!userId) return

    const refetch = () => loadRef.current()

    const sublistsChannel = supabase
      .channel(`personal_lists:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personal_lists', filter: `user_id=eq.${userId}` },
        refetch,
      )
      .subscribe()

    const tasksChannel = supabase
      .channel(`personal_sublist_tasks:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personal_list_tasks', filter: `user_id=eq.${userId}` },
        refetch,
      )
      .subscribe()

    // Also subscribe to personal task changes (is_personal = true)
    const personalTasksChannel = supabase
      .channel(`personal_sublist_personal_tasks:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `is_personal=eq.true,or(created_by.eq.${userId},assignee_id.eq.${userId})`,
        },
        refetch,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(sublistsChannel)
      supabase.removeChannel(tasksChannel)
      supabase.removeChannel(personalTasksChannel)
    }
  }, [userId])

  // Organize tasks by sublist
  const tasksBySublist = useMemo(() => {
    const grouped = {}

    // Initialize groups for each sublist
    sublists.forEach((list) => {
      grouped[list.id] = {
        sublist: list,
        tasks: [],
      }
    })

    // Add personal tasks to their sublist
    personalTasks.forEach((task) => {
      // Map personal_sublist_id to sublist_id for consistency
      const sublistId = task.personal_sublist_id || task.sublist_id || null
      if (grouped[sublistId]) {
        grouped[sublistId].tasks.push(task)
      } else if (sublistId === null) {
        // Task not in a sublist (shouldn't happen post-backfill, but guard against it)
        const defaultSublist = sublists.find((s) => s.is_default)
        if (defaultSublist && grouped[defaultSublist.id]) {
          grouped[defaultSublist.id].tasks.push(task)
        }
      }
    })

    return grouped
  }, [sublists, personalTasks])

  // CRUD operations
  const createSublist = useCallback(
    async (name) => {
      try {
        const newSublist = await createPersonalSublist(userId, name, false)
        setSublists((prev) => [...prev, newSublist])
        return newSublist
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to create sublist')
      }
    },
    [userId],
  )

  const updateSublist = useCallback(
    async (listId, updates) => {
      try {
        const updated = await updatePersonalSublist(userId, listId, updates)
        setSublists((prev) =>
          prev.map((list) => (list.id === listId ? updated : list)),
        )
        return updated
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to update sublist')
      }
    },
    [userId],
  )

  const deleteSublist = useCallback(
    async (listId) => {
      try {
        await deletePersonalSublist(userId, listId)
        // Trigger will reassign tasks; refetch to sync
        await load()
      } catch (err) {
        throw err instanceof Error ? err : new Error('Failed to delete sublist')
      }
    },
    [userId, load],
  )

  const moveTask = useCallback(
    async (taskId, listId) => {
      try {
        await moveTaskToSublist(taskId, listId)
        // Optimistic update
        setPersonalTasks((prev) =>
          prev.map((task) =>
            task.id === taskId ? { ...task, personal_sublist_id: listId } : task,
          ),
        )
      } catch (err) {
        // Refetch on error
        load()
        throw err instanceof Error ? err : new Error('Failed to move task')
      }
    },
    [load],
  )

  const ensureDefaultSublist = useCallback(async () => {
    try {
      const defaultSublist = await getOrCreateDefaultSublist(userId)
      // Check if we need to add it to our local state
      if (!sublists.some((s) => s.id === defaultSublist.id)) {
        setSublists((prev) => [...prev, defaultSublist])
      }
      return defaultSublist
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to create default sublist')
    }
  }, [userId, sublists])

  return {
    sublists,
    personalTasks,
    pinnedTasks,
    tasksBySublist,
    isLoading,
    error,
    refetch: load,
    createSublist,
    updateSublist,
    deleteSublist,
    moveTask,
    ensureDefaultSublist,
  }
}
