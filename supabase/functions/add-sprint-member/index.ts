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

function isValidSprintRole(role: string): boolean {
  return ['owner', 'manager', 'contributor', 'viewer'].includes(role)
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
    membership_end_date?: string | null
    invite_token: string
  } | null

  if (!body?.user_id || !body?.sprint_id || !body?.invite_token) {
    return jsonResponse(400, { error: 'Missing required fields' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: inviteToken, error: tokenError } = await adminClient
    .from('sprint_invite_tokens')
    .select('sprint_id, email, expires_at, used_at, metadata')
    .eq('token', body.invite_token)
    .maybeSingle()

  if (tokenError) {
    console.error('Failed to validate invite token:', tokenError)
    return jsonResponse(500, { error: `Failed to validate invite token: ${tokenError.message}` })
  }

  if (!inviteToken) {
    return jsonResponse(400, { error: 'Invalid invite token' })
  }

  if (inviteToken.used_at) {
    return jsonResponse(400, { error: 'Invite token has already been used' })
  }

  if (new Date(inviteToken.expires_at).getTime() < Date.now()) {
    return jsonResponse(400, { error: 'Invite token has expired' })
  }

  const tokenEmail = String(inviteToken.email ?? '').trim().toLowerCase()
  const requestEmail = String(body.email ?? '').trim().toLowerCase()
  if (inviteToken.sprint_id !== body.sprint_id || tokenEmail !== requestEmail) {
    return jsonResponse(403, { error: 'Invite token does not match this signup request' })
  }

  const metadata = (inviteToken.metadata ?? {}) as {
    role?: string
    membership_end_date?: string | null
    name?: string
  }
  const sprintRole = metadata.role || 'contributor'
  const membershipEndDate = metadata.membership_end_date ?? null
  const profileName = metadata.name || body.name || tokenEmail.split('@')[0]

  if (!isValidSprintRole(sprintRole)) {
    return jsonResponse(400, { error: `Invalid sprint role in invite token: ${sprintRole}` })
  }

  // Provision the app-layer user row before inserting into sprint_members.
  // sprint_members.user_id references public.users(id), so this must exist first.
  //
  // Only create the row if it's absent — never overwrite an existing one. A
  // blind upsert here would reset an already-active user back to
  // pending_activation / is_temporary on a re-invite. A new invitee who just
  // set a password is activated, so provision them as 'active' (they're still
  // a temporary/external sprint guest via is_temporary).
  const { data: existing, error: lookupError } = await adminClient
    .from('users')
    .select('id')
    .eq('id', body.user_id)
    .maybeSingle()

  if (lookupError) {
    console.error('Failed to look up user profile:', lookupError)
    return jsonResponse(500, { error: `Failed to look up user profile: ${lookupError.message}` })
  }

  if (!existing) {
    const { error: profileError } = await adminClient
      .from('users')
      .insert({
        id: body.user_id,
        email: tokenEmail,
        name: profileName,
        status: 'active',
        is_temporary: true,
      })

    if (profileError) {
      console.error('Failed to provision user profile:', profileError)
      return jsonResponse(500, { error: `Failed to provision user profile: ${profileError.message}` })
    }
  }

  // Add user to sprint. Fall back to 'contributor' — a valid sprint_members
  // role — never 'member', which sprint_members_role_check rejects (23514).
  const { error: insertError } = await adminClient
    .from('sprint_members')
    .insert({
      user_id: body.user_id,
      sprint_id: inviteToken.sprint_id,
      role: sprintRole,
      membership_end_date: membershipEndDate,
      is_temporary: true,
    })

  if (insertError) {
    console.error('Failed to add to sprint:', insertError)
    return jsonResponse(400, { error: `Failed to add to sprint: ${insertError.message}` })
  }

  const { error: auditError } = await adminClient
    .from('activity_log')
    .insert({
      user_id: body.user_id,
      action: 'sprint_external_invite_accepted',
      entity_type: 'sprint',
      entity_id: inviteToken.sprint_id,
    })

  if (auditError) {
    console.error('Failed to write sprint invite acceptance audit log:', auditError)
  }

  // Mark invite token as used
  await adminClient
    .from('sprint_invite_tokens')
    .update({ user_id: body.user_id, used_at: new Date().toISOString() })
    .eq('token', body.invite_token)
    .catch(() => null)

  return jsonResponse(200, { success: true })
})
