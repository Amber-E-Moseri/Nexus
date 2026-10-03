import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { isFieldOverridden } from '../lib/fieldAuthority.js'

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
 * The change is applied atomically on the server (icplc_apply_override_changes): only the six itinerary keys are
 * set or cleared, so overrides another staff member added meanwhile are never overwritten by a stale browser copy.
 */
export function useTravelLock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ participant, lock }) => {
      const { data, error } = await supabase.rpc('icplc_apply_override_changes', {
        p_participant_id: participant.id,
        p_set_fields: lock ? TRAVEL_FIELDS : [],
        p_clear_fields: lock ? [] : TRAVEL_FIELDS,
      })
      if (error) throw error
      return { ...participant, override_fields: data }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['icplc_profile', data.id] })
      qc.invalidateQueries({ queryKey: ['icplc_participants', data.event_id] })
    },
  })
}
