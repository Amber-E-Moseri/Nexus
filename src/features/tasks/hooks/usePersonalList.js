import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getPersonalTasks, getPinnedTasks } from '../lib/personalList'

// Data for the Personal List page: the user's private tasks plus team tasks
// pinned as a second location. Realtime keeps both halves live — pins via
// personal_list_tasks, private tasks via the same assignee-filtered tasks
// channel pattern useMyTasks uses (creator-only drafts refresh on refetch).
export function usePersonalList(userId) {
  const [personalTasks, setPersonalTasks] = useState([])
  const [pinnedTasks, setPinnedTasks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!userId) return
    setError(null)
    try {
      const [personal, pinned] = await Promise.all([
        getPersonalTasks(userId),
        getPinnedTasks(userId),
      ])
      setPersonalTasks(personal)
      setPinnedTasks(pinned)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load Personal List'))
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    setIsLoading(true)
    load()
  }, [load])

  useEffect(() => {
    if (!userId) return

    const refetch = () => loadRef.current()

    const pinsChannel = supabase
      .channel(`personal_list_tasks:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'personal_list_tasks', filter: `user_id=eq.${userId}` },
        refetch,
      )
      .subscribe()

    const tasksChannel = supabase
      .channel(`personal_list:tasks:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${userId}` },
        refetch,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(pinsChannel)
      supabase.removeChannel(tasksChannel)
    }
  }, [userId])

  return { personalTasks, pinnedTasks, isLoading, error, refetch: load }
}
