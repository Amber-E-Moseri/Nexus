import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { overrideFieldsForEdit, setOverridePatch } from '../lib/fieldAuthority.js'

// Bulk operations over a set of participant IDs. RLS still decides what each row allows;
// these are the same writes the profile drawer makes, applied in one request per action.

const CHUNK = 200 // keeps the `in (...)` URL comfortably under request-size limits

function chunks(ids) {
  const out = []
  for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK))
  return out
}

function refresh(qc) {
  qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? '').startsWith('icplc') })
}

const PARALLEL = 10

/**
 * Set the same fields on every selected participant. Fields an import could later overwrite are recorded as
 * staff overrides, exactly like a single edit in the profile drawer, which needs each row's current
 * override_fields, so those go row by row (a few in parallel) instead of one bulk update.
 */
export function useBulkUpdateParticipants() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, fields, userId }) => {
      const overrideFields = userId ? overrideFieldsForEdit(Object.keys(fields)) : []
      if (overrideFields.length === 0) {
        for (const part of chunks(ids)) {
          const { error } = await supabase.from('icplc_participants').update(fields).in('id', part)
          if (error) throw error
        }
        return ids.length
      }

      const existing = new Map()
      for (const part of chunks(ids)) {
        const { data, error } = await supabase.from('icplc_participants').select('id, override_fields').in('id', part)
        if (error) throw error
        for (const row of data || []) existing.set(row.id, row.override_fields || {})
      }
      const patch = overrideFields.reduce((acc, f) => ({ ...acc, ...setOverridePatch(f, userId) }), {})
      let failed = 0
      let firstError = null
      for (let i = 0; i < ids.length; i += PARALLEL) {
        await Promise.all(ids.slice(i, i + PARALLEL).map(async (id) => {
          const { error } = await supabase
            .from('icplc_participants')
            .update({ ...fields, override_fields: { ...(existing.get(id) || {}), ...patch } })
            .eq('id', id)
          if (error) { failed += 1; firstError = firstError || error }
        }))
      }
      if (failed) throw new Error(`${failed} of ${ids.length} could not be updated (${firstError.message})`)
      return ids.length
    },
    onSuccess: () => refresh(qc),
  })
}

/** Add one tag to every selected participant; people who already have it are left alone. */
export function useBulkAddTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, tagId, addedBy }) => {
      const rows = ids.map((participant_id) => ({ participant_id, tag_id: tagId, added_by: addedBy ?? null }))
      for (const part of chunks(rows)) {
        const { error } = await supabase
          .from('icplc_participant_tags')
          .upsert(part, { onConflict: 'participant_id,tag_id', ignoreDuplicates: true })
        if (error) throw error
      }
      return ids.length
    },
    onSuccess: () => refresh(qc),
  })
}

/** Remove one tag from every selected participant. */
export function useBulkRemoveTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, tagId }) => {
      for (const part of chunks(ids)) {
        const { error } = await supabase
          .from('icplc_participant_tags')
          .delete()
          .eq('tag_id', tagId)
          .in('participant_id', part)
        if (error) throw error
      }
      return ids.length
    },
    onSuccess: () => refresh(qc),
  })
}
