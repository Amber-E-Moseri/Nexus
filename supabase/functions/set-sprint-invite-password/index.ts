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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing env vars' })
  }

  const body = await req.json().catch(() => null) as {
    token: string
    password: string
  } | null

  if (!body?.token || !body?.password) {
    return jsonResponse(400, { error: 'token and password are required' })
  }

  const { token, password } = body

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // 1. Find the token and user
  const { data: tokenData, error: tokenError } = await adminClient
    .from('sprint_invite_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (tokenError || !tokenData) {
    return jsonResponse(400, { error: 'Invalid invitation token' })
  }

  if (tokenData.used_at) {
    return jsonResponse(400, { error: 'This invitation has already been used' })
  }

  if (new Date(tokenData.expires_at) < new Date()) {
    return jsonResponse(400, { error: 'This invitation has expired' })
  }

  // 2. Update user password
  const { error: updateError } = await adminClient.auth.admin.updateUserById(tokenData.user_id, {
    password,
  })

  if (updateError) {
    return jsonResponse(502, { error: `Failed to set password: ${updateError.message}` })
  }

  // 3. Mark token as used
  const { error: markError } = await adminClient
    .from('sprint_invite_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenData.id)

  if (markError) {
    console.error('Failed to mark token as used:', markError)
  }

  return jsonResponse(200, { success: true, user_id: tokenData.user_id })
})
