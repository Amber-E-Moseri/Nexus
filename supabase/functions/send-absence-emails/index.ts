import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

// Fail closed — without a configured origin we don't know who is allowed to call this function.
const corsHeaders: Record<string, string> = ALLOWED_ORIGIN
  ? {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    }
  : {}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

interface Recipient {
  name: string
  email: string
  subgroup?: string
}

interface RequestBody {
  report_id?: string | null
  meeting_label?: string
  next_date?: string
  recap?: string
  subject?: string
  body_template?: string
  recipients?: Recipient[]
}

function personalize(
  template: string,
  vars: { name: string; meeting_label: string; next_date: string; recap: string },
) {
  return template
    .replace(/\{\{name\}\}/g, vars.name)
    .replace(/\{\{meeting_label\}\}/g, vars.meeting_label)
    .replace(/\{\{next_date\}\}/g, vars.next_date)
    .replace(/\{\{recap\}\}/g, vars.recap)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function bodyToHtml(text: string): string {
  const escaped = escapeHtml(text)
  const paragraphs = `<p>${escaped.split('\n\n').join('</p><p>')}</p>`

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #4C2A92; padding: 20px; border-radius: 8px 8px 0 0; margin-bottom: 24px;">
        <h2 style="color: white; margin: 0; font-size: 18px;">BLW CAN NEXUS</h2>
        <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px;">
          Regional Ministry Operations
        </p>
      </div>
      ${paragraphs}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #EDE8DC; color: #9E9488; font-size: 12px;">
        BLW CAN NEXUS | Sent via BLW CAN NEXUS
      </div>
    </div>
  `
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    if (!ALLOWED_ORIGIN) {
      return new Response('CORS not configured', { status: 500 })
    }
    return new Response('ok', { headers: corsHeaders })
  }

  if (!ALLOWED_ORIGIN) {
    return jsonResponse(500, { error: 'Missing ALLOWED_ORIGIN environment variable' })
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'BLW CAN NEXUS <noreply@blwcannexus.ca>'

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return jsonResponse(500, { error: 'Missing required environment variables' })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonResponse(401, { error: 'Unable to validate caller' })
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null

  if (!body) {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const {
    report_id: reportId = null,
    meeting_label: meetingLabel = '',
    next_date: nextDate = '',
    recap = '',
    subject,
    body_template: bodyTemplate,
    recipients,
  } = body

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return jsonResponse(400, { error: 'recipients must be a non-empty array' })
  }

  if (recipients.some((r) => !r || typeof r.email !== 'string' || r.email.trim() === '')) {
    return jsonResponse(400, { error: 'every recipient must have a non-empty email' })
  }

  if (!subject || typeof subject !== 'string' || subject.trim() === '') {
    return jsonResponse(400, { error: 'subject must be non-empty' })
  }

  if (!bodyTemplate || typeof bodyTemplate !== 'string') {
    return jsonResponse(400, { error: 'body_template is required' })
  }

  let sent = 0
  let failed = 0
  let skipped = 0
  const errors: Array<{ name: string; email: string; error: string }> = []

  // BATCH-LOAD user preferences once (not per-recipient)
  // Step 1: Get user IDs by email
  const recipientEmails = recipients.map(r => r.email.toLowerCase())
  const { data: usersData } = await supabase
    .from('users')
    .select('id, email')
    .in('email', recipientEmails)

  // Create Map: email → user_id for O(1) lookup
  const userIdByEmail = new Map(
    (usersData || []).map(u => [u.email.toLowerCase(), u.id])
  )

  // Step 2: Load all preferences in ONE query
  const userIds = Array.from(userIdByEmail.values())
  const { data: allPrefs } = await supabase
    .from('user_notification_prefs')
    .select('user_id, email')
    .eq('notification_type', 'absent_from_meeting')
    .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']) // Prevent "in ()" error

  // Create Map: user_id → email_enabled for O(1) lookup
  const prefsByUserId = new Map(
    (allPrefs || []).map(p => [p.user_id, p.email])
  )

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]

    // Check if recipient has notification preference enabled for absence emails
    // Look up user_id from email, then check preference in Map (O(1), not DB query)
    const userId = userIdByEmail.get(recipient.email.toLowerCase())
    const emailEnabled = userId ? (prefsByUserId.get(userId) ?? true) : true // Default: enabled if no pref found

    // If preference is explicitly disabled (email: false), skip this recipient
    if (emailEnabled === false) {
      skipped += 1
      const { error: logError } = await supabase.from('absence_email_log').insert({
        report_id: reportId,
        recipient_name: recipient.name ?? '',
        recipient_email: recipient.email,
        subject,
        body: bodyTemplate,
        status: 'skipped',
        error_message: 'User disabled absence email notifications',
        sent_by: user.id ?? null,
      })
      if (logError) {
        console.error('Failed to write absence_email_log row', logError)
      }
      continue
    }

    const personalizedBody = personalize(bodyTemplate, {
      name: recipient.name ?? '',
      meeting_label: meetingLabel,
      next_date: nextDate,
      recap,
    })

    let status: 'sent' | 'failed' = 'sent'
    let errorMessage: string | null = null

    try {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient.email],
          subject,
          html: bodyToHtml(personalizedBody),
          text: personalizedBody,
        }),
      })

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text()
        throw new Error(errorText || `Resend responded with ${resendResponse.status}`)
      }

      sent += 1
    } catch (error) {
      status = 'failed'
      errorMessage = error instanceof Error ? error.message : String(error)
      failed += 1
      errors.push({ name: recipient.name ?? '', email: recipient.email, error: errorMessage })
    }

    const { error: logError } = await supabase.from('absence_email_log').insert({
      report_id: reportId,
      recipient_name: recipient.name ?? '',
      recipient_email: recipient.email,
      subject,
      body: personalizedBody,
      status,
      error_message: errorMessage,
      sent_by: user.id ?? null,
    })

    if (logError) {
      console.error('Failed to write absence_email_log row', logError)
    }

    if (i < recipients.length - 1) {
      await sleep(100)
    }
  }

  return jsonResponse(200, { sent, failed, skipped, errors })
})
