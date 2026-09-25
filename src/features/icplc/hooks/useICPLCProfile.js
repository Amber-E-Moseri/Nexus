import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { setOverridePatch, clearOverridePatch } from '../lib/fieldAuthority.js'

const PROFILE_KEY = (id) => ['icplc_profile', id]
const ACTIVITY_KEY = (id) => ['icplc_activity', id]

/**
 * Fetch a single canonical participant profile with tags and activity log.
 */
export function useICPLCProfile(participantId) {
  return useQuery({
    queryKey: PROFILE_KEY(participantId),
    queryFn: () => fetchProfile(participantId),
    enabled: !!participantId,
    staleTime: 15_000,
  })
}

async function fetchProfile(id) {
  const [{ data: participant, error: pErr }, { data: tags, error: tErr }] =
    await Promise.all([
      supabase
        .from('icplc_participants')
        .select('*')
        .eq('id', id)
        .single(),
      supabase
        .from('icplc_participant_tags')
        .select('tag_id, added_at, icplc_tags(id, name, color)')
        .eq('participant_id', id),
    ])
  if (pErr) throw pErr
  if (tErr) throw tErr
  return {
    ...participant,
    tags: (tags || []).map((pt) => pt.icplc_tags).filter(Boolean),
  }
}

/**
 * Fetch activity log entries for a participant.
 */
export function useICPLCActivity(participantId) {
  return useQuery({
    queryKey: ACTIVITY_KEY(participantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('entity_type', 'icplc_participant')
        .eq('entity_id', participantId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data || []
    },
    enabled: !!participantId,
    staleTime: 30_000,
  })
}

/**
 * Mutation: update participant fields, optionally setting an override.
 */
export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fields, setOverride, overrideField, userId }) => {
      let update = { ...fields }
      if (setOverride && overrideField && userId) {
        const current = qc.getQueryData(PROFILE_KEY(id))
        const existing = current?.override_fields || {}
        update.override_fields = { ...existing, ...setOverridePatch(overrideField, userId) }
      }
      const { data, error } = await supabase
        .from('icplc_participants')
        .update(update)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PROFILE_KEY(data.id) })
      qc.invalidateQueries({ queryKey: ['icplc_participants', data.event_id] })
    },
  })
}

/**
 * Mutation: clear a field override ("Resume source sync").
 */
export function useClearFieldOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, field }) => {
      const current = qc.getQueryData(PROFILE_KEY(id))
      const existing = current?.override_fields || {}
      const patch = { ...existing }
      delete patch[field]
      const { data, error } = await supabase
        .from('icplc_participants')
        .update({ override_fields: patch })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PROFILE_KEY(data.id) })
      qc.invalidateQueries({ queryKey: ['icplc_participants', data.event_id] })
    },
  })
}

/**
 * Mutation: add a tag to a participant.
 */
export function useAddTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ participantId, tagId, addedBy }) => {
      const { error } = await supabase
        .from('icplc_participant_tags')
        .insert({ participant_id: participantId, tag_id: tagId, added_by: addedBy })
      if (error) throw error
    },
    onSuccess: (_, { participantId }) => {
      qc.invalidateQueries({ queryKey: PROFILE_KEY(participantId) })
    },
  })
}

/**
 * Mutation: remove a tag from a participant.
 */
export function useRemoveTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ participantId, tagId }) => {
      const { error } = await supabase
        .from('icplc_participant_tags')
        .delete()
        .eq('participant_id', participantId)
        .eq('tag_id', tagId)
      if (error) throw error
    },
    onSuccess: (_, { participantId }) => {
      qc.invalidateQueries({ queryKey: PROFILE_KEY(participantId) })
    },
  })
}
