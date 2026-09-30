import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { readTargets } from '../lib/documentationRisk.js'

/**
 * The two dates the documentation time-risk model uses (Visa Target Date, Passport Ready Target).
 * Same query key and shape as Settings > Deadlines, so saving a date there refreshes every screen using it.
 */
export function useICPLCTargets(eventId) {
  const { data } = useQuery({
    queryKey: ['icplc_event_config_deadlines', eventId],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('event_configs')
        .select('id, tab_config')
        .eq('id', eventId)
        .single()
      if (error) throw error
      return row
    },
    enabled: !!eventId,
    staleTime: 60_000,
  })
  return useMemo(() => readTargets(data?.tab_config), [data])
}
