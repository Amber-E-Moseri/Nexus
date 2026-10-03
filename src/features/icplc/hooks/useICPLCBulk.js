import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

// Bulk operations over a set of participant IDs. Each one is a narrow server-side RPC that:
//  - is SECURITY INVOKER (RLS still decides every row) and fails closed on authorization,
//  - touches only the fields it is about (never a whole participant object),
//  - returns a per-participant result instead of a single success/failure,
//  - writes the same audit trail as a single edit, tagged source = bulk_action.
// No bulk action creates a notification; push is driven by domain events, not by bulk writes.
//
// Deliberately NOT here (see the bulk audit): participation changes, Flight Not Required, registration
// confirmation, passport / visa edits, documentation assistance, delete, merge.

function refresh(qc) {
  qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? '').startsWith('icplc') })
}

async function callRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return { batchId: data?.batch_id ?? null, results: Array.isArray(data?.results) ? data.results : [] }
}

/** items: [{ id, fingerprint, expected_updated_at }] built by buildReviewItems(). */
export function useBulkMarkDocumentationReviewed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ items }) => callRpc('icplc_bulk_mark_documentation_reviewed', { p_items: items }),
    onSuccess: () => refresh(qc),
  })
}

/** Idempotently add or remove ONE tag. Never replaces a participant's other tags. */
export function useBulkSetTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, tagId, action }) => callRpc('icplc_bulk_set_tag', { p_ids: ids, p_tag_id: tagId, p_action: action }),
    onSuccess: () => refresh(qc),
  })
}
