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

function emailHtml({
  name,
  sprintName,
  role,
  expiresAt,
  setPasswordUrl,
}: {
  name: string
  sprintName: string
  role: string
  expiresAt: string
  setPasswordUrl: string
}) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2d2a22; margin: 0; padding: 0; background: #f4f1ea;">
        <div style="max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 20px; border: 1px solid #ede8dc; overflow: hidden;">
          <div style="background: #4c2a92; padding: 24px 32px;">
            <div style="font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; color: #c4a8ff;">BLW CAN NEXUS</div>
            <h1 style="margin: 8px 0 0; font-size: 22px; color: #ffffff; font-weight: 600;">You've been invited to a sprint</h1>
          </div>
          <div style="padding: 32px;">
            <p style="margin: 0 0 16px; font-size: 15px;">Hi ${name || 'there'},</p>
            <p style="margin: 0 0 16px; font-size: 15px;">
              You've been added as a <strong>${role}</strong> to the sprint <strong>"${sprintName}"</strong> on BLW CAN NEXUS.
            </p>
            <p style="margin: 0 0 24px; font-size: 15px;">
              Set your password to access the sprint. Your temporary access expires on <strong>${expiresAt}</strong>.
            </p>
            <div style="margin: 0 0 28px;">
              <a href="${setPasswordUrl}" style="display: inline-block; background: #4c2a92; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 10px; padding: 13px 24px; font-size: 14px;">
                Set your password
              </a>
            </div>
            <p style="margin: 0 0 4px; font-size: 13px; color: #7a6f5e;">If the button doesn't work, paste this link into your browser:</p>
            <p style="margin: 0; font-size: 13px; color: #7a6f5e; word-break: break-all;">${setPasswordUrl}</p>
          </div>
          <div style="background: #f9f7f5; border-top: 1px solid #ede8dc; padding: 16px 32px; font-size: 12px; color: #9e9488; text-align: center;">
            © ${new Date().getFullYear()} BLW CAN NEXUS. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('INVITATION_FROM_EMAIL')
  const appUrl = (
    Deno.env.get('INVITATION_FRONTEND_URL') ??
    Deno.env.get('PUBLIC_APP_URL') ??
    Deno.env.get('FRONTEND_URL')
  )

  const missing = [
    !supabaseUrl && 'SUPABASE_URL',
    !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    !resendApiKey && 'RESEND_API_KEY',
    !fromEmail && 'INVITATION_FROM_EMAIL',
    !appUrl && 'INVITATION_FRONTEND_URL (or PUBLIC_APP_URL / FRONTEND_URL)',
  ].filter(Boolean)

  if (missing.length > 0) {
    return jsonResponse(500, { error: `Missing env vars: ${missing.join(', ')}` })
  }

  // Verify caller is authenticated
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse(401, { error: 'Missing authorization header' })

  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !caller) return jsonResponse(401, { error: 'Unable to validate caller' })

  const body = await req.json().catch(() => null) as {
    email: string
    name?: string
    sprintId: string
    sprintName: string
    role: string
    membershipEndDate?: string | null
  } | null

  if (!body?.email || !body?.sprintId || !body?.sprintName) {
    return jsonResponse(400, { error: 'email, sprintId and sprintName are required' })
  }

  const { email, name, sprintId, sprintName, role, membershipEndDate } = body

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const cleanEmail = email.trim().toLowerCase()
  const cleanName = name?.trim() || cleanEmail.split('@')[0]

  // 1. Find or create the auth user via Admin API (ensures generateLink works)
  // Look up by email in public.users first (avoids paginated listUsers)
  const { data: existingProfile } = await adminClient
    .from('users')
    .select('id, status')
    .eq('email', cleanEmail)
    .maybeSingle()

  let userId: string
  if (existingProfile?.id) {
    userId = existingProfile.id
    // Reactivate deactivated users so they can access the sprint
    if (existingProfile.status === 'inactive') {
      await adminClient
        .from('users')
        .update({ status: 'pending_activation', deactivated_at: null, deactivated_by: null })
        .eq('id', userId)
      // Un-ban in Supabase auth if they were banned
      await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' })
    }
  } else {
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: cleanEmail,
      email_confirm: true,
      user_metadata: { name: cleanName, is_temporary: true },
      app_metadata: { provider: 'email', providers: ['email'] },
    })
    if (createError || !newUser?.user) {
      return jsonResponse(502, { error: `Failed to create user: ${createError?.message}` })
    }
    userId = newUser.user.id
  }

  // 2. Add to sprint (upserts public.users profile + sprint_members, no-op if already member)
  const { error: rpcError } = await callerClient.rpc('add_sprint_member_profile', {
    p_user_id: userId,
    p_email: cleanEmail,
    p_name: cleanName,
    p_sprint_id: sprintId,
    p_role: role,
    p_end_date: membershipEndDate || null,
  })

  if (rpcError) return jsonResponse(400, { error: rpcError.message })

  // 3. Generate invite link via Admin API
  // Redirect back to confirm-invite so it can wait for session to establish,
  // then navigate to reset-password programmatically (avoids recovery context loss)
  const redirectTo = `${appUrl.replace(/\/$/, '')}/confirm-invite`
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: cleanEmail,
    options: { redirectTo },
  })

  if (linkError || !linkData?.properties?.action_link) {
    return jsonResponse(502, { error: `Failed to generate invite link: ${linkError?.message}` })
  }

  // Store link with short code to avoid email length limits
  const code = crypto.getRandomValues(new Uint8Array(6)).reduce((a, b) => a + b.toString(16).padStart(2, '0'), '')
  await adminClient
    .from('invite_link_codes')
    .insert({
      code,
      action_link: linkData.properties.action_link,
      email: cleanEmail,
    })

  const setPasswordUrl = `${appUrl.replace(/\/$/, '')}/confirm-invite?code=${code}`

  const expiresAt = membershipEndDate
    ? new Date(membershipEndDate).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : 'sprint end'

  // 3. Send via Resend
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `BLW CAN NEXUS <${fromEmail}>`,
      to: [email.trim().toLowerCase()],
      subject: `You've been invited to the sprint "${sprintName}"`,
      html: emailHtml({ name: name || email, sprintName, role, expiresAt, setPasswordUrl }),
    }),
  })

  if (!resendRes.ok) {
    const detail = await resendRes.text()
    return jsonResponse(502, { error: 'Member added but email failed to send', detail })
  }

  const resendBody = await resendRes.json().catch(() => ({}))
  return jsonResponse(200, { sent: true, email_id: resendBody.id })
})
