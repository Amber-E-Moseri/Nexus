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

  // 1. Find the token with sprint data
  const { data: tokenData, error: tokenError } = await adminClient
    .from('sprint_invite_tokens')
    .select('id, email, expires_at, used_at, sprint_id, metadata')
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

  const metadata = tokenData.metadata || {}

  // 2. Create user with password and proper metadata
  const { data: { user: newUser }, error: createError } = await adminClient.auth.admin.createUser({
    email: tokenData.email,
    password,
    email_confirm: true,
    user_metadata: { name: metadata.name },
    app_metadata: {
      provider: 'email',
      providers: ['email']
    },
  })

  if (createError || !newUser?.id) {
    return jsonResponse(502, { error: `Failed to create user: ${createError?.message || 'Unknown error'}` })
  }
  const userId = newUser.id

  // 3. Add user to sprint via RPC
  const { error: rpcError } = await adminClient.rpc('add_sprint_member_profile', {
    p_user_id: userId,
    p_email: tokenData.email,
    p_name: metadata.name,
    p_sprint_id: tokenData.sprint_id,
    p_role: metadata.role,
    p_end_date: metadata.membership_end_date || null,
  })

  if (rpcError) {
    return jsonResponse(400, { error: `Failed to add to sprint: ${rpcError.message}` })
  }

  // 4. Update token with user_id
  await adminClient
    .from('sprint_invite_tokens')
    .update({ user_id: userId })
    .eq('id', tokenData.id)
    .catch(() => null)

  // 5. Generate session for immediate login
  const { data: { session }, error: sessionError } = await adminClient.auth.admin.createSession({
    user_id: userId,
  })

  // 6. Mark token as used
  const { error: markError } = await adminClient
    .from('sprint_invite_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenData.id)

  if (markError) {
    console.error('Failed to mark token as used:', markError)
  }

  return jsonResponse(200, {
    success: true,
    user_id: userId,
    session: session ? {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    } : null,
    session_error: sessionError ? sessionError.message : null,
  })
})
