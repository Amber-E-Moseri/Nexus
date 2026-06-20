import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    })
  }
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing env vars' })
  }

  const body = await req.json().catch(() => null) as {
    user_id: string
    email: string
    name: string
    sprint_id: string
    role: string
    invite_token: string
  } | null

  if (!body?.user_id || !body?.sprint_id || !body?.invite_token) {
    return jsonResponse(400, { error: 'Missing required fields' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Add user to sprint - use a system user as inviter since this is from invite flow
  const { error: insertError } = await adminClient
    .from('sprint_members')
    .insert({
      user_id: body.user_id,
      sprint_id: body.sprint_id,
      role: body.role || 'member',
      membership_end_date: null,
      is_temporary: false,
    })
    .catch(() => ({ error: null }))

  if (insertError) {
    return jsonResponse(400, { error: `Failed to add to sprint: ${insertError.message}` })
  }

  // Mark invite token as used
  await adminClient
    .from('sprint_invite_tokens')
    .update({ user_id: body.user_id, used_at: new Date().toISOString() })
    .eq('token', body.invite_token)
    .catch(() => null)

  return jsonResponse(200, { success: true })
})
