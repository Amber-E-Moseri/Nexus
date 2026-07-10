import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { applyOffsetToChild, computeOffsetMinutes } from '../lib/timeBlockUtils'

export const timeBlocksKey = (userId, weekStartISO) => ['time_blocks', userId, weekStartISO]

async function fetchWeekBlocks(userId, weekStartISO, weekEndISO) {
  const { data, error } = await supabase
    .from('time_blocks')
    .select('*')
    .eq('user_id', userId)
    .gte('scheduled_date', weekStartISO)
    .lte('scheduled_date', weekEndISO)
    .order('scheduled_date')
    .order('scheduled_start_time')
  if (error) throw error
  return data ?? []
}

/**
 * Server state for one visible week of time blocks. Server data lives in
 * React Query (BLW-09); realtime pushes freshness via invalidateQueries.
 */
export function useTimeBlocks(userId, weekStartISO, weekEndISO) {
  const queryClient = useQueryClient()
  const queryKey = timeBlocksKey(userId, weekStartISO)

  const { data: timeBlocks = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchWeekBlocks(userId, weekStartISO, weekEndISO),
    enabled: Boolean(userId),
  })

  // Any change to my blocks (this tab or another device) refreshes every
  // cached week — cheap, since only the visible week is actively observed.
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`time_blocks:user:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'time_blocks', filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: ['time_blocks', userId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, queryClient])

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['time_blocks', userId] }),
    [queryClient, userId],
  )

  const createTimeBlock = useCallback(
    async ({ taskId, scheduledDate, scheduledStartTime, scheduledEndTime, isAllDay = false, parentTimeBlockId = null, timeOffsetFromParent = null }) => {
      const { data, error: insertError } = await supabase
        .from('time_blocks')
        .insert({
          task_id: taskId,
          user_id: userId,
          scheduled_date: scheduledDate,
          scheduled_start_time: scheduledStartTime,
          scheduled_end_time: scheduledEndTime,
          is_all_day: isAllDay,
          parent_time_block_id: parentTimeBlockId,
          time_offset_from_parent: timeOffsetFromParent,
        })
        .select()
        .single()
      if (insertError) throw insertError
      await invalidate()
      return data
    },
    [userId, invalidate],
  )

  const updateTimeBlock = useCallback(
    async (blockId, patch) => {
      const { data, error: updateError } = await supabase
        .from('time_blocks')
        .update(patch)
        .eq('id', blockId)
        .eq('user_id', userId)
        .select()
        .single()
      if (updateError) throw updateError
      await invalidate()
      return data
    },
    [userId, invalidate],
  )

  const deleteTimeBlock = useCallback(
    async (blockId) => {
      const { error: deleteError } = await supabase
        .from('time_blocks')
        .delete()
        .eq('id', blockId)
        .eq('user_id', userId)
      if (deleteError) throw deleteError
      await invalidate()
    },
    [userId, invalidate],
  )

  // Move a parent block and every linked child, preserving each child's
  // stored minute offset from the parent's start.
  const moveParentWithChildren = useCallback(
    async (parentBlock, childBlocks, newDateISO, newStartTime, newEndTime) => {
      const { error: parentError } = await supabase
        .from('time_blocks')
        .update({
          scheduled_date: newDateISO,
          scheduled_start_time: newStartTime,
          scheduled_end_time: newEndTime,
        })
        .eq('id', parentBlock.id)
        .eq('user_id', userId)
      if (parentError) throw parentError

      for (const child of childBlocks) {
        const offset = child.time_offset_from_parent ?? computeOffsetMinutes(parentBlock, child)
        const next = applyOffsetToChild(newDateISO, newStartTime, child, offset)
        const { error: childError } = await supabase
          .from('time_blocks')
          .update(next)
          .eq('id', child.id)
          .eq('user_id', userId)
        if (childError) throw childError
      }
      await invalidate()
    },
    [userId, invalidate],
  )

  return {
    timeBlocks,
    isLoading,
    error,
    createTimeBlock,
    updateTimeBlock,
    deleteTimeBlock,
    moveParentWithChildren,
  }
}
