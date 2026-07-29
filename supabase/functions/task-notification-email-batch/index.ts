// Batch email digest for task notifications — runs every 3 hours.
//
// Register cron job in Supabase SQL Editor:
//
//   select cron.schedule(
//     'task-notification-email-batch',
//     '*/15 * * * *',  -- every 15 minutes
//     $$
//     select net.http_post(
//       url     := current_setting('app.supabase_url') || '/functions/v1/task-notification-email-batch',
//       headers := jsonb_build_object(
//                    'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
//                    'Content-Type', 'application/json'
//                  ),
//       body    := '{}'::jsonb
//     );
//     $$
//   );
//
// Or replace current_setting calls with literal values from your project settings.

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

// Notification types that belong in the task digest.
// Meeting/calendar reminders have their own email paths and are excluded here.
const TASK_EMAIL_TYPES = new Set([
  'task_assigned',
  'task_comment',
  'comment_added',
  'mention',
  'task_due_soon',
  'task_completed',
  'subtask_completed',
  'dependency_cleared',
  'sprint_added',
  'sprint_status',
  'sprint_access_requested',
  'sprint_access_approved',
  'sprint_access_rejected',
])

type Notification = {
  id: string
  type: string
  payload: Record<string, unknown>
  created_at: string
}

type UserPref = {
  notification_type: string
  email: boolean
}

// Keep in sync with formatNotificationMessage in src/features/notifications/lib/notifications.js
function formatMessage(n: Notification): string {
  const p = n.payload ?? {}
  const title = (p.task_title as string) ?? (p.sprint_name as string) ?? 'item'
  switch (n.type) {
    case 'task_assigned':
      return `<strong>${p.assigner_name ?? 'Someone'}</strong> assigned you &ldquo;${title}&rdquo;`
    case 'task_comment':
    case 'comment_added':
      return `<strong>${p.author_name ?? 'Someone'}</strong> commented on &ldquo;${title}&rdquo;`
    case 'mention':
      return `<strong>${p.actor_name ?? 'Someone'}</strong> mentioned you in &ldquo;${title}&rdquo;`
    case 'task_due_soon':
      return `&ldquo;${title}&rdquo; is due soon`
    case 'task_completed':
      return `&ldquo;${title}&rdquo; was marked complete`
    case 'subtask_completed':
      return `A subtask on &ldquo;${title}&rdquo; was completed`
    case 'dependency_cleared':
      return `A blocking task for &ldquo;${title}&rdquo; was resolved`
    case 'sprint_added':
      return `You were added to sprint &ldquo;${title}&rdquo;`
    case 'sprint_status':
      return `Sprint &ldquo;${title}&rdquo; status changed`
    case 'sprint_access_requested':
      return `Someone requested access to sprint &ldquo;${title}&rdquo;`
    case 'sprint_access_approved':
      return `Your sprint access request was approved`
    case 'sprint_access_rejected':
      return `Your sprint access request was declined`
    default:
      return n.type
  }
}

function notificationIcon(type: string): string {
  switch (type) {
    case 'task_assigned': return '📋'
    case 'task_comment':
    case 'comment_added': return '💬'
    case 'mention': return '🔔'
    case 'task_due_soon': return '⏰'
    case 'task_completed': return '✅'
    case 'subtask_completed': return '✓'
    case 'dependency_cleared': return '🔓'
    case 'sprint_added':
    case 'sprint_status': return '🏃'
    default: return '•'
  }
}

function buildEmailHtml(params: {
  firstName: string
  notifications: Notification[]
  frontendUrl: string
  currentYear: number
}): string {
  const { firstName, notifications, frontendUrl, currentYear } = params

  const rows = notifications.map((n) => {
    const actionUrl = (n.payload?.action_url as string | undefined) ?? `${frontendUrl}/my-tasks`
    const icon = notificationIcon(n.type)
    const msg = formatMessage(n)
    const time = new Date(n.created_at).toLocaleTimeString('en-CA', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Toronto',
    })
    return `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0ece8; vertical-align: top;">
          <span style="font-size: 16px; margin-right: 10px; line-height: 1.4;">${icon}</span>
        </td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f0ece8; vertical-align: top; width: 100%;">
          <span style="font-size: 14px; color: #2d2a22; line-height: 1.5;">${msg}</span>
          <span style="display: block; font-size: 11px; color: #9e9488; margin-top: 2px;">${time}</span>
        </td>
        <td style="padding: 10px 0 10px 16px; border-bottom: 1px solid #f0ece8; vertical-align: middle; white-space: nowrap;">
          <a href="${actionUrl}" style="font-size: 12px; color: #4c2a92; text-decoration: none; font-weight: 500;">View →</a>
        </td>
      </tr>`
  }).join('')

  const count = notifications.length
  const summary = count === 1 ? '1 update' : `${count} updates`

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2d2a22; margin: 0; padding: 0; background: #f9f7f5;">
    <div style="max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
      <div style="background: #4c2a92; padding: 20px 24px;">
        <h1 style="margin: 0; font-size: 20px; color: #ffffff; font-weight: 600;">BLW CAN NEXUS</h1>
        <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.75);">Task digest — ${summary}</p>
      </div>
      <div style="padding: 24px;">
        <p style="margin: 0 0 20px; font-size: 15px; color: #2d2a22;">Hi ${firstName},</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div style="margin-top: 24px; text-align: center;">
          <a href="${frontendUrl}/notifications" style="display: inline-block; padding: 10px 24px; background: #4c2a92; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
            Open BLW CAN NEXUS
          </a>
        </div>
      </div>
      <div style="background: #f9f7f5; border-top: 1px solid #e8dedd; padding: 16px 24px; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #9e9488;">
          You're receiving this because you have task notifications enabled. &nbsp;·&nbsp;
          <a href="${frontendUrl}/settings/notifications" style="color: #4c2a92; text-decoration: none;">Manage preferences</a>
        </p>
        <p style="margin: 6px 0 0; font-size: 11px; color: #bdb5ae;">© ${currentYear} BLW CAN NEXUS</p>
      </div>
    </div>
  </body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  // Only callable with the service role key (cron or admin).
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (token !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) return jsonResponse(500, { error: 'Missing RESEND_API_KEY' })

  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? 'https://blwcannexus.org'
  const fromEmail = Deno.env.get('NOTIFICATION_FROM_EMAIL') ?? 'notifications@blwcannexus.org'
  const currentYear = new Date().getFullYear()

  // Fetch all pending notifications (email_sent_at IS NULL) for task-related types.
  // No time cap — email_sent_at ensures each row is processed exactly once.
  const { data: pending, error: pendingError } = await supabase
    .from('notifications')
    .select('id, user_id, type, payload, created_at')
    .is('email_sent_at', null)
    .in('type', [...TASK_EMAIL_TYPES])
    .order('user_id')
    .order('created_at', { ascending: true })

  if (pendingError) return jsonResponse(500, { error: pendingError.message })
  if (!pending || pending.length === 0) return jsonResponse(200, { processed: 0, sent: 0 })

  // Group by user_id.
  const byUser = new Map<string, Notification[]>()
  for (const n of pending) {
    const arr = byUser.get(n.user_id) ?? []
    arr.push(n as Notification)
    byUser.set(n.user_id, arr)
  }

  const userIds = [...byUser.keys()]

  // Fetch user profiles.
  const { data: users } = await supabase
    .from('users')
    .select('id, name, email')
    .in('id', userIds)

  const userMap = new Map((users ?? []).map((u: { id: string; name: string; email: string }) => [u.id, u]))

  // Fetch all relevant notification prefs for these users in one query.
  const { data: prefs } = await supabase
    .from('user_notification_prefs')
    .select('user_id, notification_type, email')
    .in('user_id', userIds)
    .in('notification_type', [...TASK_EMAIL_TYPES])

  // Build a fast lookup: userId → { notificationType → emailEnabled }
  const prefMap = new Map<string, Map<string, boolean>>()
  for (const p of (prefs ?? []) as UserPref & { user_id: string }[]) {
    const m = prefMap.get(p.user_id) ?? new Map<string, boolean>()
    m.set(p.notification_type, p.email)
    prefMap.set(p.user_id, m)
  }

  let emailsSent = 0
  const allProcessedIds: string[] = []

  for (const [userId, notifications] of byUser) {
    const user = userMap.get(userId)
    allProcessedIds.push(...notifications.map((n) => n.id))

    if (!user?.email) continue

    const userPrefs = prefMap.get(userId) ?? new Map<string, boolean>()

    // Filter to types where email is not explicitly disabled (default = true).
    const toEmail = notifications.filter((n) => {
      const pref = userPrefs.get(n.type)
      return pref !== false // undefined (no row) → default true
    })

    if (toEmail.length === 0) continue

    const firstName = user.name?.split(' ')[0] ?? 'there'
    const html = buildEmailHtml({ firstName, notifications: toEmail, frontendUrl, currentYear })

    const subject = toEmail.length === 1
      ? formatMessage(toEmail[0]).replace(/<[^>]+>/g, '') // strip HTML tags for subject
      : `You have ${toEmail.length} task updates`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `BLW CAN NEXUS <${fromEmail}>`,
        to: [user.email],
        subject,
        html,
      }),
    })

    if (emailRes.ok) {
      emailsSent++
    } else {
      console.error(`Failed to send to ${user.email}:`, await emailRes.text())
    }
  }

  // Mark all fetched notifications as processed (sent or intentionally skipped).
  // Done in one batch update rather than per-user to minimise round-trips.
  if (allProcessedIds.length > 0) {
    const { error: markError } = await supabase
      .from('notifications')
      .update({ email_sent_at: new Date().toISOString() })
      .in('id', allProcessedIds)

    if (markError) {
      console.error('Failed to mark notifications as sent:', markError.message)
    }
  }

  return jsonResponse(200, {
    processed: pending.length,
    users: byUser.size,
    sent: emailsSent,
  })
})
