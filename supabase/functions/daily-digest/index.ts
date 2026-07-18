// Register cron job in Supabase SQL Editor with:
// select cron.schedule(
//   'daily-digest',
//   '0 11 * * *',  -- 11:00 UTC = 7:00 AM ET daily
//   $$
//   select net.http_post(
//     url := '[SUPABASE_PROJECT_URL]/functions/v1/daily-digest',
//     headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
//   );
//   $$
// );

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
  return token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })
  if (!(await verifyServiceRole(req))) return jsonResponse(401, { error: 'Unauthorized' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? 'https://app.blwcannexus.org'
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('NOTIFICATION_FROM_EMAIL') ?? 'noreply@blwcannexus.org'

  if (!resendApiKey) return jsonResponse(500, { error: 'Missing RESEND_API_KEY' })

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, name, email')
    .not('email', 'is', null)

  if (usersError) return jsonResponse(500, { error: usersError.message })
  if (!users || users.length === 0) return jsonResponse(200, { notified: 0 })

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)          // YYYY-MM-DD
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  let emailsSent = 0

  for (const user of users) {
    // Respect email_digest opt-out (same pref as weekly digest)
    const { data: digestPref } = await supabase
      .from('user_notification_prefs')
      .select('in_app')
      .eq('user_id', user.id)
      .eq('notification_type', 'email_digest')
      .maybeSingle()

    if (digestPref && !digestPref.in_app) continue

    // ── Section 1: Newly assigned (last 24h, no read filter — digest is separate channel) ──
    const { data: assignedNotifs } = await supabase
      .from('notifications')
      .select('payload, created_at')
      .eq('user_id', user.id)
      .eq('type', 'task_assigned')
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    // ── Section 2: Due today ──
    const { data: dueTasks } = await supabase
      .from('tasks')
      .select('id, title, due_date')
      .eq('assignee_id', user.id)
      .eq('due_date', todayStr)
      .not('status_category', 'in', '("completed","cancelled")')
      .order('title')

    // ── Section 3: Progress updates — status changes (Completed/Blocked) from last 24h ──
    const { data: statusNotifs } = await supabase
      .from('notifications')
      .select('payload, created_at')
      .eq('user_id', user.id)
      .eq('type', 'task_status_changed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    // ── Dedupe by task_id: newly assigned > due today > progress updates ──
    const seenTaskIds = new Set<string>()

    const assignedItems = (assignedNotifs ?? []).filter((n) => {
      const id = n.payload?.task_id as string | undefined
      if (!id || seenTaskIds.has(id)) return false
      seenTaskIds.add(id)
      return true
    })

    const dueItems = (dueTasks ?? []).filter((t) => {
      if (seenTaskIds.has(t.id)) return false
      seenTaskIds.add(t.id)
      return true
    })

    const progressItems = (statusNotifs ?? []).filter((n) => {
      const id = n.payload?.task_id as string | undefined
      if (!id || seenTaskIds.has(id)) return false
      seenTaskIds.add(id)
      return true
    })

    // Skip if nothing to report
    if (assignedItems.length === 0 && dueItems.length === 0 && progressItems.length === 0) continue

    const firstName = user.name?.split(' ')[0] ?? 'Team'

    const lines: string[] = [`Hi ${firstName},`, '', `Here's your BLW CAN NEXUS summary for ${formatDate(now)}:`, '']

    if (assignedItems.length > 0) {
      lines.push('📋 Newly assigned to you:')
      for (const n of assignedItems) {
        const actor = (n.payload?.actor_name as string) ?? 'Someone'
        const title = (n.payload?.task_title as string) ?? 'a task'
        lines.push(`  • ${actor} assigned you "${title}"`)
      }
      lines.push('')
    }

    if (dueItems.length > 0) {
      lines.push('📅 Due today:')
      for (const t of dueItems) {
        lines.push(`  • ${t.title}`)
      }
      lines.push('')
    }

    if (progressItems.length > 0) {
      lines.push('✅ Progress updates:')
      for (const n of progressItems) {
        const actor = (n.payload?.actor_name as string) ?? 'Someone'
        const title = (n.payload?.task_title as string) ?? 'a task'
        const status = (n.payload?.new_status_name as string) ?? 'updated'
        lines.push(`  • ${actor} marked "${title}" as ${status}`)
      }
      lines.push('')
    }

    lines.push(`View tasks: ${frontendUrl}/my-tasks`)
    lines.push('')
    lines.push('To unsubscribe from daily summaries, update your notification preferences in Settings.')

    const emailBody = lines.join('\n')

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `BLW CAN NEXUS <${fromEmail}>`,
        to: [user.email],
        subject: `BLW CAN NEXUS — Daily Summary for ${formatDate(now)}`,
        text: emailBody,
      }),
    })

    if (emailResponse.ok) {
      emailsSent++
    } else {
      console.error(`Failed to send daily digest to ${user.email}:`, await emailResponse.text())
    }
  }

  return jsonResponse(200, { notified: emailsSent })
})
