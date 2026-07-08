// Register cron job in Supabase SQL Editor with:
// select cron.schedule(
//   'email-digest',
//   '0 12 * * 1',  -- 12:00 UTC every Monday = 8am ET every Monday
//   $$
//   select net.http_post(
//     url := '[SUPABASE_PROJECT_URL]/functions/v1/email-digest',
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
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

async function verifyServiceRole(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return false

  const token = authHeader.replace('Bearer ', '')
  const expectedToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  return token === expectedToken
}

// Keep in sync with formatNotificationMessage in src/features/notifications/lib/notifications.js —
// edge functions run on Deno and can't share a module with the Vite/browser bundle, so this is a
// deliberate duplicate. Payload key names (assigner_name, author_name, actor_name) must match what
// each notification producer actually writes.
function formatNotificationMessage(notification: { type: string; payload?: Record<string, unknown> }): string {
  const { type, payload = {} } = notification
  const title = (payload.task_title as string) ?? (payload.event_title as string) ?? 'item'

  switch (type) {
    case 'task_assigned':
      return `${(payload.assigner_name as string) ?? 'Someone'} assigned you "${title}"`
    case 'task_comment':
    case 'comment_added':
      return `${(payload.author_name as string) ?? 'Someone'} commented on "${title}"`
    case 'meeting_created':
      return `New meeting: "${title}"`
    case 'event_approved':
      return `Your event "${title}" was approved`
    case 'event_rejected':
      return `Your event "${title}" was rejected`
    case 'mention':
      return `${(payload.actor_name as string) ?? 'Someone'} mentioned you`
    case 'task_due_soon':
      return `"${title}" is due tomorrow`
    case 'system':
      return (payload.message as string) ?? 'System notification'
    default:
      return type
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  if (!(await verifyServiceRole(req))) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? 'https://app.blwcannexus.org'

  // Get all users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, name, email')
    .neq('email', null)

  if (usersError) {
    return jsonResponse(500, { error: usersError.message })
  }

  if (!users || users.length === 0) {
    return jsonResponse(200, { notified: 0 })
  }

  let emailsSent = 0

  // Process each user
  for (const user of users) {
    // Check digest preference (opt-out model: default true if no pref)
    const { data: digestPref } = await supabase
      .from('user_notification_prefs')
      .select('in_app')
      .eq('user_id', user.id)
      .eq('notification_type', 'email_digest')
      .maybeSingle()

    // Skip if explicitly disabled
    if (digestPref && !digestPref.in_app) {
      continue
    }

    // Fetch unread notifications from past 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: notifications } = await supabase
      .from('notifications')
      .select('type, payload, created_at')
      .eq('user_id', user.id)
      .eq('read', false)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })

    // Skip if no notifications
    if (!notifications || notifications.length === 0) {
      continue
    }

    // Build email body
    const firstName = user.name?.split(' ')[0] ?? 'User'
    const notificationsList = notifications
      .map((n) => `• ${formatNotificationMessage(n)}`)
      .join('\n')

    const emailBody = `Hi ${firstName},

Here's what happened in BLW CAN NEXUS this week:

${notificationsList}

View all notifications: ${frontendUrl}/notifications

To unsubscribe from weekly digests, update your notification preferences in Settings.`

    // Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('NOTIFICATION_FROM_EMAIL') ?? 'noreply@blwcannexus.org'

    if (!resendApiKey) {
      console.error('Missing RESEND_API_KEY')
      continue
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `BLW CAN NEXUS <${fromEmail}>`,
        to: [user.email],
        subject: 'Your BLW CAN NEXUS weekly digest',
        text: emailBody,
      }),
    })

    if (emailResponse.ok) {
      emailsSent++
    } else {
      console.error(`Failed to send digest to ${user.email}:`, await emailResponse.text())
    }
  }

  return jsonResponse(200, { notified: emailsSent })
})
