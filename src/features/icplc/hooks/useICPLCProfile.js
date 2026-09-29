import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { setOverridePatch, clearOverridePatch } from '../lib/fieldAuthority.js'
import { REGISTRATION_LINK_SOURCE_TYPES, REGISTRATION_SOURCE_TYPE, registrationLinkedParticipantIds } from '../lib/reconciliation.js'

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
    registration_link_status: await fetchRegistrationLinkStatus(participant),
    tags: (tags || []).map((pt) => pt.icplc_tags).filter(Boolean),
  }
}

/**
 * Same derivation as the Working List (useICPLCWorkingList): registered = linked through the identity map
 * to a valid registration. The participants.registration_status column is a manual/legacy field and is
 * often stale, so the drawer must not rely on it alone.
 */
async function fetchRegistrationLinkStatus(participant) {
  const { data: maps, error: mErr } = await supabase
    .from('icplc_identity_maps')
    .select('source_type, source_key, participant_id')
    .eq('participant_id', participant.id)
    .in('source_type', REGISTRATION_LINK_SOURCE_TYPES)
  if (mErr) throw mErr
  const mapRows = maps || []
  // Only legacy 'registration' links point at public.registrations rows (UUID ids). Registration CSV keys are text
  // ids like ICPLC2026-000007; looking those up as uuids makes PostgREST return 400 and the whole profile fails.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const keys = mapRows
    .filter((m) => m.source_type === REGISTRATION_SOURCE_TYPE && UUID.test(String(m.source_key)))
    .map((m) => m.source_key)
  let regs = []
  if (keys.length) {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, event_config_id, email, full_name, first_name, last_name, submitted_at')
      .in('id', keys)
    if (error) throw error
    regs = data || []
  }
  const linked = registrationLinkedParticipantIds(regs, mapRows, participant.event_id)
  return linked.has(participant.id) ? 'registered' : 'not_registered'
}

/**
 * Fetch activity log entries for a participant.
 */
export function useICPLCActivity(participantId) {
  return useQuery({
    queryKey: ACTIVITY_KEY(participantId),
    queryFn: async () => {
      // Join the user so the tab can say who made each change. If that join is unavailable (permissions on
      // users), fall back to the bare log rather than showing no history at all.
      let { data, error } = await supabase
        .from('activity_log')
        .select('*, users(name, email)')
        .eq('entity_type', 'icplc_participant')
        .eq('entity_id', participantId)
        .order('timestamp', { ascending: false })
        .limit(100)
      if (error) {
        ;({ data, error } = await supabase
          .from('activity_log')
          .select('*')
          .eq('entity_type', 'icplc_participant')
          .eq('entity_id', participantId)
          .order('timestamp', { ascending: false })
          .limit(100))
      }
      if (error) throw error
      // activity_log's time column is "timestamp"; expose it as created_at for the UI.
      return (data || []).map((row) => ({ ...row, created_at: row.timestamp }))
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
    mutationFn: async ({ id, fields, setOverride, overrideField, overrideFields, userId }) => {
      let update = { ...fields }
      const fieldsToOverride = overrideFields || (overrideField ? [overrideField] : [])
      if (setOverride && fieldsToOverride.length && userId) {
        const current = qc.getQueryData(PROFILE_KEY(id))
        const existing = current?.override_fields || {}
        update.override_fields = fieldsToOverride.reduce(
          (acc, field) => ({ ...acc, ...setOverridePatch(field, userId) }),
          { ...existing },
        )
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
      qc.invalidateQueries({ queryKey: ['icplc_participants'] })
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
      qc.invalidateQueries({ queryKey: ['icplc_participants'] })
    },
  })
}

// Merging/deleting touches participants, tags, registration links and derived counts everywhere.
function invalidateAllICPLC(qc) {
  qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? '').startsWith('icplc') })
}

/**
 * Mutation: merge `removeId` into `keepId` (server-side, one transaction).
 * `choices` maps a conflicting field name -> 'remove' to take the duplicate's value (default keeps).
 */
export function useMergeParticipants() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ keepId, removeId, choices = {} }) => {
      const { data, error } = await supabase.rpc('icplc_merge_participants', {
        p_keep: keepId,
        p_remove: removeId,
        p_choices: choices,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_, { removeId }) => {
      qc.removeQueries({ queryKey: PROFILE_KEY(removeId) })
      invalidateAllICPLC(qc)
    },
  })
}

/** Mutation: permanently delete a participant (super admin / regional secretary only). */
export function useDeleteParticipant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participantId) => {
      const { error } = await supabase.rpc('icplc_delete_participant', { p_id: participantId })
      if (error) throw error
    },
    onSuccess: (_, participantId) => {
      qc.removeQueries({ queryKey: PROFILE_KEY(participantId) })
      invalidateAllICPLC(qc)
    },
  })
}
