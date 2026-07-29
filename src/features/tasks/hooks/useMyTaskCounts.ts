import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { normalizeTaskRows, isTaskActionable } from '../../../lib/taskStatuses'
import { localDateOnly, localTomorrowDateOnly } from './useMyTasks'

// Minimal columns needed to classify a task as actionable + due — the sidebar
// badge query must stay cheap because it's mounted globally.
const COUNT_SELECT = `
  id, due_date, status, status_id, completed_at,
  status_definition:task_status_definitions!status_id(id, name, color, category, legacy_key)
`

interface MyTaskCounts {
  todayTomorrow: number
}

/**
 * Badge count for the sidebar My Tasks "Today & Tomorrow" quick view. Mirrors
 * useMyTasks' 'today_tomorrow' scope: assignee-only, actionable (not
 * completed/cancelled), due_date within [today, tomorrow] local time.
 * Realtime-synced via the same assignee_id filter useMyTasks uses, on a
 * distinct channel topic so both can be mounted at once.
 */
export function useMyTaskCounts(userId: string | null | undefined): MyTaskCounts {
  const [counts, setCounts] = useState<MyTaskCounts>({ todayTomorrow: 0 })

  const load = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('tasks')
      .select(COUNT_SELECT)
      .eq('assignee_id', userId)
      .is('deleted_at', null)

    // Badges are best-effort; leave the previous counts rather than toasting
    if (error) return

    const actionable = normalizeTaskRows(data ?? []).filter(isTaskActionable)
    const today = localDateOnly()
    const tomorrow = localTomorrowDateOnly()
    setCounts({
      todayTomorrow: actionable.filter((t) => {
        const due = t.due_date?.slice(0, 10)
        return due && due >= today && due <= tomorrow
      }).length,
    })
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!userId) {
      setCounts({ todayTomorrow: 0 })
      return
    }

    const topic = `tasks:quickview-counts:${userId}`

    // Supabase can briefly retain a channel during teardown (for example under
    // React StrictMode remounts). Reusing the same topic before that cleanup
    // finishes can surface "cannot add postgres_changes callbacks after
    // subscribe()", so eagerly remove any stale instance first.
    supabase
      .getChannels()
      .filter((existing) => existing.topic === topic || existing.topic === `realtime:${topic}`)
      .forEach((existing) => {
        void supabase.removeChannel(existing)
      })

    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assignee_id=eq.${userId}`,
        },
        () => {
          load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, load])

  return counts
}
