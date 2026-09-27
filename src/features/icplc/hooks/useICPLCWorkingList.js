import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useICPLCParticipants } from './useICPLCParticipants.js'
import {
  REGISTRATION_SOURCE_TYPE,
  registrationLinkedParticipantIds,
  registrationSourceKey,
  reconciliationState,
} from '../lib/reconciliation.js'

/**
 * Working List participants with registration state DERIVED from the identity map
 * (registration_link_status), plus the registrations that still need review.
 * Registration never changes participation status.
 */
export function useICPLCWorkingList(eventId) {
  const participantsQ = useICPLCParticipants(eventId, {})
  const registrationsQ = useQuery({
    queryKey: ['icplc_wl_registrations', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('registrations')
        .select('id, event_config_id, email, full_name, first_name, last_name, submitted_at, status, registration_status')
        .eq('event_config_id', eventId)
      if (error) throw error
      return data || []
    },
  })
  const mapsQ = useQuery({
    queryKey: ['icplc_wl_registration_maps', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icplc_identity_maps')
        .select('source_type, source_key, participant_id')
        .eq('event_id', eventId)
        .eq('source_type', REGISTRATION_SOURCE_TYPE)
      if (error) throw error
      return data || []
    },
  })

  const participants = participantsQ.data
  const registrations = registrationsQ.data
  const maps = mapsQ.data

  const derived = useMemo(() => {
    const regs = registrations || []
    const mapRows = maps || []
    const linked = registrationLinkedParticipantIds(regs, mapRows, eventId)
    const withLink = (participants || []).map((p) => ({
      ...p,
      registration_link_status: linked.has(p.id) ? 'registered' : 'not_registered',
    }))
    const bySourceKey = new Map(mapRows.map((m) => [m.source_key, m]))
    const ambiguous = regs.filter((r) =>
      reconciliationState(r, participants || [], bySourceKey.get(registrationSourceKey(r))).state === 'POSSIBLE_MATCH')
    return { participants: withLink, ambiguousRegistrations: ambiguous }
  }, [eventId, maps, participants, registrations])

  return {
    ...derived,
    isLoading: participantsQ.isLoading || registrationsQ.isLoading || mapsQ.isLoading,
    error: participantsQ.error || registrationsQ.error || mapsQ.error,
  }
}
