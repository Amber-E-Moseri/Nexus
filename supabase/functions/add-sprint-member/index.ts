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
    team_ids?: string[]
  }
  const sprintRole = metadata.role || 'contributor'
  const membershipEndDate = metadata.membership_end_date ?? null
  const profileName = metadata.name || body.name || tokenEmail.split('@')[0]
  const teamIds = Array.isArray(metadata.team_ids) ? metadata.team_ids : []

  if (!isValidSprintRole(sprintRole)) {
    return jsonResponse(400, { error: `Invalid sprint role in invite token: ${sprintRole}` })
  }

  // Revalidate token metadata at acceptance. This protects invitees who were
  // sent a legacy or manually-created token with team IDs from another sprint.
  if (teamIds.length > 0) {
    const { data: teams, error: teamsError } = await adminClient
      .from('sprint_teams')
      .select('id')
      .eq('sprint_id', inviteToken.sprint_id)
      .in('id', teamIds)

    if (teamsError) {
      console.error('Failed to validate sprint teams:', teamsError)
      return jsonResponse(500, { error: `Failed to validate sprint teams: ${teamsError.message}` })
    }

    if ((teams?.length ?? 0) !== teamIds.length) {
      return jsonResponse(400, { error: 'This invitation includes a team that is no longer part of the sprint. Ask the inviter to send a new invitation.' })
    }
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

  // effectiveUserId is the users row we'll put in sprint_members.
  // It's usually body.user_id but can differ when an existing users row was
  // found by email (e.g. a placeholder row from a prior invite attempt that
  // left a different auth user behind).
  let effectiveUserId = body.user_id

  if (!existing) {
    // Check if the email already has a users row under a different auth UUID.
    // This happens when a previous invite attempt created a placeholder row
    // (via invite_external_sprint_member or a partial prior signup) and that
    // auth user was later deleted while the cascade somehow didn't clean up,
    // or when a new auth user was created before the old row was removed.
    const { data: existingByEmail } = await adminClient
      .from('users')
      .select('id')
      .eq('email', tokenEmail)
      .maybeSingle()

    if (existingByEmail) {
      // Reuse the existing row. The new auth user (body.user_id) becomes an
      // orphaned account — acceptable; it has no profile or sprint access.
      console.warn(`Email conflict: reusing existing users row ${existingByEmail.id} instead of new auth user ${body.user_id}`)
      effectiveUserId = existingByEmail.id
    } else {
      // External sprint members don't need a department assignment.
      // Multi-dept sprints are decoupled from spaces; task and sprint RLS
      // gates them via is_sprint_member() instead of current_user_department().
      const { error: profileError } = await adminClient
        .from('users')
        .insert({
          id: body.user_id,
          email: tokenEmail,
          name: profileName,
          status: 'active',
          is_temporary: true,
          department_id: null,
        })

      if (profileError) {
        console.error('Failed to provision user profile:', profileError)
        return jsonResponse(500, { error: `Failed to provision user profile: ${profileError.message}` })
      }
    }
  }

  // Add user to sprint. Fall back to 'contributor' — a valid sprint_members
  // role — never 'member', which sprint_members_role_check rejects (23514).
  // ON CONFLICT: if user is already a member (e.g. re-invite), update their role/end-date.
  const { error: insertError } = await adminClient
    .from('sprint_members')
    .upsert({
      user_id: effectiveUserId,
      sprint_id: inviteToken.sprint_id,
      role: sprintRole,
      membership_end_date: membershipEndDate,
      is_temporary: true,
    }, { onConflict: 'sprint_id,user_id', ignoreDuplicates: false })

  if (insertError) {
    console.error('Failed to add to sprint:', insertError)
    return jsonResponse(400, { error: `Failed to add to sprint: ${insertError.message}` })
  }

  // Add to any sprint teams specified at invite time
  if (teamIds.length > 0) {
    const teamRows = teamIds.map((teamId) => ({
      sprint_id: inviteToken.sprint_id,
      team_id: teamId,
      user_id: effectiveUserId,
    }))
    const { error: teamError } = await adminClient
      .from('sprint_team_members')
      .upsert(teamRows, { onConflict: 'team_id,user_id', ignoreDuplicates: true })
    if (teamError) {
      console.error('Failed to add to sprint teams:', teamError)
      return jsonResponse(500, { error: `Failed to add to the selected sprint teams: ${teamError.message}` })
    }
  }

  const { error: auditError } = await adminClient
    .from('activity_log')
    .insert({
      user_id: effectiveUserId,
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
