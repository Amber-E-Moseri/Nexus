// Registered via supabase/migrations/20270730000000_setup_archive_completed_tasks_cron.sql
// (public.archive_completed_tasks_trigger(p_scope), called weekly by pg_cron
// for both the 'space' and 'personal' scopes — see that migration).
//
// Archives completed tasks so they stop cluttering department/space boards
// and personal lists while staying accessible via the Archive view
// (archived_at set, RLS-hidden from normal reads, readable through
// get_archived_tasks()). Sprint tasks and subtasks are excluded — see
// 20270729000003_archive_completed_tasks_functions.sql for the exact sweep
// predicates.
//
// AUTH: same dedicated-secret pattern as generate-recurring-meetings (see
// that function's comment for the full rationale). One-time manual setup:
//   supabase secrets set CRON_SHARED_SECRET=<reuse the existing value, or a new one>
//   insert into public.app_settings (key, value) values
//     ('archive_tasks_cron_secret', '<the same value>')
//   on conflict (key) do update set value = excluded.value;
// (This project reused the existing CRON_SHARED_SECRET / recurring_meetings_
// cron_secret pair — see 20270730000000 — so no new secret was minted.)
//
// Requires verify_jwt = false in supabase/config.toml (the Edge Functions
// gateway otherwise rejects the Authorization header as an invalid JWT
// before this code ever runs, since the shared secret isn't a signed JWT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function verifyCronSecret(req: Request): boolean {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  const expectedToken = Deno.env.get('CRON_SHARED_SECRET')
  return !!expectedToken && token === expectedToken
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }
  if (!verifyCronSecret(req)) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  let scope = 'space'
  try {
    const body = await req.json()
    if (body?.scope === 'personal') scope = 'personal'
  } catch {
    // No/invalid body — default to 'space'.
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const rpcName = scope === 'personal' ? 'archive_completed_personal_tasks' : 'archive_completed_space_tasks'
  const { data, error } = await supabase.rpc(rpcName)

  if (error) {
    return jsonResponse(500, { error: error.message, scope })
  }

  return jsonResponse(200, { archived: data ?? 0, scope })
})
