import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

const PARTICIPANTS_KEY = (eventId, filters) => ['icplc_participants', eventId, filters]

/**
 * Fetch ICPLC participants for the given event, with tags joined.
 * Filters are applied server-side where possible.
 */
export function useICPLCParticipants(eventId, filters = {}) {
  return useQuery({
    queryKey: PARTICIPANTS_KEY(eventId, filters),
    queryFn: () => fetchParticipants(eventId, filters),
    enabled: !!eventId,
    staleTime: 30_000,
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
    q = q.in('participation_status', filters.participation_status)
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
  if (filters.subgroup?.length) {
    q = q.in('subgroup', filters.subgroup)
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
