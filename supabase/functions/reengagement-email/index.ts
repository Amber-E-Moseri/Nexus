// Scheduled: Daily 14:00 UTC (10 am Eastern) via pg_cron.
// Fires for users inactive 3+ days. Max one email per 7-day window per user
// (spam guard checks email_delivery_log by recipient_email — no user_id column).

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

async function verifyServiceRole(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  const expectedToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return token === expectedToken
}

function buildReengagementHtml(
  userName: string,
  frontendUrl: string,
  daysAway: number,
  unreadCount: number,
  overdueCount: number,
  newlyAssignedCount: number,
  year: number,
): string {
  function statRow(label: string, count: number, danger: boolean) {
    const color = danger && count > 0 ? '#c0392b' : '#4c2a92'
    return `
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#2d2a22;border-bottom:1px solid #f4f0e8;">${label}</td>
        <td style="padding:10px 16px;text-align:right;font-weight:700;font-size:14px;color:${color};border-bottom:1px solid #f4f0e8;">${count}</td>
      </tr>`
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<div style="max-width:600px;margin:0 auto;background:#fff;">

  <div style="background:#4c2a92;padding:24px;text-align:center;">
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">BLW CAN NEXUS</h1>
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.8);">We miss you!</p>
  </div>

  <div style="padding:28px;">
    <p style="margin:0 0 14px;font-size:15px;">Hi <strong>${userName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#5a5248;">
      You haven't visited BLW CAN NEXUS in <strong>${daysAway} day${daysAway !== 1 ? 's' : ''}</strong>.
      Here's what's waiting for you:
    </p>

    <div style="background:#fff;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${statRow('Unread notifications', unreadCount, false)}
        ${statRow('Tasks assigned since your last visit', newlyAssignedCount, false)}
        ${statRow('Overdue tasks', overdueCount, true)}
      </table>
    </div>

    <div style="text-align:center;margin-bottom:8px;">
      <a href="${frontendUrl}/dashboard" style="display:inline-block;padding:14px 36px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Return to BLW CAN NEXUS →</a>
    </div>
  </div>

  <div style="background:#f9f7f5;border-top:1px solid #e8dedd;padding:16px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9e9488;">
      <a href="${frontendUrl}/settings/notifications" style="color:#4c2a92;text-decoration:none;font-weight:500;">Manage notification preferences</a>
      &nbsp;·&nbsp; © ${year} BLW CAN NEXUS
    </p>
  </div>

</div>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })
  if (!(await verifyServiceRole(req))) return jsonResponse(401, { error: 'Unauthorized' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'BLW CAN NEXUS <noreply@blwcannexus.ca>'
  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? 'https://blwcannexus.org'

  if (!resendApiKey) return jsonResponse(500, { error: 'Missing RESEND_API_KEY' })

  const now = new Date()
  const threeDaysAgo = new Date(now)
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const today = now.toISOString().split('T')[0]
  const year = now.getFullYear()

  // ── 1. Users inactive 3+ days ────────────────────────────────────────────────
  const { data: inactiveUsers, error: usersError } = await supabase
    .from('users')
    .select('id, name, email, last_active_at')
    .eq('status', 'active')
    .not('email', 'is', null)
    .lt('last_active_at', threeDaysAgo.toISOString())

  if (usersError) return jsonResponse(500, { error: usersError.message })
  if (!inactiveUsers?.length) return jsonResponse(200, { sent: 0, message: 'No inactive users' })

  // ── 2. Spam guard: skip users emailed within the last 7 days ────────────────
  // email_delivery_log has no user_id column — guard by recipient_email
  const inactiveEmails = inactiveUsers.map((u) => u.email)

  const { data: recentLogs } = await supabase
    .from('email_delivery_log')
    .select('recipient_email')
    .in('recipient_email', inactiveEmails)
    .in('email_type', ['weekly_recap', 'reengagement'])
    .gte('sent_at', sevenDaysAgo.toISOString())
    .eq('status', 'sent')

  const recentlyEmailed = new Set((recentLogs ?? []).map((r: { recipient_email: string }) => r.recipient_email))

  // ── 3. Opted-out users ───────────────────────────────────────────────────────
  const candidateIds = inactiveUsers
    .filter((u) => !recentlyEmailed.has(u.email))
    .map((u) => u.id)

  if (!candidateIds.length) return jsonResponse(200, { sent: 0, message: 'All users recently emailed' })

  const { data: optedOut } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .in('user_id', candidateIds)
    .eq('notification_type', 'reengagement_reminder')
    .eq('email', false)

  const optedOutIds = new Set((optedOut ?? []).map((p: { user_id: string }) => p.user_id))
  const eligible = inactiveUsers.filter(
    (u) => !recentlyEmailed.has(u.email) && !optedOutIds.has(u.id),
  )

  if (!eligible.length) return jsonResponse(200, { sent: 0, message: 'No eligible users' })

  const eligibleIds = eligible.map((u) => u.id)

  // ── 4. Bulk data for eligible users ─────────────────────────────────────────

  // Unread notifications
  const { data: unreadNotifs } = await supabase
    .from('notifications')
    .select('user_id')
    .in('user_id', eligibleIds)
    .eq('read', false)

  const unreadByUser: Record<string, number> = {}
  for (const n of unreadNotifs ?? []) {
    unreadByUser[n.user_id] = (unreadByUser[n.user_id] ?? 0) + 1
  }

  // Overdue tasks (filter completed/cancelled in JS to avoid PostgREST join filter gotcha)
  const { data: potentialOverdue } = await supabase
    .from('tasks')
    .select('id, assignee_id, status_definition:status_id(category)')
    .in('assignee_id', eligibleIds)
    .lt('due_date', today)
    .not('due_date', 'is', null)

  const overdueCountByUser: Record<string, number> = {}
  for (const t of potentialOverdue ?? []) {
    if (!['completed', 'cancelled'].includes((t.status_definition as { category?: string } | null)?.category ?? '')) {
      overdueCountByUser[t.assignee_id] = (overdueCountByUser[t.assignee_id] ?? 0) + 1
    }
  }

  // Tasks assigned since each user's last_active_at (grouped by user)
  // Load in bulk using the earliest last_active_at as the lower bound
  const earliestActive = eligible.reduce(
    (min, u) => (u.last_active_at < min ? u.last_active_at : min),
    eligible[0].last_active_at,
  )

  const { data: assignmentsSince } = await supabase
    .from('task_assignees')
    .select('user_id, assigned_at')
    .in('user_id', eligibleIds)
    .gte('assigned_at', earliestActive)

  // Map per user: count assignments after their personal last_active_at
  const userLastActive: Record<string, string> = {}
  for (const u of eligible) {
    userLastActive[u.id] = u.last_active_at
  }

  const newlyAssignedByUser: Record<string, number> = {}
  for (const a of assignmentsSince ?? []) {
    if (a.assigned_at > (userLastActive[a.user_id] ?? '')) {
      newlyAssignedByUser[a.user_id] = (newlyAssignedByUser[a.user_id] ?? 0) + 1
    }
  }

  // ── 5. Send emails ───────────────────────────────────────────────────────────
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const user of eligible) {
    const daysAway = Math.floor(
      (now.getTime() - new Date(user.last_active_at).getTime()) / (1000 * 60 * 60 * 24),
    )
    const unreadCount = unreadByUser[user.id] ?? 0
    const overdueCount = overdueCountByUser[user.id] ?? 0
    const newlyAssignedCount = newlyAssignedByUser[user.id] ?? 0

    // Skip if there's genuinely nothing to show
    if (unreadCount === 0 && overdueCount === 0 && newlyAssignedCount === 0) {
      skipped++
      continue
    }

    const html = buildReengagementHtml(
      user.name ?? 'Team Member',
      frontendUrl,
      daysAway,
      unreadCount,
      overdueCount,
      newlyAssignedCount,
      year,
    )

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [user.email],
        subject: `You have ${overdueCount > 0 ? `${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''} and ` : ''}${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''} on BLW CAN NEXUS`,
        html,
      }),
    })

    const emailResult = await emailRes.json().catch(() => ({}))

    await supabase.from('email_delivery_log').insert({
      recipient_email: user.email,
      sender_email: fromEmail,
      subject: `Re-engagement nudge for ${user.email}`,
      email_type: 'reengagement',
      resend_email_id: emailResult.id ?? null,
      status: emailRes.ok ? 'sent' : 'failed',
      http_status: emailRes.status,
      error_message: emailRes.ok ? null : JSON.stringify(emailResult),
    })

    if (emailRes.ok) {
      sent++
    } else {
      errors.push(`${user.email}: ${emailRes.status}`)
    }

    await new Promise((r) => setTimeout(r, 100))
  }

  return jsonResponse(200, { sent, skipped, errors: errors.length ? errors : undefined })
})
