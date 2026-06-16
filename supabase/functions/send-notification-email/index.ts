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

  const templates: Record<string, { subject: string; body: string }> = {
    task_assigned: {
      subject: `New task assigned: ${payload.task_title ?? 'Task'}`,
      body: `Hi ${user.name},\n\n${payload.assigner_name ?? 'Someone'} assigned you a task: "${payload.task_title ?? 'a task'}".\n\nOpen BLW Canada OS to view it.\n\nBLW Canada OS`,
    },
    sprint_added: {
      subject: `You've been added to sprint: ${payload.sprint_name ?? 'Sprint'}`,
      body: `Hi ${user.name},\n\n${payload.added_by ?? 'Someone'} added you to the sprint "${payload.sprint_name ?? 'a sprint'}".\n\nOpen BLW Canada OS to view the sprint.\n\nBLW Canada OS`,
    },
    comment_added: {
      subject: `New comment on: ${payload.task_title ?? 'Task'}`,
      body: `Hi ${user.name},\n\n${payload.author_name ?? 'Someone'} commented on "${payload.task_title ?? 'your task'}".\n\nOpen BLW Canada OS to see the comment.\n\nBLW Canada OS`,
    },
    invitation_accepted: {
      subject: `${payload.user_name ?? 'A user'} activated their account`,
      body: `Hi ${user.name},\n\n${payload.user_name ?? 'A user'} accepted their invitation and activated their account.\n\nBLW Canada OS`,
    },
  }

  const message = templates[notificationType]
  if (!message) {
    return jsonResponse(200, { skipped: true, reason: 'no_template' })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('INVITATION_FROM_EMAIL') ?? 'notifications@blwcanada.org'

  if (!resendApiKey) {
    return jsonResponse(500, { error: 'Missing RESEND_API_KEY' })
  }

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `BLW Canada OS <${fromEmail}>`,
      to: [user.email],
      subject: message.subject,
      text: message.body,
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
