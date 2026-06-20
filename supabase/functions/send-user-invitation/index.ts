import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

type SendMode = 'send' | 'resend'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function resolveFrontendUrl(): string {
  const configured =
    Deno.env.get('INVITATION_FRONTEND_URL') ??
    Deno.env.get('PUBLIC_APP_URL') ??
    Deno.env.get('FRONTEND_URL')

  if (!configured) {
    throw new Error('Missing INVITATION_FRONTEND_URL environment variable')
  }

  return configured.replace(/\/$/, '')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function invitationEmailHtml({
  recipientName,
  departmentName,
  roleLabel,
  activationUrl,
  expiresAt,
  inviteMessage,
}: {
  recipientName: string
  departmentName: string
  roleLabel: string
  activationUrl: string
  expiresAt: string
  inviteMessage?: string | null
}) {
  const safeInviteMessage = inviteMessage ? escapeHtml(inviteMessage) : null

  return `
    <div style="font-family: Arial, sans-serif; background: #f6f4ff; padding: 32px; color: #14142b;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 20px; padding: 32px; border: 1px solid #e8e7f2;">
        <div style="font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; color: #7b68ee;">BLW CAN NEXUS</div>
        <h1 style="margin: 16px 0 12px; font-size: 28px; line-height: 1.2;">Activate your account</h1>
        <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.7;">
          Hello ${recipientName},
        </p>
        <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.7;">
          You have been invited to join BLW CAN NEXUS as <strong>${roleLabel}</strong> in the
          <strong>${departmentName}</strong> department.
        </p>
        ${
          safeInviteMessage
            ? `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.7;">${safeInviteMessage}</p>`
            : ''
        }
        <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.7;">
          Use the button below to create your password and activate your account. This invitation expires on
          <strong>${expiresAt}</strong>.
        </p>
        <div style="margin: 0 0 24px;">
          <a href="${activationUrl}" style="display: inline-block; background: #7b68ee; color: #ffffff; text-decoration: none; font-weight: 700; border-radius: 14px; padding: 14px 24px;">
            Activate Your Account
          </a>
        </div>
        <p style="margin: 0 0 8px; font-size: 14px; color: #4e4b6a;">If the button does not work, use this link:</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.6; word-break: break-all; color: #4e4b6a;">
          ${activationUrl}
        </p>
      </div>
    </div>
  `
}

function invitationEmailText({
  recipientName,
  departmentName,
  roleLabel,
  activationUrl,
  expiresAt,
  inviteMessage,
}: {
  recipientName: string
  departmentName: string
  roleLabel: string
  activationUrl: string
  expiresAt: string
  inviteMessage?: string | null
}) {
  return [
    `Hello ${recipientName},`,
    '',
    `You have been invited to join BLW CAN NEXUS as ${roleLabel} in the ${departmentName} department.`,
    inviteMessage ? inviteMessage : null,
    `Activate your account here: ${activationUrl}`,
    `This invitation expires on ${expiresAt}.`,
  ]
    .filter(Boolean)
    .join('\n')
}

function roleLabel(role: string) {
  return role.replace('_', ' ')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('INVITATION_FROM_EMAIL')

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    return jsonResponse(500, { error: 'Missing required environment variables' })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonResponse(401, { error: 'Unable to validate caller' })
  }

  const body = (await request.json().catch(() => null)) as
    | { invitation_id?: string; mode?: SendMode }
    | null

  const invitationId = body?.invitation_id
  const mode: SendMode = body?.mode === 'resend' ? 'resend' : 'send'

  if (!invitationId) {
    return jsonResponse(400, { error: 'invitation_id is required' })
  }

  const { data: actor, error: actorError } = await supabase
    .from('users')
    .select('id, role, department_id')
    .eq('id', user.id)
    .single()

  if (actorError || !actor) {
    return jsonResponse(403, { error: 'Caller profile not found' })
  }

  if (!['super_admin', 'dept_lead'].includes(actor.role)) {
    return jsonResponse(403, { error: 'You do not have permission to send invitations' })
  }

  const loadInvitation = async () => {
    const { data, error } = await supabase
      .from('user_invitations')
      .select(`
        id,
        first_name,
        last_name,
        email,
        role,
        department_id,
        invited_by,
        invite_message,
        status,
        expires_at,
        send_count,
        delivery_status,
        departments:department_id ( name )
      `)
      .eq('id', invitationId)
      .single()

    if (error || !data) {
      throw new Error('Invitation not found')
    }

    return data
  }

  let invitation

  try {
    invitation = await loadInvitation()
  } catch (error) {
    return jsonResponse(404, { error: error.message })
  }

  if (actor.role === 'dept_lead' && invitation.department_id !== actor.department_id) {
    return jsonResponse(403, { error: 'Department leads may send invitations in their own department only' })
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    await supabase
      .from('user_invitations')
      .update({
        status: 'expired',
        delivery_status: 'expired',
        delivery_error: null,
      })
      .eq('id', invitation.id)

    return jsonResponse(422, { error: 'Invitation has expired and can no longer be sent' })
  }

  if (['accepted', 'revoked', 'expired'].includes(invitation.status)) {
    return jsonResponse(422, { error: `Invitation cannot be sent while ${invitation.status}` })
  }

  if (mode === 'resend') {
    const { error: resendError } = await supabase.rpc('resend_user_invitation', {
      p_invitation_id: invitationId,
    })

    if (resendError) {
      return jsonResponse(400, { error: resendError.message })
    }

    invitation = await loadInvitation()
  }

  const { data: tokenData, error: tokenError } = await supabase.rpc('issue_user_invitation_token', {
    p_invitation_id: invitationId,
    p_extend_expiry: mode === 'resend',
  })

  if (tokenError) {
    return jsonResponse(400, { error: tokenError.message })
  }

  const tokenPayload = Array.isArray(tokenData) ? tokenData[0] ?? null : tokenData

  if (!tokenPayload?.invitation_token) {
    return jsonResponse(500, { error: 'Failed to generate invitation token' })
  }

  const frontendUrl = resolveFrontendUrl()
  const activationUrl = `${frontendUrl}/accept-invite?token=${tokenPayload.invitation_token}`
  const departmentName = (invitation.departments as { name?: string } | null)?.name ?? 'Assigned'
  const recipientName = `${invitation.first_name} ${invitation.last_name}`.trim()
  const expiresAt = new Date(tokenPayload.expires_at ?? invitation.expires_at).toLocaleDateString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const emailPayload = {
    from: fromEmail,
    to: [invitation.email],
    subject: 'Activate your BLW CAN NEXUS account',
    html: invitationEmailHtml({
      recipientName,
      departmentName,
      roleLabel: roleLabel(invitation.role),
      activationUrl,
      expiresAt,
      inviteMessage: invitation.invite_message,
    }),
    text: invitationEmailText({
      recipientName,
      departmentName,
      roleLabel: roleLabel(invitation.role),
      activationUrl,
      expiresAt,
      inviteMessage: invitation.invite_message,
    }),
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  })

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text()
    await supabase.rpc('record_invitation_delivery_attempt', {
      p_invitation_id: invitation.id,
      p_delivery_status: 'failed',
      p_delivery_error: errorText,
    })

    await supabase.from('activity_log').insert({
      user_id: actor.id,
      action: 'invitation_failed',
      entity_type: 'user_invitation',
      entity_id: invitation.id,
    })

    return jsonResponse(502, {
      error: 'Failed to send invitation email',
      details: errorText,
    })
  }

  const resendBody = await resendResponse.json().catch(() => ({}))

  await supabase.rpc('record_invitation_delivery_attempt', {
    p_invitation_id: invitation.id,
    p_delivery_status: 'sent',
    p_delivery_error: null,
  })

  await supabase.from('activity_log').insert({
    user_id: actor.id,
    action: mode === 'resend' ? 'invitation_resent' : 'invitation_sent',
    entity_type: 'user_invitation',
    entity_id: invitation.id,
  })

  return jsonResponse(200, {
    invitation_id: invitation.id,
    delivery_status: 'sent',
    activation_url: activationUrl,
    resend: resendBody,
  })
})
