import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const configuredOrigin = Deno.env.get('ALLOWED_ORIGIN')?.trim()
const allowedOrigins = new Set(
  [
    configuredOrigin,
    'http://localhost:5173',
    'https://blwcannexus.vercel.app',
    'https://app.blwcannexus.ca',
  ].filter(Boolean),
)

function getCorsHeaders(origin: string | null) {
  const allowOrigin = origin && allowedOrigins.has(origin)
    ? origin
    : configuredOrigin || 'https://blwcannexus.vercel.app'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function resetEmailHtml(recipientName: string, resetUrl: string) {
  const currentYear = new Date().getFullYear()
  const safeName = escapeHtml(recipientName)

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 32px 16px; background: #F7F5F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1C1610;">
        <div style="max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 14px; overflow: hidden; border: 1px solid #E9E4D8;">
          <div style="background: #4C2A92; padding: 28px 32px; text-align: center;">
            <div style="font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; color: #E8A020;">BLW CAN NEXUS</div>
            <h1 style="margin: 10px 0 0; font-size: 22px; line-height: 1.3; color: #FFFFFF; font-weight: 700;">Password Reset</h1>
          </div>
          <div style="padding: 32px;">
            <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.7;">Hello ${safeName},</p>
            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.7;">
              An administrator has requested a password reset for your BLW CAN NEXUS account.
              Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
            </p>
            <div style="margin: 0 0 24px; text-align: center;">
              <a href="${resetUrl}" style="display: inline-block; background: #E8A020; color: #1C1610; text-decoration: none; font-weight: 700; border-radius: 8px; padding: 13px 28px; font-size: 14.5px;">
                Reset Password
              </a>
            </div>
            <p style="margin: 0 0 8px; font-size: 13px; color: #7A6F5E;">If the button does not work, use this link:</p>
            <p style="margin: 0 0 20px; font-size: 13px; line-height: 1.6; word-break: break-all; color: #4C2A92;">${resetUrl}</p>
            <p style="margin: 0; font-size: 13px; color: #7A6F5E;">
              If you did not expect this email, you can safely ignore it. Your password will not change.
            </p>
          </div>
          <div style="background: #F9F7F3; border-top: 1px solid #E9E4D8; padding: 16px; text-align: center; font-size: 12px; color: #B0A696;">
            © ${currentYear} BLW CAN NEXUS. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) })
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, origin)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('INVITATION_FROM_EMAIL')
  const frontendUrl = (
    Deno.env.get('INVITATION_FRONTEND_URL') ??
    Deno.env.get('PUBLIC_APP_URL') ??
    Deno.env.get('FRONTEND_URL') ?? ''
  ).replace(/\/$/, '')

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail || !frontendUrl) {
    return jsonResponse(500, { error: 'Missing required environment variables' }, origin)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header' }, origin)
  }

  // Validate caller
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return jsonResponse(401, { error: 'Unable to validate caller' }, origin)
  }

  const { data: actor, error: actorError } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (actorError || !actor) {
    return jsonResponse(403, { error: 'Caller profile not found' }, origin)
  }

  if (actor.role !== 'super_admin') {
    return jsonResponse(403, { error: 'Only super admins can send password reset links' }, origin)
  }

  const body = (await request.json().catch(() => null)) as { user_id?: string } | null
  const targetUserId = body?.user_id

  if (!targetUserId) {
    return jsonResponse(400, { error: 'user_id is required' }, origin)
  }

  if (targetUserId === actor.id) {
    return jsonResponse(400, { error: 'Use the profile settings to reset your own password' }, origin)
  }

  // Look up the target user
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('id, name, email, status')
    .eq('id', targetUserId)
    .single()

  if (targetError || !targetUser) {
    return jsonResponse(404, { error: 'User not found' }, origin)
  }

  if (!['active', 'pending_activation'].includes(targetUser.status)) {
    return jsonResponse(422, { error: `Cannot reset password for a ${targetUser.status} account` }, origin)
  }

  // Use service-role admin client (no user auth header) to generate the recovery link
  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const redirectTo = `${frontendUrl}/reset-password`

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: targetUser.email,
    options: { redirectTo },
  })

  if (linkError || !linkData?.properties?.action_link) {
    return jsonResponse(500, { error: linkError?.message ?? 'Failed to generate reset link' }, origin)
  }

  const resetUrl = linkData.properties.action_link

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: targetUser.email,
      subject: 'Reset your BLW CAN NEXUS password',
      html: resetEmailHtml(targetUser.name ?? targetUser.email, resetUrl),
      text: [
        `Hello ${targetUser.name ?? targetUser.email},`,
        '',
        'An administrator has requested a password reset for your BLW CAN NEXUS account.',
        `Reset your password here: ${resetUrl}`,
        '',
        'This link expires in 1 hour. If you did not expect this email, you can safely ignore it.',
      ].join('\n'),
    }),
  })

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text()
    return jsonResponse(502, { error: 'Failed to send reset email', details: errorText }, origin)
  }

  await supabase.from('activity_log').insert({
    user_id: actor.id,
    action: 'password_reset_sent',
    entity_type: 'user',
    entity_id: targetUserId,
  })

  return jsonResponse(200, { sent: true, email: targetUser.email }, origin)
})
