import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fields that import is permitted to mutate. Participation status is NOT listed —
// it is staff-managed exclusively and must never be written by import.
const IMPORT_MUTABLE_FIELDS = [
  'registration_status',
  'passport_readiness',
  'visa_process_status',
  'arrival_date',
  'arrival_time',
  'arrival_flight',
  'departure_date',
  'departure_time',
  'departure_flight',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization', 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify caller has write capability on icplc_participants.
    const { data: canWrite, error: permErr } = await supabase.rpc('icplc_can_write_participants')
    if (permErr || !canWrite) return errorResponse('Access denied', 403)

    const { batch_id } = await req.json()
    if (!batch_id) return errorResponse('batch_id required', 400)

    // CAS: atomically transition batch from 'previewed' → 'applying'.
    // If this fails, another concurrent call got there first.
    const { data: batch, error: casErr } = await supabase
      .from('icplc_import_batches')
      .update({ status: 'applying' })
      .eq('id', batch_id)
      .eq('status', 'previewed')
      .select('id, event_id, preview_computed_at')
      .single()

    if (casErr || !batch) {
      return errorResponse('Batch not in previewed state or concurrent apply in progress', 409)
    }

    // Fetch all matched import rows for this batch.
    const { data: rows, error: rowsErr } = await supabase
      .from('icplc_import_rows')
      .select('id, participant_id, match_status, changes_preview')
      .eq('batch_id', batch_id)
      .in('match_status', ['auto', 'manual', 'persistent'])

    if (rowsErr) throw rowsErr

    const previewComputedAt = batch.preview_computed_at

    let applied = 0
    let protected_ = 0
    let errorCount = 0

    // Process each participant independently — failure of one must not roll back others.
    for (const row of rows ?? []) {
      if (!row.participant_id) continue

      try {
        // Re-fetch current participant state from DB (not the preview snapshot).
        const { data: participant, error: fetchErr } = await supabase
          .from('icplc_participants')
          .select('*')
          .eq('id', row.participant_id)
          .single()

        if (fetchErr || !participant) {
          await markRowError(supabase, row.id, `Participant ${row.participant_id} not found`)
          errorCount++
          continue
        }

        const overrideFields = participant.override_fields ?? {}
        const sourceValues = { ...(participant.source_values ?? {}) }
        const changesPreview = row.changes_preview ?? {}

        const fieldUpdates: Record<string, unknown> = {}
        const rowResult: Record<string, string> = {}
        let anyApplied = false
        let anyProtected = false

        for (const field of IMPORT_MUTABLE_FIELDS) {
          const decision = changesPreview[field]
          if (!decision) continue

          // Re-check override at apply time (staff may have set override after preview).
          if (overrideFields[field]?.overridden === true) {
            rowResult[field] = 'protected'
            anyProtected = true
            protected_++
            continue
          }

          // If participant was updated after preview, re-evaluate this field.
          if (previewComputedAt && participant.updated_at > previewComputedAt) {
            // Conservative: if the current DB value differs from what preview saw,
            // skip this field (the staff edit takes precedence).
            if (decision.current_value !== undefined && participant[field] !== decision.current_value) {
              rowResult[field] = 'skipped_stale'
              continue
            }
          }

          if (decision.decision === 'update' && decision.incoming_value !== undefined) {
            fieldUpdates[field] = decision.incoming_value
            // Update source provenance regardless.
            sourceValues[field] = {
              value: decision.incoming_value,
              source: decision.source,
              observed_at: new Date().toISOString(),
              batch_id: batch_id,
            }
            rowResult[field] = 'updated'
            anyApplied = true
          } else if (decision.decision === 'no_change') {
            // Still update source provenance to reflect latest observation.
            if (decision.source) {
              sourceValues[field] = {
                value: participant[field],
                source: decision.source,
                observed_at: new Date().toISOString(),
                batch_id: batch_id,
              }
            }
            rowResult[field] = 'no_change'
          } else if (decision.decision === 'protected') {
            rowResult[field] = 'protected'
            anyProtected = true
            protected_++
          }
        }

        if (Object.keys(fieldUpdates).length > 0) {
          const { error: updateErr } = await supabase
            .from('icplc_participants')
            .update({ ...fieldUpdates, source_values: sourceValues })
            .eq('id', row.participant_id)
          if (updateErr) throw updateErr
        } else if (Object.keys(sourceValues).length > Object.keys(participant.source_values ?? {}).length) {
          // Update source_values provenance even when no field changed.
          await supabase
            .from('icplc_participants')
            .update({ source_values: sourceValues })
            .eq('id', row.participant_id)
        }

        // Log to activity_log.
        const action = anyApplied ? 'import_applied' : anyProtected ? 'import_protected' : 'import_no_change'
        await supabase.from('activity_log').insert({
          entity_type: 'icplc_participant',
          entity_id: row.participant_id,
          action,
          metadata: { batch_id, field_results: rowResult },
        })

        // Mark import row apply status.
        const applyStatus = anyApplied ? 'updated' : anyProtected ? 'protected' : 'kept'
        await supabase
          .from('icplc_import_rows')
          .update({ apply_status: applyStatus })
          .eq('id', row.id)

        if (anyApplied) applied++
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr)
        await markRowError(supabase, row.id, msg)
        errorCount++
      }
    }

    // Finalize batch status.
    await supabase
      .from('icplc_import_batches')
      .update({
        status: 'applied',
        imported_at: new Date().toISOString(),
        matched_rows: applied,
        error_rows: errorCount,
      })
      .eq('id', batch_id)

    return new Response(
      JSON.stringify({ applied, protected: protected_, errors: errorCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return errorResponse(msg, 500)
  }
})

async function markRowError(supabase: ReturnType<typeof createClient>, rowId: string, detail: string) {
  await supabase
    .from('icplc_import_rows')
    .update({ apply_status: 'error', error_detail: detail })
    .eq('id', rowId)
}

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
