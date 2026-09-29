import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deriveReadiness } from '../lib/readinessEngine.js'
import { supabase } from '../../../lib/supabase'
import { useICPLCParticipants } from './useICPLCParticipants.js'
import {
  REGISTRATION_LINK_SOURCE_TYPES,
  registrationLinkedParticipantIds,
  registrationSourceKey,
  reconciliationState,
} from '../lib/reconciliation.js'

/**
 * Working List participants with registration state DERIVED from the identity map
 * (registration_link_status), plus the registrations that still need review.
 * Registration never changes participation status.
 */
export function useICPLCWorkingList(eventId, filters = {}) {
  const participantsQ = useICPLCParticipants(eventId, filters)
  const registrationsQ = useQuery({
    queryKey: ['icplc_wl_registrations', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('registrations')
        // Only columns that exist on public.registrations (it has no status/registration_status columns;
        // selecting them made every request fail with 400 and get retried after a 1s delay).
        .select('id, event_config_id, email, full_name, first_name, last_name, submitted_at')
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
        .in('source_type', REGISTRATION_LINK_SOURCE_TYPES)
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

  // Ready => Confirmed. Persist the promotion so boards/filters/exports agree with the Overview.
  // Only tracking/likely are promoted; uncertain and not_attending are staff decisions and stay put.
  const qc = useQueryClient()
  const promoted = useRef(new Set())
  useEffect(() => {
    if (!eventId || !participants) return
    const ids = participants
      .filter((p) => (p.participation_status === 'tracking' || p.participation_status === 'likely')
        && !promoted.current.has(p.id)
        && deriveReadiness(p).readiness === 'ready')
      .map((p) => p.id)
    if (!ids.length) return
    ids.forEach((id) => promoted.current.add(id))
    // Preferred path: an RPC that also stamps the audit trail with WHY this happened. Where that function is not
    // deployed yet (PGRST202 / 42883), fall back to the direct update; the audit trigger still records who.
    supabase
      .rpc('icplc_apply_auto_confirm', { p_ids: ids })
      .then(({ error }) => {
        if (error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || ''))) {
          return supabase
            .from('icplc_participants')
            .update({ participation_status: 'confirmed' })
            .in('id', ids)
            .in('participation_status', ['tracking', 'likely'])
        }
        return { error }
      })
      .then(({ error }) => {
        // Read-only viewers (RLS) or transient failure: allow a retry next load; display is still derived.
        if (error) ids.forEach((id) => promoted.current.delete(id))
        else qc.invalidateQueries({ queryKey: ['icplc_participants', eventId] })
      })
  }, [eventId, participants, qc])

  return {
    ...derived,
    registrations: registrations || [],
    registrationMaps: maps || [],
    isLoading: participantsQ.isLoading || registrationsQ.isLoading || mapsQ.isLoading,
    error: participantsQ.error || registrationsQ.error || mapsQ.error,
  }
}
