import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization', 401)

    // Single client: service role key + caller JWT header so auth.uid() resolves correctly
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify caller has ICPLC write capability (enforced in RPC too; belt-and-suspenders)
    const { data: canWrite, error: permErr } = await supabase.rpc('icplc_can_write_participants')
    if (permErr || !canWrite) return errorResponse('Access denied', 403)

    // Resolve caller identity for activity_log
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    const actorUserId = user?.id ?? null

    const { batch_id } = await req.json()
    if (!batch_id) return errorResponse('batch_id required', 400)

    // CAS: atomically transition batch 'previewed' → 'applying'.
    // A concurrent call finds status ≠ 'previewed' and gets 409.
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

    // Fetch matched rows for this batch
    const { data: rows, error: rowsErr } = await supabase
      .from('icplc_import_rows')
      .select('id, participant_id, match_status')
      .eq('batch_id', batch_id)
      .in('match_status', ['auto', 'manual', 'persistent'])

    if (rowsErr) throw rowsErr

    let applied = 0
    let protected_ = 0
    let errorCount = 0

    // Each row processed via icplc_apply_import_row — one PostgreSQL transaction per participant.
    // Failure of one row does not roll back others.
    for (const row of rows ?? []) {
      if (!row.participant_id) continue

      const { data: result, error: applyErr } = await supabase.rpc('icplc_apply_import_row', {
        p_row_id:              row.id,
        p_batch_id:            batch_id,
        p_preview_computed_at: batch.preview_computed_at,
        p_actor_user_id:       actorUserId,
      })

      if (applyErr) {
        // RPC itself errored (not a row-level error that was caught inside)
        await supabase
          .from('icplc_import_rows')
          .update({ apply_status: 'error', error_detail: applyErr.message })
          .eq('id', row.id)
        errorCount++
        continue
      }

      if (result?.error) {
        errorCount++
      } else {
        applied += result?.applied ?? 0
        protected_ += result?.protected ?? 0
      }
    }

    // Finalize batch
    await supabase
      .from('icplc_import_batches')
      .update({
        status:       'applied',
        imported_at:  new Date().toISOString(),
        error_rows:   errorCount,
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

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
