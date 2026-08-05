// Scheduled: Daily 14:00 UTC (10 am Eastern) via pg_cron.
// Fires for users inactive 3+ days. Max one dormant_nudge per 30 days per user.
// Spam guard checks email_delivery_log by recipient_email (no user_id column).

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

function buildNudgeHtml(
  firstName: string,
  frontendUrl: string,
  pendingCount: number,
  unreadMentions: number,
  year: number,
): string {
  const itemLines = [
    pendingCount > 0
      ? `<li style="margin:0;padding:7px 0;border-bottom:1px solid #f4f0e8;font-size:13px;color:#2d2a22;list-style:none;">${pendingCount} task${pendingCount !== 1 ? 's' : ''} assigned to you</li>`
      : '',
    unreadMentions > 0
      ? `<li style="margin:0;padding:7px 0;font-size:13px;color:#2d2a22;list-style:none;">${unreadMentions} mention${unreadMentions !== 1 ? 's' : ''} in meeting minutes / comments</li>`
      : '',
  ].filter(Boolean).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<div style="max-width:600px;margin:0 auto;background:#fff;">

  <div style="background:#4c2a92;padding:24px;text-align:center;">
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">Nexus</h1>
  </div>

  <div style="padding:28px;">
    <p style="margin:0 0 14px;font-size:15px;color:#2d2a22;">Hi <strong>${firstName}</strong>,</p>
    <p style="margin:0 0 20px;font-size:14px;color:#5a5248;">
      It's been a bit since you've checked Nexus — here's what's waiting for you:
    </p>

    <div style="background:#fff;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;margin-bottom:20px;">
      <ul style="margin:0;padding:0 16px;">${itemLines}</ul>
    </div>

    <p style="margin:0 0 20px;font-size:13px;color:#9e9488;">
      No pressure — just didn't want these to slip through the cracks.
    </p>

    <div style="text-align:center;margin-bottom:8px;">
      <a href="${frontendUrl}/my-tasks" style="display:inline-block;padding:14px 36px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Take a look</a>
    </div>
  </div>

  <div style="background:#f9f7f5;border-top:1px solid #e8dedd;padding:16px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9e9488;">
      If Nexus isn't a fit for your workflow right now, no worries —
      <a href="${frontendUrl}/feedback" style="color:#4c2a92;text-decoration:none;font-weight:500;">let us know</a>
      so we can improve it, or
      <a href="${frontendUrl}/settings" style="color:#4c2a92;text-decoration:none;font-weight:500;">unsubscribe from these reminders</a>.
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'Nexus <noreply@blwcannexus.ca>'
  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? 'https://nexus.lwcanada.org'

  if (!resendApiKey) return jsonResponse(500, { error: 'Missing RESEND_API_KEY' })

  const now = new Date()
  const threeDaysAgo = new Date(now)
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const today = now.toISOString().split('T')[0]
  const year = now.getFullYear()

  // ── 1. Users inactive 14+ days ───────────────────────────────────────────────
  const { data: inactiveUsers, error: usersError } = await supabase
    .from('users')
    .select('id, name, email, role, last_active_at')
    .eq('status', 'active')
    .not('email', 'is', null)
    .lt('last_active_at', threeDaysAgo.toISOString())

  if (usersError) return jsonResponse(500, { error: usersError.message })
  if (!inactiveUsers?.length) return jsonResponse(200, { sent: 0, message: 'No inactive users' })

  // ── 2. Spam guard: 30-day cap per user ──────────────────────────────────────
  // email_delivery_log has no user_id — guard by recipient_email
  const inactiveEmails = inactiveUsers.map((u) => u.email)

  const { data: recentLogs } = await supabase
    .from('email_delivery_log')
    .select('recipient_email')
    .in('recipient_email', inactiveEmails)
    .eq('email_type', 'dormant_nudge')
    .gte('sent_at', thirtyDaysAgo.toISOString())
    .eq('status', 'sent')

  const recentlyNudged = new Set((recentLogs ?? []).map((r: { recipient_email: string }) => r.recipient_email))

  // ── 3. Opted-out users ───────────────────────────────────────────────────────
  const candidateIds = inactiveUsers
    .filter((u) => !recentlyNudged.has(u.email))
    .map((u) => u.id)

  if (!candidateIds.length) return jsonResponse(200, { sent: 0, message: 'All users recently nudged' })

  const { data: optedOut } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .in('user_id', candidateIds)
    .eq('notification_type', 'dormant_nudge')
    .eq('email', false)

  const optedOutIds = new Set((optedOut ?? []).map((p: { user_id: string }) => p.user_id))
  const eligible = inactiveUsers.filter(
    (u) => !recentlyNudged.has(u.email) && !optedOutIds.has(u.id),
  )

  if (!eligible.length) return jsonResponse(200, { sent: 0, message: 'No eligible users' })

  const eligibleIds = eligible.map((u) => u.id)

  // ── 4. Open (pending) task counts ────────────────────────────────────────────
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('id, assignee_id, status_definition:status_id(category)')
    .in('assignee_id', eligibleIds)

  const pendingByUser: Record<string, number> = {}
  for (const t of allTasks ?? []) {
    const cat = (t.status_definition as { category?: string } | null)?.category ?? ''
    if (!['completed', 'cancelled'].includes(cat)) {
      pendingByUser[t.assignee_id] = (pendingByUser[t.assignee_id] ?? 0) + 1
    }
  }

  // ── 5. Unread mentions ────────────────────────────────────────────────────────
  const { data: mentionNotifs } = await supabase
    .from('notifications')
    .select('user_id')
    .in('user_id', eligibleIds)
    .eq('type', 'mention')
    .eq('read', false)

  const mentionsByUser: Record<string, number> = {}
  for (const n of mentionNotifs ?? []) {
    mentionsByUser[n.user_id] = (mentionsByUser[n.user_id] ?? 0) + 1
  }

  // ── 6. Weekly send cap (max 2 emails per person per 7 days) ─────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const eligibleEmails = eligible.map((u) => u.email).filter(Boolean)
  const { data: weeklyLogs } = await supabase
    .from('email_delivery_log')
    .select('recipient_email')
    .in('recipient_email', eligibleEmails)
    .eq('status', 'sent')
    .gte('sent_at', sevenDaysAgo)

  const weeklyCount: Record<string, number> = {}
  for (const row of weeklyLogs ?? []) {
    weeklyCount[row.recipient_email] = (weeklyCount[row.recipient_email] ?? 0) + 1
  }

  // ── 7. Send emails ───────────────────────────────────────────────────────────
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const user of eligible) {
    const cap = user.role === 'dept_lead' ? 1 : 2
    if ((weeklyCount[user.email] ?? 0) >= cap) { skipped++; continue }
    const firstName = (user.name ?? 'Team Member').split(' ')[0]
    const pendingCount = pendingByUser[user.id] ?? 0
    const unreadMentions = mentionsByUser[user.id] ?? 0

    // Skip if nothing waiting
    if (pendingCount === 0 && unreadMentions === 0) {
      skipped++
      continue
    }

    const totalWaiting = pendingCount + unreadMentions
    const subject = `${firstName}, you have ${totalWaiting} thing${totalWaiting !== 1 ? 's' : ''} waiting in Nexus`

    const html = buildNudgeHtml(firstName, frontendUrl, pendingCount, unreadMentions, year)

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, reply_to: ['info@lwcanada.org'], to: [user.email], subject, html }),
    })

    const emailResult = await emailRes.json().catch(() => ({}))

    await supabase.from('email_delivery_log').insert({
      recipient_email: user.email,
      sender_email: fromEmail,
      subject,
      email_type: 'dormant_nudge',
      resend_email_id: emailResult.id ?? null,
      status: emailRes.ok ? 'sent' : 'failed',
      http_status: emailRes.status,
      error_message: emailRes.ok ? null : JSON.stringify(emailResult),
    })

    if (emailRes.ok) sent++
    else errors.push(`${user.email}: ${emailRes.status}`)

    await new Promise((r) => setTimeout(r, 100))
  }

  return jsonResponse(200, { sent, skipped, errors: errors.length ? errors : undefined })
})
