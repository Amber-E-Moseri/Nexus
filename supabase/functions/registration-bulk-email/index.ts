import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

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
  id?: string | null
}

interface RequestBody {
  recipients?: Recipient[]
  templateId?: string
  subject?: string
  body?: string
}

function personalize(template: string, vars: { name: string }) {
  return template.replace(/\{\{name\}\}/g, vars.name)
}

function bodyToHtml(text: string): string {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  const paragraphs = `<p>${escaped.split('\n\n').join('</p><p>')}</p>`

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2D2A22; line-height: 1.6; font-size: 14px;">
      <div style="padding: 16px; text-align: center; border-bottom: 1px solid #EDE8DC;">
        <img src="https://nexus.lwcanada.org/blw-canada-logo.png" alt="BLW Canada" width="120" height="120" style="display:block;margin:0 auto;" />
      </div>
      <div style="padding: 20px;">
        ${paragraphs}
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
    recipients = [],
    subject = '',
    body: bodyTemplate = '',
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
    return jsonResponse(400, { error: 'body must be non-empty' })
  }

  let sent = 0
  let failed = 0
  const errors: Array<{ name: string; email: string; error: string }> = []
  const sentIds: string[] = []

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]

    const personalizedBody = personalize(bodyTemplate, {
      name: recipient.name ?? '',
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
      if (recipient.id) {
        sentIds.push(recipient.id)
      }
    } catch (error) {
      status = 'failed'
      errorMessage = error instanceof Error ? error.message : String(error)
      failed += 1
      errors.push({ name: recipient.name ?? '', email: recipient.email, error: errorMessage })
    }

    if (i < recipients.length - 1) {
      await sleep(100)
    }
  }

  // Update email_status for successfully sent recipients
  if (sentIds.length > 0) {
    const { error: updateError } = await supabase
      .from('registrations')
      .update({ email_status: 'confirming' })
      .in('id', sentIds)

    if (updateError) {
      console.error('Failed to update registration email_status', updateError)
    }
  }

  return jsonResponse(200, { sent, failed, errors })
})
