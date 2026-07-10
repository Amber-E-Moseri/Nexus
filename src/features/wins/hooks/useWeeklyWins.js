import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { addWin, deleteWin, listWins, updateWin } from '../lib/wins'

export const weeklyWinsKey = (departmentId, weekStartISO) => ['weekly_wins', departmentId, weekStartISO]

/**
 * Department-shared wins/testimonies for one week. Server state lives in
 * React Query; a single realtime subscription per department keeps every
 * open sheet fresh (someone else's win appears without a refresh).
 */
export function useWeeklyWins(departmentId, weekStartISO, userId) {
  const queryClient = useQueryClient()

  const { data: wins = [], isLoading, error } = useQuery({
    queryKey: weeklyWinsKey(departmentId, weekStartISO),
    queryFn: () => listWins(departmentId, weekStartISO),
    enabled: Boolean(departmentId && weekStartISO),
  })

  useEffect(() => {
    if (!departmentId) return
    const channel = supabase
      .channel(`weekly_wins:dept:${departmentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_wins', filter: `department_id=eq.${departmentId}` },
        () => queryClient.invalidateQueries({ queryKey: ['weekly_wins', departmentId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [departmentId, queryClient])

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['weekly_wins', departmentId] }),
    [queryClient, departmentId],
  )

  const add = useCallback(
    async ({ content, taskId }) => {
      const win = await addWin({ departmentId, weekStartISO, content, taskId, userId })
      await invalidate()
      return win
    },
    [departmentId, weekStartISO, userId, invalidate],
  )

  const update = useCallback(
    async (winId, patch) => {
      const win = await updateWin(winId, patch)
      await invalidate()
      return win
    },
    [invalidate],
  )

  const remove = useCallback(
    async (winId) => {
      await deleteWin(winId)
      await invalidate()
    },
    [invalidate],
  )

  return { wins, isLoading, error, addWin: add, updateWin: update, deleteWin: remove }
}
