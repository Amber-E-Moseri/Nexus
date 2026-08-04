// Scheduled: Monday 13:00 UTC (9 am Eastern) via pg_cron.
// Supersedes email-digest/index.ts (plain text, never formally scheduled).

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

function buildRecapHtml(
  userName: string,
  frontendUrl: string,
  completed: { title: string }[],
  assigned: { title: string }[],
  overdue: { title: string; due_date: string }[],
  unreadCount: number,
  year: number,
): string {
  function listItems(items: { title: string; due_date?: string }[]) {
    return items
      .map(
        (t) =>
          `<li style="margin:0;padding:7px 0;border-bottom:1px solid #f4f0e8;font-size:13px;color:#2d2a22;list-style:none;">` +
          t.title +
          (t.due_date
            ? ` <span style="color:#c0392b;font-size:11px;font-weight:600;">(due ${t.due_date})</span>`
            : '') +
          `</li>`,
      )
      .join('')
  }

  function section(
    emoji: string,
    title: string,
    items: { title: string; due_date?: string }[],
    emptyMsg: string,
    headerColor: string,
  ) {
    return `
      <div style="margin-bottom:20px;background:#fff;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;">
        <div style="background:${headerColor};padding:10px 16px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:15px;">${emoji}</span>
          <span style="font-size:13px;font-weight:700;color:#fff;">${title}</span>
          <span style="margin-left:auto;background:rgba(255,255,255,0.22);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;">${items.length}</span>
        </div>
        <div style="padding:10px 16px;">
          ${
            items.length > 0
              ? `<ul style="margin:0;padding:0;">${listItems(items)}</ul>`
              : `<p style="margin:0;font-size:12px;color:#b0a696;font-style:italic;">${emptyMsg}</p>`
          }
        </div>
      </div>`
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<div style="max-width:600px;margin:0 auto;background:#fff;">

  <div style="background:#4c2a92;padding:24px;text-align:center;">
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">BLW CAN NEXUS</h1>
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.8);">Your Weekly Recap</p>
  </div>

  <div style="padding:28px 28px 0;">
    <p style="margin:0 0 24px;font-size:15px;">Hi <strong>${userName}</strong>, here's what happened in your workspace this past week.</p>

    ${section('✅', 'Completed', completed, 'Nothing completed this week.', '#2d8653')}
    ${section('📋', 'Newly Assigned', assigned, 'No new tasks assigned this week.', '#2a5fa5')}
    ${section('⚠️', 'Overdue', overdue, 'No overdue tasks — great work!', '#c0392b')}

    <div style="margin-bottom:20px;background:#fff;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;">
      <div style="background:#6b4bbe;padding:10px 16px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:15px;">🔔</span>
        <span style="font-size:13px;font-weight:700;color:#fff;">Unread Notifications</span>
        <span style="margin-left:auto;background:rgba(255,255,255,0.22);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;">${unreadCount}</span>
      </div>
      <div style="padding:10px 16px;">
        ${
          unreadCount > 0
            ? `<p style="margin:0;font-size:13px;color:#2d2a22;">You have <strong>${unreadCount}</strong> unread notification${unreadCount !== 1 ? 's' : ''} waiting in your inbox.</p>`
            : `<p style="margin:0;font-size:12px;color:#b0a696;font-style:italic;">All caught up!</p>`
        }
      </div>
    </div>
  </div>

  <div style="padding:8px 28px 28px;text-align:center;">
    <a href="${frontendUrl}/dashboard" style="display:inline-block;padding:12px 28px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Go to Dashboard →</a>
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

  // ── 1. Active users ──────────────────────────────────────────────────────────
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('status', 'active')
    .not('email', 'is', null)

  if (usersError) return jsonResponse(500, { error: usersError.message })
  if (!users?.length) return jsonResponse(200, { sent: 0, message: 'No active users' })

  // ── 2. Opted-out users ───────────────────────────────────────────────────────
  const { data: optedOut } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .eq('notification_type', 'weekly_recap')
    .eq('email', false)

  const optedOutIds = new Set((optedOut ?? []).map((p: { user_id: string }) => p.user_id))
  const eligible = users.filter((u) => u.email && !optedOutIds.has(u.id))

  if (!eligible.length) return jsonResponse(200, { sent: 0, message: 'All users opted out' })

  const userIds = eligible.map((u) => u.id)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoIso = sevenDaysAgo.toISOString()
  const today = new Date().toISOString().split('T')[0]

  // ── 3. Completed tasks this week ─────────────────────────────────────────────
  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('id, title, assignee_id')
    .in('assignee_id', userIds)
    .gte('completed_at', sevenDaysAgoIso)
    .not('completed_at', 'is', null)

  // ── 4. Newly assigned tasks this week (via task_assignees) ───────────────────
  const { data: newAssignments } = await supabase
    .from('task_assignees')
    .select('user_id, tasks(title)')
    .in('user_id', userIds)
    .gte('assigned_at', sevenDaysAgoIso)

  // ── 5. Overdue tasks (load all, filter by status category in JS) ─────────────
  const { data: potentialOverdue } = await supabase
    .from('tasks')
    .select('id, title, assignee_id, due_date, status_definition:status_id(category)')
    .in('assignee_id', userIds)
    .lt('due_date', today)
    .not('due_date', 'is', null)

  const overdueTasks = (potentialOverdue ?? []).filter(
    (t: { status_definition?: { category?: string } }) =>
      !['completed', 'cancelled'].includes(t.status_definition?.category ?? ''),
  )

  // ── 6. Unread notification counts per user ───────────────────────────────────
  const { data: unreadNotifs } = await supabase
    .from('notifications')
    .select('user_id')
    .in('user_id', userIds)
    .eq('read', false)

  const unreadByUser: Record<string, number> = {}
  for (const n of unreadNotifs ?? []) {
    unreadByUser[n.user_id] = (unreadByUser[n.user_id] ?? 0) + 1
  }

  // ── 7. Group data by user ────────────────────────────────────────────────────
  const completedByUser: Record<string, { title: string }[]> = {}
  for (const t of completedTasks ?? []) {
    ;(completedByUser[t.assignee_id] ??= []).push({ title: t.title })
  }

  const assignedByUser: Record<string, { title: string }[]> = {}
  for (const a of newAssignments ?? []) {
    const title = (a.tasks as { title?: string } | null)?.title
    if (title) {
      ;(assignedByUser[a.user_id] ??= []).push({ title })
    }
  }

  const overdueByUser: Record<string, { title: string; due_date: string }[]> = {}
  for (const t of overdueTasks) {
    ;(overdueByUser[t.assignee_id] ??= []).push({ title: t.title, due_date: t.due_date })
  }

  // ── 8. Send emails ───────────────────────────────────────────────────────────
  const year = new Date().getFullYear()
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const user of eligible) {
    const userCompleted = completedByUser[user.id] ?? []
    const userAssigned = assignedByUser[user.id] ?? []
    const userOverdue = overdueByUser[user.id] ?? []
    const userUnread = unreadByUser[user.id] ?? 0

    // Skip if nothing to recap
    if (!userCompleted.length && !userAssigned.length && !userOverdue.length && userUnread === 0) {
      skipped++
      continue
    }

    const html = buildRecapHtml(
      user.name ?? 'Team Member',
      frontendUrl,
      userCompleted,
      userAssigned,
      userOverdue,
      userUnread,
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
        subject: `Your BLW CAN NEXUS weekly recap`,
        html,
      }),
    })

    const emailResult = await emailRes.json().catch(() => ({}))

    // Log delivery (email_delivery_log.user_id doesn't exist — log by email)
    await supabase.from('email_delivery_log').insert({
      recipient_email: user.email,
      sender_email: fromEmail,
      subject: 'Your BLW CAN NEXUS weekly recap',
      email_type: 'weekly_recap',
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
