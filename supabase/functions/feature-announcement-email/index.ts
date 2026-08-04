// Manually triggered by an admin POST with the announcement payload.
// Sends a feature announcement to all active users who haven't opted out.
//
// POST body:
// {
//   feature_name: string          — e.g. "Sprint Task Board"
//   tagline: string               — one-line hook, e.g. "Plan your sprint visually"
//   description: string           — 1-2 sentence body explaining what it does
//   benefits: string[]            — up to 3 short bullet points (optional)
//   cta_label: string             — button text, e.g. "Try it now"
//   cta_url: string               — relative path, e.g. "/sprints"
//   user_ids?: string[]           — if present, send only to these users
// }

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

async function verifyAccess(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  if (!token) return false

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return false
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    return profile?.role === 'super_admin'
  } catch {
    return false
  }
}

function buildAnnouncementHtml(
  firstName: string,
  frontendUrl: string,
  featureName: string,
  tagline: string,
  description: string,
  benefits: string[],
  ctaLabel: string,
  ctaUrl: string,
  year: number,
): string {
  const benefitRows = benefits
    .slice(0, 3)
    .map(
      (b) => `
      <li style="margin:0;padding:8px 0;border-bottom:1px solid #f4f0e8;font-size:13px;color:#2d2a22;list-style:none;display:flex;align-items:flex-start;gap:10px;">
        <span style="width:6px;height:6px;border-radius:50%;background:#4c2a92;flex-shrink:0;margin-top:5px;"></span>
        <span>${b}</span>
      </li>`,
    )
    .join('')

  const fullCtaUrl = ctaUrl.startsWith('http') ? ctaUrl : `${frontendUrl}${ctaUrl}`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<div style="max-width:600px;margin:0 auto;background:#fff;">

  <div style="background:#4c2a92;padding:24px 28px;">
    <p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.6);">Nexus</p>
    <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:99px;padding:4px 12px;margin-bottom:14px;">
      <span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.06em;text-transform:uppercase;">What's New</span>
    </div>
    <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#fff;line-height:1.2;">${featureName}</h1>
    <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.8);">${tagline}</p>
  </div>

  <div style="padding:28px 28px 0;">
    <p style="margin:0 0 20px;font-size:15px;color:#2d2a22;">Hi <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#5a5248;line-height:1.7;">${description}</p>

    ${
      benefits.length > 0
        ? `<div style="margin-bottom:24px;background:#faf8f5;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;">
        <ul style="margin:0;padding:12px 16px;">${benefitRows}</ul>
      </div>`
        : ''
    }
  </div>

  <div style="padding:8px 28px 28px;text-align:center;">
    <a href="${fullCtaUrl}" style="display:inline-block;padding:14px 36px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">${ctaLabel}</a>
  </div>

  <div style="background:#f9f7f5;border-top:1px solid #e8dedd;padding:16px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9e9488;">
      You're receiving this as an active Nexus user.
      &nbsp;·&nbsp;
      <a href="${frontendUrl}/settings/notifications" style="color:#4c2a92;text-decoration:none;font-weight:500;">Unsubscribe from announcements</a>
      &nbsp;·&nbsp; © ${year} Nexus
    </p>
  </div>

</div>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })
  if (!(await verifyAccess(req))) return jsonResponse(401, { error: 'Unauthorized' })

  const body = await req.json().catch(() => null)
  if (!body?.feature_name || !body?.description || !body?.cta_url || !body?.cta_label) {
    return jsonResponse(400, { error: 'Missing required fields: feature_name, description, cta_url, cta_label' })
  }

  const {
    feature_name,
    tagline = '',
    description,
    benefits = [],
    cta_label,
    cta_url,
    user_ids,
    department_ids,
    roles,
  } = body

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'Nexus <noreply@blwcannexus.ca>'
  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? 'https://blwcannexus.org'
  const year = new Date().getFullYear()

  if (!resendApiKey) return jsonResponse(500, { error: 'Missing RESEND_API_KEY' })

  // ── 1. Target users ──────────────────────────────────────────────────────────
  let userQuery = supabase
    .from('users')
    .select('id, name, email')
    .eq('status', 'active')
    .not('email', 'is', null)

  if (Array.isArray(user_ids) && user_ids.length) {
    userQuery = userQuery.in('id', user_ids)
  } else if (Array.isArray(department_ids) && department_ids.length) {
    userQuery = userQuery.in('department_id', department_ids)
  } else if (Array.isArray(roles) && roles.length) {
    userQuery = userQuery.in('role', roles)
  }

  const { data: users, error: usersError } = await userQuery
  if (usersError) return jsonResponse(500, { error: usersError.message })
  if (!users?.length) return jsonResponse(200, { sent: 0, message: 'No users found' })

  // ── 2. Opted-out users ───────────────────────────────────────────────────────
  const { data: optedOut } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .in('user_id', users.map((u) => u.id))
    .eq('notification_type', 'feature_announcement')
    .eq('email', false)

  const optedOutIds = new Set((optedOut ?? []).map((p: { user_id: string }) => p.user_id))
  const eligible = users.filter((u) => !optedOutIds.has(u.id))

  if (!eligible.length) return jsonResponse(200, { sent: 0, message: 'All users opted out' })

  // ── 3. Send ──────────────────────────────────────────────────────────────────
  let sent = 0
  const errors: string[] = []

  for (const user of eligible) {
    const firstName = (user.name ?? 'there').split(' ')[0]

    const html = buildAnnouncementHtml(
      firstName,
      frontendUrl,
      feature_name,
      tagline,
      description,
      benefits,
      cta_label,
      cta_url,
      year,
    )

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        reply_to: ['info@lwcanada.org'],
        to: [user.email],
        subject: `New in Nexus: ${feature_name}`,
        html,
      }),
    })

    const emailResult = await emailRes.json().catch(() => ({}))

    await supabase.from('email_delivery_log').insert({
      recipient_email: user.email,
      sender_email: fromEmail,
      subject: `New in Nexus: ${feature_name}`,
      email_type: 'feature_announcement',
      resend_email_id: emailResult.id ?? null,
      status: emailRes.ok ? 'sent' : 'failed',
      http_status: emailRes.status,
      error_message: emailRes.ok ? null : JSON.stringify(emailResult),
    })

    if (emailRes.ok) sent++
    else errors.push(`${user.email}: ${emailRes.status}`)

    await new Promise((r) => setTimeout(r, 100))
  }

  return jsonResponse(200, { sent, skipped: eligible.length - sent, errors: errors.length ? errors : undefined })
})
