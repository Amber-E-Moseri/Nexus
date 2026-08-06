// Scheduled: Monday 13:00 UTC (9 am Eastern) via pg_cron.
// Forward-looking digest: open tasks, due this week, overdue, top priorities, sprint %.
// dept_lead / super_admin also get a team engagement table at the top.

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

async function verifyAccess(req: Request, supabaseAdmin: ReturnType<typeof createClient>): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  if (!token) return false
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return false
    const { data: profile } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single()
    return profile?.role === 'super_admin'
  } catch { return false }
}

type TopTask = { title: string; due_date: string | null; department: string | null }
type TeamMember = { name: string; openCount: number; overdueCount: number; lastActiveAt: string | null }

function lastSeenLabel(iso: string | null): { text: string; color: string } {
  if (!iso) return { text: 'Never', color: '#c0392b' }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return { text: 'Today', color: '#2d8653' }
  if (days === 1) return { text: 'Yesterday', color: '#5a5248' }
  if (days < 4) return { text: `${days} days ago`, color: '#5a5248' }
  if (days < 7) return { text: `${days} days ago`, color: '#b8620a' }
  return { text: `${days}+ days ago`, color: '#c0392b' }
}

function buildDigestHtml(
  firstName: string,
  frontendUrl: string,
  openCount: number,
  dueThisWeekCount: number,
  overdueCount: number,
  topTasks: TopTask[],
  sprintName: string | null,
  sprintPercent: number | null,
  year: number,
  teamMembers: TeamMember[],
): string {
  function teamSection() {
    if (!teamMembers.length) return ''
    const rows = teamMembers.map((m) => {
      const seen = lastSeenLabel(m.lastActiveAt)
      return `
        <tr style="border-bottom:1px solid #f4f0e8;">
          <td style="padding:9px 16px;font-size:13px;color:#2d2a22;font-weight:500;">${m.name}</td>
          <td style="padding:9px 12px;text-align:center;font-size:13px;font-weight:700;color:${m.openCount > 0 ? '#2a5fa5' : '#b0a696'};">${m.openCount}</td>
          <td style="padding:9px 12px;text-align:center;font-size:13px;font-weight:700;color:${m.overdueCount > 0 ? '#c0392b' : '#b0a696'};">${m.overdueCount}</td>
          <td style="padding:9px 16px;text-align:right;font-size:12px;color:${seen.color};font-weight:500;">${seen.text}</td>
        </tr>`
    }).join('')
    return `
      <div style="margin-bottom:28px;background:#fff;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;">
        <div style="background:#3b2070;padding:10px 16px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:13px;font-weight:700;color:#fff;">Team This Week</span>
          <span style="margin-left:auto;background:rgba(255,255,255,0.22);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;">${teamMembers.length} members</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#faf8f5;border-bottom:1px solid #ede8dc;">
              <th style="padding:7px 16px;text-align:left;font-size:11px;font-weight:600;color:#9e9488;text-transform:uppercase;letter-spacing:0.06em;">Member</th>
              <th style="padding:7px 12px;text-align:center;font-size:11px;font-weight:600;color:#9e9488;text-transform:uppercase;letter-spacing:0.06em;">Open</th>
              <th style="padding:7px 12px;text-align:center;font-size:11px;font-weight:600;color:#9e9488;text-transform:uppercase;letter-spacing:0.06em;">Overdue</th>
              <th style="padding:7px 16px;text-align:right;font-size:11px;font-weight:600;color:#9e9488;text-transform:uppercase;letter-spacing:0.06em;">Last Seen</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  }

  const topTaskRows = topTasks.map((t) => {
    const duePart = t.due_date
      ? ` — due ${t.due_date}${t.department ? ` (${t.department})` : ''}`
      : t.department ? ` (${t.department})` : ''
    return `<li style="margin:0;padding:7px 0;border-bottom:1px solid #f4f0e8;font-size:13px;color:#2d2a22;list-style:none;">
      ${t.title}<span style="color:#9e9488;font-size:12px;">${duePart}</span>
    </li>`
  }).join('')

  const sprintBlock = sprintName != null && sprintPercent != null ? `
    <div style="margin-bottom:20px;background:#fff;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;">
      <div style="background:#5c3db8;padding:10px 16px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:13px;font-weight:700;color:#fff;">Active Sprint</span>
      </div>
      <div style="padding:12px 16px;">
        <p style="margin:0 0 10px;font-size:13px;color:#2d2a22;">
          Your sprint <strong>${sprintName}</strong> is <strong>${sprintPercent}%</strong> complete.
        </p>
        <div style="background:#f4f0e8;border-radius:99px;height:6px;overflow:hidden;">
          <div style="background:#5c3db8;height:100%;width:${sprintPercent}%;border-radius:99px;"></div>
        </div>
      </div>
    </div>` : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0;background:#f9f7f5;">
<div style="max-width:600px;margin:0 auto;background:#fff;">

  <div style="background:#4c2a92;padding:24px;text-align:center;">
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">Nexus</h1>
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.8);">Your week ahead</p>
  </div>

  <div style="padding:28px 28px 0;">
    <p style="margin:0 0 24px;font-size:15px;">Hi <strong>${firstName}</strong>, here's what's on your plate this week in Nexus:</p>

    ${teamSection()}

    <div style="margin-bottom:20px;background:#fff;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #f4f0e8;">
          <td style="padding:12px 16px;font-size:13px;color:#2d2a22;font-weight:600;">Open tasks</td>
          <td style="padding:12px 16px;text-align:right;font-size:18px;font-weight:800;color:#4c2a92;">${openCount}</td>
        </tr>
        <tr style="border-bottom:1px solid #f4f0e8;">
          <td style="padding:12px 16px;font-size:13px;color:#2d2a22;font-weight:600;">Due this week</td>
          <td style="padding:12px 16px;text-align:right;font-size:18px;font-weight:800;color:${dueThisWeekCount > 0 ? '#2a5fa5' : '#b0a696'};">${dueThisWeekCount}</td>
        </tr>
        ${overdueCount > 0 ? `
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#c0392b;font-weight:600;">Overdue</td>
          <td style="padding:12px 16px;text-align:right;font-size:18px;font-weight:800;color:#c0392b;">${overdueCount}</td>
        </tr>` : ''}
      </table>
    </div>

    ${topTasks.length > 0 ? `
    <div style="margin-bottom:20px;background:#fff;border-radius:10px;border:1px solid #e8dedd;overflow:hidden;">
      <div style="background:#2a5fa5;padding:10px 16px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:13px;font-weight:700;color:#fff;">Top Priorities</span>
        <span style="margin-left:auto;background:rgba(255,255,255,0.22);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;">${topTasks.length}</span>
      </div>
      <div style="padding:10px 16px;">
        <ul style="margin:0;padding:0;">${topTaskRows}</ul>
      </div>
    </div>` : ''}

    ${sprintBlock}
  </div>

  <div style="padding:12px 28px 28px;text-align:center;">
    <a href="${frontendUrl}/my-tasks" style="display:inline-block;padding:12px 28px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Open My Tasks</a>
  </div>

  <div style="background:#f9f7f5;border-top:1px solid #e8dedd;padding:16px 28px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9e9488;">
      You're receiving this because you're an active Nexus user.
      &nbsp;·&nbsp;
      <a href="${frontendUrl}/settings" style="color:#4c2a92;text-decoration:none;font-weight:500;">Adjust email preferences</a>
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  if (!(await verifyAccess(req, supabase))) return jsonResponse(401, { error: 'Unauthorized' })

  const body = await req.json().catch(() => ({}))
  const testUserIds: string[] | undefined = Array.isArray(body?.user_ids) && body.user_ids.length
    ? body.user_ids
    : undefined

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'Nexus <noreply@blwcannexus.ca>'
  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? 'https://nexus.lwcanada.org'

  if (!resendApiKey) return jsonResponse(500, { error: 'Missing RESEND_API_KEY' })

  const now = new Date()
  const today = now.toISOString().split('T')[0]
  // "due this week" = due within the next 7 days
  const endOfWeek = new Date(now)
  endOfWeek.setDate(endOfWeek.getDate() + 6)
  const endOfWeekStr = endOfWeek.toISOString().split('T')[0]
  const year = now.getFullYear()

  // ── 1. All active users ──────────────────────────────────────────────────────
  let usersQuery = supabase
    .from('users')
    .select('id, name, email, role, department_id, last_active_at')
    .eq('status', 'active')
    .not('email', 'is', null)
  if (testUserIds) usersQuery = usersQuery.in('id', testUserIds)
  const { data: users, error: usersError } = await usersQuery

  if (usersError) return jsonResponse(500, { error: usersError.message })
  if (!users?.length) return jsonResponse(200, { sent: 0, message: 'No active users' })

  const allUserIds = users.map((u) => u.id)

  // ── 2. Opted-out users ───────────────────────────────────────────────────────
  const { data: optedOut } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .eq('notification_type', 'weekly_digest')
    .eq('email', false)

  const optedOutIds = new Set((optedOut ?? []).map((p: { user_id: string }) => p.user_id))
  const eligible = users.filter((u) => u.email && !optedOutIds.has(u.id))
  if (!eligible.length) return jsonResponse(200, { sent: 0, message: 'All users opted out' })

  // Task queries run over ALL active users so team data covers opted-out members too
  // ── 3. Open tasks — check both task_assignees (multi) and assignee_id (legacy) ─
  const isOpenCategory = (category: string | null) =>
    !['completed', 'cancelled'].includes(category ?? '')

  // 3a. task_assignees table (current multi-assignee pattern)
  const { data: assigneeRows } = await supabase
    .from('task_assignees')
    .select('user_id, task:task_id(id, title, due_date, parent_task_id, status_definition:status_id(category))')
    .in('user_id', allUserIds)

  // 3b. Legacy assignee_id column (personal tasks + older tasks)
  const { data: legacyTasks } = await supabase
    .from('tasks')
    .select('id, title, assignee_id, due_date, status_definition:status_id(category)')
    .in('assignee_id', allUserIds)
    .not('assignee_id', 'is', null)
    .is('parent_task_id', null)

  // Merge both sources into user → taskMap (deduplicated by task ID)
  type TaskEntry = { title: string; due_date: string | null; category: string | null }
  const userTaskMaps: Record<string, Map<string, TaskEntry>> = {}

  for (const row of assigneeRows ?? []) {
    const t = row.task as { id: string; title: string; due_date: string | null; parent_task_id: string | null; status_definition?: { category?: string } | null } | null
    if (!t || !row.user_id || t.parent_task_id) continue
    const map = (userTaskMaps[row.user_id] ??= new Map())
    map.set(t.id, {
      title: t.title,
      due_date: t.due_date ?? null,
      category: (t.status_definition as { category?: string } | null)?.category ?? null,
    })
  }

  for (const t of legacyTasks ?? []) {
    if (!t.assignee_id) continue
    const map = (userTaskMaps[t.assignee_id] ??= new Map())
    if (!map.has(t.id)) {
      map.set(t.id, {
        title: t.title,
        due_date: t.due_date ?? null,
        category: (t.status_definition as { category?: string } | null)?.category ?? null,
      })
    }
  }

  const openByUser: Record<string, { title: string; due_date: string | null; department: string | null }[]> = {}
  for (const [userId, taskMap] of Object.entries(userTaskMaps)) {
    const open = [...taskMap.values()].filter((t) => isOpenCategory(t.category))
    if (open.length) openByUser[userId] = open.map((t) => ({ title: t.title, due_date: t.due_date, department: null }))
  }

  // ── 4. Sprint memberships for eligible users ─────────────────────────────────
  const eligibleIds = eligible.map((u) => u.id)

  const { data: sprintMemberships } = await supabase
    .from('sprint_members')
    .select('user_id, sprint_id')
    .in('user_id', eligibleIds)

  const sprintIdsByUser: Record<string, string[]> = {}
  const allSprintIds: string[] = []
  for (const m of sprintMemberships ?? []) {
    ;(sprintIdsByUser[m.user_id] ??= []).push(m.sprint_id)
    if (!allSprintIds.includes(m.sprint_id)) allSprintIds.push(m.sprint_id)
  }

  // ── 5. Active sprints ────────────────────────────────────────────────────────
  const { data: activeSprints } = allSprintIds.length
    ? await supabase
        .from('sprints')
        .select('id, name, status')
        .in('id', allSprintIds)
        .eq('status', 'active')
    : { data: [] }

  const activeSprintMap: Record<string, string> = {} // sprint_id → name
  for (const s of activeSprints ?? []) activeSprintMap[s.id] = s.name
  const activeSprintIds = Object.keys(activeSprintMap)

  // ── 6. Tasks in active sprints (for % complete) ───────────────────────────────
  const { data: sprintTasksRaw } = activeSprintIds.length
    ? await supabase
        .from('tasks')
        .select('id, sprint_id, status_definition:status_id(category)')
        .in('sprint_id', activeSprintIds)
    : { data: [] }

  // sprint_id → { total, completed }
  const sprintStats: Record<string, { total: number; completed: number }> = {}
  for (const t of sprintTasksRaw ?? []) {
    const s = (sprintStats[t.sprint_id] ??= { total: 0, completed: 0 })
    s.total++
    if ((t.status_definition as { category?: string } | null)?.category === 'completed') s.completed++
  }

  // ── 7. Group all users by department for team-section lookups ────────────────
  const membersByDept: Record<string, typeof users> = {}
  for (const u of users) {
    if (u.department_id) ;(membersByDept[u.department_id] ??= []).push(u)
  }

  // ── 8. Weekly send cap (max 2 emails per person per 7 days) ─────────────────
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const eligibleEmails = eligible.map((u) => u.email).filter(Boolean)
  const { data: recentLogs } = await supabase
    .from('email_delivery_log')
    .select('recipient_email')
    .in('recipient_email', eligibleEmails)
    .eq('status', 'sent')
    .gte('sent_at', sevenDaysAgo)

  const weeklyCount: Record<string, number> = {}
  for (const row of recentLogs ?? []) {
    weeklyCount[row.recipient_email] = (weeklyCount[row.recipient_email] ?? 0) + 1
  }

  // ── 9. Send emails ───────────────────────────────────────────────────────────
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const user of eligible) {
    const cap = user.role === 'dept_lead' ? 1 : 2
    if ((weeklyCount[user.email] ?? 0) >= cap) { skipped++; continue }
    const firstName = (user.name ?? 'Team Member').split(' ')[0]
    const userTasks = openByUser[user.id] ?? []
    const openCount = userTasks.length
    const overdueCount = userTasks.filter((t) => t.due_date && t.due_date < today).length
    const dueThisWeekCount = userTasks.filter(
      (t) => t.due_date && t.due_date >= today && t.due_date <= endOfWeekStr,
    ).length
    const topTasks: TopTask[] = userTasks
      .filter((t) => t.due_date)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      .slice(0, 5)
      .map((t) => ({ title: t.title, due_date: t.due_date, department: t.department }))

    // Sprint info: find one active sprint this user belongs to
    const userActiveSprintId = (sprintIdsByUser[user.id] ?? []).find((id) => id in activeSprintMap)
    const sprintName = userActiveSprintId ? activeSprintMap[userActiveSprintId] : null
    const sprintPercent = userActiveSprintId && sprintStats[userActiveSprintId]
      ? Math.round((sprintStats[userActiveSprintId].completed / sprintStats[userActiveSprintId].total) * 100)
      : null

    // Team section for dept_lead / super_admin
    const isLead = ['dept_lead', 'super_admin'].includes(user.role) && user.department_id
    const teamMembers: TeamMember[] = isLead
      ? (membersByDept[user.department_id] ?? [])
          .filter((m) => m.id !== user.id)
          .map((m) => {
            const mt = openByUser[m.id] ?? []
            return {
              name: m.name ?? 'Team Member',
              openCount: mt.length,
              overdueCount: mt.filter((t) => t.due_date && t.due_date < today).length,
              lastActiveAt: m.last_active_at ?? null,
            }
          })
          .sort((a, b) => b.openCount - a.openCount || a.name.localeCompare(b.name))
      : []

    // Skip if nothing to show: no open tasks and no active sprint and not a lead
    if (openCount === 0 && !sprintName && !teamMembers.length) {
      skipped++
      continue
    }

    const html = buildDigestHtml(
      firstName,
      frontendUrl,
      openCount,
      dueThisWeekCount,
      overdueCount,
      topTasks,
      sprintName,
      sprintPercent,
      year,
      teamMembers,
    )

    const subject = `Your Nexus week ahead — ${openCount} task${openCount !== 1 ? 's' : ''}${dueThisWeekCount > 0 ? `, ${dueThisWeekCount} due` : ''}`

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
      email_type: 'weekly_digest',
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
