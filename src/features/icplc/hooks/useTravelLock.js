import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { isFieldOverridden, setOverridePatch } from '../lib/fieldAuthority.js'

// The six itinerary fields an import (CMP flights / registration) may overwrite.
export const TRAVEL_FIELDS = [
  'arrival_date', 'arrival_time', 'arrival_flight',
  'departure_date', 'departure_time', 'departure_flight',
]

/** A row is "locked" when any itinerary field carries a staff override. */
export function isTravelLocked(participant) {
  return TRAVEL_FIELDS.some((f) => isFieldOverridden(participant, f))
}

/**
 * Lock/unlock a participant's itinerary so re-imports won't overwrite it.
 * Uses the row's own override_fields (from the list query), so it never depends on
 * a profile query being cached.
 */
export function useTravelLock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ participant, lock, userId }) => {
      const next = { ...(participant.override_fields || {}) }
      for (const field of TRAVEL_FIELDS) {
        if (lock) Object.assign(next, setOverridePatch(field, userId))
        else delete next[field]
      }
      const { data, error } = await supabase
        .from('icplc_participants')
        .update({ override_fields: next })
        .eq('id', participant.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['icplc_profile', data.id] })
      qc.invalidateQueries({ queryKey: ['icplc_participants', data.event_id] })
    },
  })
}
