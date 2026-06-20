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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const body = await req.json().catch(() => null) as
    | { user_id?: string; notification_type?: string; payload?: Record<string, unknown> }
    | null

  const userId = body?.user_id
  const notificationType = body?.notification_type
  const payload = body?.payload ?? {}

  if (!userId || !notificationType) {
    return jsonResponse(400, { error: 'user_id and notification_type are required' })
  }

  const { data: pref, error: prefError } = await supabase
    .from('user_notification_prefs')
    .select('email')
    .eq('user_id', userId)
    .eq('notification_type', notificationType)
    .maybeSingle()

  if (prefError) {
    return jsonResponse(500, { error: prefError.message })
  }

  if (pref && !pref.email) {
    return jsonResponse(200, { skipped: true, reason: 'email_disabled' })
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', userId)
    .single()

  if (userError) {
    return jsonResponse(500, { error: userError.message })
  }

  if (!user?.email) {
    return jsonResponse(200, { skipped: true, reason: 'no_email' })
  }

  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? 'https://blwcannexus.org'
  const currentYear = new Date().getFullYear()

  function htmlTemplate(userName: string, body: string, actionUrl?: string, actionLabel?: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #2d2a22; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
            .header { background: #4c2a92; color: #ffffff; padding: 20px; text-align: center; }
            .content { padding: 24px; }
            .footer { background: #f9f7f5; border-top: 1px solid #e8dedd; padding: 16px; text-align: center; font-size: 12px; color: #9e9488; }
            .button { display: inline-block; padding: 10px 20px; background: #4c2a92; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; }
            .section { margin-bottom: 16px; }
            h2 { margin-top: 0; color: #4c2a92; }
            p { margin: 0 0 12px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 24px;">BLW CAN NEXUS</h1>
            </div>
            <div class="content">
              <div class="section">
                <p>Hi ${userName},</p>
              </div>
              <div class="section">
                <p>${body}</p>
              </div>
              ${actionUrl ? `<div class="section" style="margin-top: 24px;">
                <a href="${actionUrl}" class="button">${actionLabel || 'View in BLW CAN NEXUS'}</a>
              </div>` : ''}
              <div class="section" style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e8dedd;">
                <p style="font-size: 12px; color: #9e9488; margin: 0;">
                  <a href="${frontendUrl}/settings/notifications" style="color: #4c2a92; text-decoration: none; font-weight: 500;">Manage notification preferences</a>
                </p>
              </div>
            </div>
            <div class="footer">
              <p>© ${currentYear} BLW CAN NEXUS. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
  }

  const templates: Record<string, { subject: string; body: string; actionUrl?: string; actionLabel?: string }> = {
    task_assigned: {
      subject: `"${payload.task_title ?? 'Task'}" assigned to you`,
      body: `${payload.assigner_name ?? 'Someone'} assigned you a task: <strong>"${payload.task_title ?? 'a task'}"</strong>${payload.task_description ? ` – ${payload.task_description}` : ''}.`,
      actionUrl: actionUrl || `${frontendUrl}/my-tasks`,
      actionLabel: 'View Task'
    },
    sprint_added: {
      subject: `Added to sprint: ${payload.sprint_name ?? 'Sprint'}`,
      body: `${payload.added_by ?? 'Someone'} added you to the sprint <strong>"${payload.sprint_name ?? 'a sprint'}"</strong>.`,
      actionUrl: actionUrl || `${frontendUrl}/sprints`,
      actionLabel: 'View Sprint'
    },
    comment_added: {
      subject: `New comment on "${payload.task_title ?? 'Task'}"`,
      body: `${payload.author_name ?? 'Someone'} commented on <strong>"${payload.task_title ?? 'your task'}"</strong>: <em>"${payload.comment_excerpt ?? 'Comment'}"</em>`,
      actionUrl: actionUrl || `${frontendUrl}/my-tasks`,
      actionLabel: 'View Comment'
    },
    task_comment: {
      subject: `New comment on "${payload.task_title ?? 'Task'}"`,
      body: `${payload.author_name ?? 'Someone'} commented on <strong>"${payload.task_title ?? 'your task'}"</strong>.`,
      actionUrl: actionUrl || `${frontendUrl}/my-tasks`,
      actionLabel: 'View Comment'
    },
    mention: {
      subject: `You were mentioned by ${payload.actor_name ?? 'Someone'}`,
      body: `${payload.actor_name ?? 'Someone'} mentioned you in a comment on <strong>"${payload.task_title ?? 'a task'}"</strong>.`,
      actionUrl: actionUrl || `${frontendUrl}/my-tasks`,
      actionLabel: 'View Mention'
    },
    invitation_accepted: {
      subject: `${payload.user_name ?? 'A user'} activated their account`,
      body: `Good news! ${payload.user_name ?? 'A user'} accepted their invitation and activated their account on BLW CAN NEXUS.`,
    },
    event_approval_pending: {
      subject: `Calendar event needs your approval: ${payload.event_title ?? 'Event'}`,
      body: `${payload.submitter_name ?? 'Someone'} submitted a calendar event <strong>"${payload.event_title ?? 'an event'}"</strong> for your approval.`,
      actionUrl: actionUrl || `${frontendUrl}/calendar`,
      actionLabel: 'Review Event'
    },
    event_approved: {
      subject: `Your event was approved: ${payload.event_title ?? 'Event'}`,
      body: `Your calendar event <strong>"${payload.event_title ?? 'an event'}"</strong> has been approved by ${payload.approver_name ?? 'someone'}.`,
      actionUrl: actionUrl || `${frontendUrl}/calendar`,
      actionLabel: 'View Event'
    },
    meeting_reminder: {
      subject: `Reminder: ${payload.meeting_title ?? 'Meeting'} in 1 hour`,
      body: `This is a friendly reminder that <strong>"${payload.meeting_title ?? 'a meeting'}"</strong> is starting in 1 hour at ${payload.meeting_time ?? '(time TBD)'}.`,
      actionUrl: actionUrl || `${frontendUrl}/meetings`,
      actionLabel: 'View Meeting'
    },
  }

  const message = templates[notificationType]
  if (!message) {
    return jsonResponse(200, { skipped: true, reason: 'no_template' })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('INVITATION_FROM_EMAIL') ?? 'notifications@blwcannexus.org'

  if (!resendApiKey) {
    return jsonResponse(500, { error: 'Missing RESEND_API_KEY' })
  }

  const payloadActionUrl = payload.action_url as string | undefined
  const htmlContent = htmlTemplate(user.name, message.body, payloadActionUrl || message.actionUrl, message.actionLabel)

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `BLW CAN NEXUS <${fromEmail}>`,
      to: [user.email],
      subject: message.subject,
      html: htmlContent,
    }),
  })

  const emailResult = await emailResponse.json().catch(() => ({}))

  if (!emailResponse.ok) {
    return jsonResponse(502, {
      sent: false,
      error: 'Failed to send email',
      details: emailResult,
    })
  }

  return jsonResponse(200, { sent: true, email_id: emailResult.id })
})
