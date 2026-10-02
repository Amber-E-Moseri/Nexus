import { useContext } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { ICPLCContext } from '../ICPLCContext.jsx'

const PARTICIPANTS_KEY = (eventId, filters) => ['icplc_participants', eventId, filters]

/**
 * Fetch ICPLC participants for the given event, with tags joined.
 * Filters are applied server-side where possible.
 */
/** Drop empty filter values so "no filters" always has the same cache key ({}), whichever page asks. */
function normalizeFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '')),
  )
}

export function useICPLCParticipants(eventId, filters = {}) {
  // Read scopedSubgroup from context if available (null when called outside ICPLCProvider,
  // e.g. the room-people prefetch in ICPLCPage, which should not be subgroup-scoped).
  const ctx = useContext(ICPLCContext)
  const lockedSubgroup = ctx?.scopedSubgroup ?? null

  const effectiveFilters = lockedSubgroup ? { ...filters, onlySubgroup: lockedSubgroup } : filters
  const normalized = normalizeFilters(effectiveFilters)
  return useQuery({
    queryKey: PARTICIPANTS_KEY(eventId, normalized),
    queryFn: () => fetchParticipants(eventId, effectiveFilters),
    enabled: !!eventId,
    staleTime: 30_000,
    // Data is edited from imports/migrations outside this tab; refresh when the user comes back.
    refetchOnWindowFocus: true,
  })
}

async function fetchParticipants(eventId, filters) {
  let q = supabase
    .from('icplc_participants')
    .select(`
      *,
      icplc_participant_tags(
        tag_id,
        added_at,
        icplc_tags(id, name, color)
      )
    `)
    .eq('event_id', eventId)
    .order('full_name', { ascending: true })

  if (filters.search) {
    q = q.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,alternate_email.ilike.%${filters.search}%`)
  }
  if (filters.participation_status?.length) {
    // 'likely' can be derived from 'tracking' via attendance evidence, so fetch tracking rows too
    // and let the client-side effective-participation filter (applyClientFilters) narrow them down.
    const dbStatuses = filters.participation_status.includes('likely') && !filters.participation_status.includes('tracking')
      ? [...filters.participation_status, 'tracking']
      : filters.participation_status
    q = q.in('participation_status', dbStatuses)
  }
  if (filters.registration_status?.length) {
    q = q.in('registration_status', filters.registration_status)
  }
  if (filters.passport_readiness?.length) {
    q = q.in('passport_readiness', filters.passport_readiness)
  }
  if (filters.visa_requirement?.length) {
    q = q.in('visa_requirement', filters.visa_requirement)
  }
  if (filters.visa_process_status?.length) {
    q = q.in('visa_process_status', filters.visa_process_status)
  }
  // onlySubgroup is an INCLUSION lock — set when the viewer is a group pastor scoped
  // to their own subgroup. Takes precedence; the exclusion filter below is a no-op
  // when this is active because the result set is already constrained.
  if (filters.onlySubgroup) {
    q = q.eq('subgroup', filters.onlySubgroup)
  }
  if (filters.subgroup?.length) {
    // subgroup is an EXCLUSION list. Wrap value in PostgREST double-quotes so
    // names with spaces work, and add is.null arm so unassigned participants
    // remain visible when named subgroups are hidden.
    for (const sg of filters.subgroup) {
      const escaped = sg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      q = q.or(`subgroup.neq."${escaped}",subgroup.is.null`)
    }
  }

  const { data, error } = await q
  if (error) throw error

  // Normalize tags to flat array
  return (data || []).map((p) => ({
    ...p,
    tags: (p.icplc_participant_tags || []).map((pt) => pt.icplc_tags).filter(Boolean),
  }))
}

/**
 * Mutation: create a new participant.
 */
export function useCreateParticipant(eventId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fields) => {
      const { data, error } = await supabase
        .from('icplc_participants')
        .insert({ event_id: eventId, ...fields })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['icplc_participants', eventId] })
    },
  })
}

/**
 * Mutation: update participant fields.
 */
export function useUpdateParticipant(eventId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }) => {
      const { data, error } = await supabase
        .from('icplc_participants')
        .update(fields)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['icplc_participants', eventId] })
      qc.invalidateQueries({ queryKey: ['icplc_profile', data.id] })
    },
  })
}
