// Manually triggered by an admin POST with the announcement payload.
// Sends a feature announcement to all active users who haven't opted out.
//
// POST body (standard template):
// {
//   format: "standard"
//   subject: string                 — e.g. "New in Nexus: Sprint Task Board"
//   feature_name: string            — e.g. "Sprint Task Board"
//   tagline: string                 — one-line hook (optional)
//   description: string             — 1-2 sentence body explaining what it does
//   benefits: string[]              — up to 3 short bullet points (optional)
//   cta_label: string               — button text, e.g. "Try it now"
//   cta_url: string                 — relative path, e.g. "/sprints"
// }
//
// POST body (custom HTML):
// {
//   format: "html"
//   subject: string                 — email subject line
//   customHtml: string              — custom email HTML with {{firstName}}, {{fullName}} tokens
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Nexus <noreply@blwcannexus.ca>'
const PRIMARY_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? ''
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? 'https://nexus.lwcanada.org'

const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5199',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://nexus.lwcanada.org',
  'https://blwcannexus.vercel.app',
])

const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const allowed =
    !PRIMARY_ORIGIN ||
    origin === PRIMARY_ORIGIN ||
    DEV_ORIGINS.has(origin) ||
    LOCAL_DEV_ORIGIN.test(origin)

  return {
    'Access-Control-Allow-Origin': allowed ? origin || '*' : PRIMARY_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function jsonResponse(status: number, body: Record<string, unknown>, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
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
    return ['super_admin', 'regional_secretary'].includes(profile?.role ?? '')
  } catch {
    return false
  }
}

// Sanitize HTML by removing dangerous tags and attributes (preserves inline styles)
function sanitizeHtml(html: string): string {
  let safe = html
  // Remove script tags and content
  safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  // Remove dangerous tags and content
  for (const tag of ['iframe', 'object', 'embed', 'form', 'input', 'style']) {
    safe = safe.replace(new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi'), '')
    safe = safe.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '')
  }
  // Remove event handlers
  safe = safe.replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Remove javascript: protocol
  safe = safe.replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1=$2#$2')
  return safe
}

// Personalize HTML by replacing tokens
function personalizeHtml(html: string, firstName: string, fullName: string): string {
  return html
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{fullName\}\}/g, fullName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{name\}\}/g, fullName)
}

function buildStandardAnnouncementHtml(
  featureName: string,
  tagline: string,
  description: string,
  benefits: string[],
  ctaLabel: string,
  ctaUrl: string,
): string {
  const year = new Date().getFullYear()
  const benefitRows = benefits
    .slice(0, 3)
    .map(
      (b) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f0ebe2;font-size:13px;color:#2d2a22;">
          <span style="margin-right:10px;">✓</span>${b}
        </td>
      </tr>`,
    )
    .join('')

  const fullCtaUrl = ctaUrl.startsWith('http') ? ctaUrl : `${FRONTEND_URL}${ctaUrl}`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<table style="width:100%;border-collapse:collapse;max-width:600px;margin:0 auto;">
<tr><td style="background:#fff;padding:0;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg, #4c2a92 0%, #6b3fb5 100%);padding:32px 28px;">
    <p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Nexus</p>
    <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:20px;padding:6px 14px;margin-bottom:16px;">
      <span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.06em;text-transform:uppercase;">What's New</span>
    </div>
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#fff;line-height:1.2;">${featureName}</h1>
    <p style="margin:0;font-size:16px;color:rgba(255,255,255,0.85);line-height:1.5;">${tagline}</p>
  </div>

  <!-- Body -->
  <div style="padding:32px 28px;">
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#2d2a22;">Hi {{firstName}},</p>
    <div style="margin:0 0 28px;font-size:14px;line-height:1.8;color:#5a5248;white-space:pre-wrap;">${description}</div>

    ${benefits.length > 0 ? `
    <div style="margin:28px 0;background:#faf8f5;border-radius:12px;border:1px solid #e8dedd;padding:0;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;margin:0;padding:0;">
        <tbody style="margin:0;padding:16px;">
          ${benefitRows}
        </tbody>
      </table>
    </div>` : ''}

    <!-- CTA -->
    <div style="margin:32px 0;text-align:center;">
      <a href="${fullCtaUrl}" style="display:inline-block;padding:16px 40px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">${ctaLabel}</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#f9f7f5;border-top:1px solid #e8dedd;padding:20px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9e9488;line-height:1.6;">
      You're receiving this as an active Nexus user.
      <br />
      <a href="${FRONTEND_URL}/settings" style="color:#4c2a92;text-decoration:none;font-weight:500;">Unsubscribe from announcements</a>
      <br />
      © ${year} Nexus
    </p>
  </div>

</td></tr>
</table>
</body>
</html>`
}

function buildCustomHtml(customHtml: string): string {
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<table style="width:100%;border-collapse:collapse;max-width:600px;margin:0 auto;">
<tr><td style="background:#fff;">
  ${customHtml}
  <div style="background:#f9f7f5;border-top:1px solid #e8dedd;padding:20px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9e9488;line-height:1.6;">
      You're receiving this as an active Nexus user.
      <br />
      <a href="${FRONTEND_URL}/settings" style="color:#4c2a92;text-decoration:none;font-weight:500;">Unsubscribe from announcements</a>
      <br />
      © ${year} Nexus
    </p>
  </div>
</td></tr>
</table>
</body>
</html>`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, req)
  }

  if (!(await verifyAccess(req))) {
    return jsonResponse(401, { error: 'Unauthorized' }, req)
  }

  try {
    const payload = await req.json()

    if (!payload?.subject) {
      return jsonResponse(400, { error: 'Missing required field: subject' }, req)
    }

    const format = payload.format ?? 'standard'

    // Validate format-specific fields
    if (format === 'standard') {
      if (!payload.feature_name || !payload.description || !payload.cta_url || !payload.cta_label) {
        return jsonResponse(400, { error: 'Standard format requires: feature_name, description, cta_url, cta_label' }, req)
      }
    } else if (format === 'html') {
      if (!payload.customHtml) {
        return jsonResponse(400, { error: 'HTML format requires: customHtml' }, req)
      }
    } else {
      return jsonResponse(400, { error: 'Invalid format; must be "standard" or "html"' }, req)
    }

    const {
      feature_name = '',
      tagline = '',
      description = '',
      benefits = [],
      cta_label = '',
      cta_url = '',
      customHtml = '',
      department_ids,
      roles,
      test_recipient_email,
    } = payload

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    if (!RESEND_API_KEY) {
      return jsonResponse(500, { error: 'Missing RESEND_API_KEY' }, req)
    }

    // ── 1. Target users ──────────────────────────────────────────────────
    let users: Array<{ id: string; name: string; email: string; role: string }>

    if (test_recipient_email) {
      // Test mode: send to single email only
      users = [{ id: 'test', name: 'Test User', email: test_recipient_email, role: 'test' }]
    } else {
      let userQuery = supabase
        .from('users')
        .select('id, name, email, role')
        .eq('status', 'active')
        .not('email', 'is', null)

      if (Array.isArray(department_ids) && department_ids.length) {
        userQuery = userQuery.in('department_id', department_ids)
      } else if (Array.isArray(roles) && roles.length) {
        userQuery = userQuery.in('role', roles)
      }

      const { data: queryUsers, error: usersError } = await userQuery
      if (usersError) return jsonResponse(500, { error: usersError.message }, req)
      if (!queryUsers?.length) return jsonResponse(200, { sent: 0, message: 'No active users found' }, req)
      users = queryUsers
    }

    // ── 2. Opted-out users & weekly cap ──────────────────────────────────
    let eligible = users
    let weeklyCount: Record<string, number> = {}
    let optedOutCount = 0

    if (!test_recipient_email) {
      const { data: optedOut } = await supabase
        .from('user_notification_prefs')
        .select('user_id')
        .in('user_id', users.map((u) => u.id))
        .eq('notification_type', 'feature_announcement')
        .eq('email', false)

      const optedOutIds = new Set((optedOut ?? []).map((p: { user_id: string }) => p.user_id))
      eligible = users.filter((u) => !optedOutIds.has(u.id))
      optedOutCount = optedOutIds.size

      if (!eligible.length) return jsonResponse(200, { sent: 0, skipped: optedOutCount, message: 'All users opted out' }, req)

      // ── 3. Weekly send cap (max 2 per person per 7 days) ─────────────────
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const eligibleEmails = eligible.map((u) => u.email).filter(Boolean)
      const { data: recentLogs } = await supabase
        .from('email_delivery_log')
        .select('recipient_email')
        .in('recipient_email', eligibleEmails)
        .eq('status', 'sent')
        .gte('sent_at', sevenDaysAgo)

      for (const row of recentLogs ?? []) {
        weeklyCount[row.recipient_email] = (weeklyCount[row.recipient_email] ?? 0) + 1
      }
    }

    // ── 4. Send ──────────────────────────────────────────────────────────
    let sent = 0
    let skipped = optedOutIds.size
    const errors: string[] = []

    for (const user of eligible) {
      const cap = user.role === 'dept_lead' ? 1 : 2
      if ((weeklyCount[user.email] ?? 0) >= cap) { skipped++; continue }

      const firstName = (user.name ?? 'there').split(' ')[0]
      const fullName = user.name ?? 'there'

      let html: string
      if (format === 'standard') {
        html = buildStandardAnnouncementHtml(
          feature_name,
          tagline,
          description,
          benefits as string[],
          cta_label,
          cta_url,
        )
      } else {
        const sanitized = sanitizeHtml(customHtml)
        html = buildCustomHtml(sanitized)
      }

      // Replace personalization tokens
      html = personalizeHtml(html, firstName, fullName)

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            reply_to: ['info@lwcanada.org'],
            to: [user.email],
            subject: payload.subject,
            html,
          }),
        })

        const emailResult = await emailRes.json().catch(() => ({}))

        await supabase.from('email_delivery_log').insert({
          recipient_email: user.email,
          sender_email: FROM_EMAIL,
          subject: payload.subject,
          email_type: 'feature_announcement',
          resend_email_id: emailResult.id ?? null,
          status: emailRes.ok ? 'sent' : 'failed',
          http_status: emailRes.status,
          error_message: emailRes.ok ? null : JSON.stringify(emailResult),
        })

        if (emailRes.ok) sent++
        else errors.push(`${user.email}: ${emailRes.status}`)
      } catch (e) {
        console.error('Send failed for', user.email, e)
        errors.push(`${user.email}: ${e instanceof Error ? e.message : String(e)}`)
      }

      // Rate limit: 100ms between sends
      await sleep(100)
    }

    return jsonResponse(200, {
      sent,
      skipped: test_recipient_email ? 0 : skipped + optedOutCount,
      errors: errors.length ? errors : undefined
    }, req)
  } catch (err) {
    console.error(err)
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Internal error' }, req)
  }
})
