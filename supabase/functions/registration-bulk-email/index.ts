// `?target=deno` pins esm.sh's Deno-targeted build. Without it, esm.sh's default build pulls in
// @supabase/realtime-js's `ws` dependency, which reaches for Node-only shims (node:url,
// bufferutil, utf-8-validate) that don't exist in the edge runtime and crash on boot with
// "Cannot destructure property 'URL' of 'p(...)' as it is null." — this function never uses
// realtime, so the deno build (which resolves cleanly) is all it needs.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0?target=deno'
import { corsOptionsResponse, jsonResponse as sharedJsonResponse } from '../_shared/cors.ts'

// Local dev (localhost:5173/5174, the .claude/launch.json fallback ports, etc.) is allowed by
// _shared/cors.ts regardless of ALLOWED_ORIGIN — this function previously rolled its own
// single-origin CORS check, which silently blocked every test send from a local dev server
// because the browser's Origin header never matched the production ALLOWED_ORIGIN value.
function jsonResponse(status: number, body: Record<string, unknown>, req?: Request) {
  return sharedJsonResponse(status, body, undefined, req)
}

interface Recipient {
  name: string
  email: string
  id?: string | null
  subgroup?: string
  fellowship?: string
}

interface RequestBody {
  recipients?: Recipient[]
  templateId?: string
  subject?: string
  body?: string
  format?: 'text' | 'html'
  wrapHeader?: boolean
}

interface PersonalizeVars {
  name: string
  subgroup?: string
  fellowship?: string
  email?: string
}

function personalize(template: string, vars: PersonalizeVars) {
  const firstName = (vars.name ?? '').trim().split(/\s+/)[0] ?? ''
  return template
    .replace(/\{\{name\}\}/g, vars.name ?? '')
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{subgroup\}\}/g, vars.subgroup ?? '')
    .replace(/\{\{fellowship\}\}/g, vars.fellowship ?? '')
    .replace(/\{\{email\}\}/g, vars.email ?? '')
}

function wrapHtml(innerHtml: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2D2A22; line-height: 1.6; font-size: 14px;">
      <div style="padding: 16px; text-align: center; border-bottom: 1px solid #EDE8DC;">
        <img src="https://nexus.lwcanada.org/blw-canada-logo.png" alt="BLW Canada" width="120" height="120" style="display:block;margin:0 auto;" />
      </div>
      <div style="padding: 20px;">
        ${innerHtml}
      </div>
    </div>
  `
}

// A full HTML document (<!DOCTYPE html>, <html>...) must be sent as-is. Wrapping it in the
// logo-header shell below (meant for HTML snippets) nests a second <html>/<head>/<body> inside a
// <div>, which most email clients render broken or blank — this must stay in sync with the
// frontend's isFullHtmlDocument() in RegistrationDataTab.jsx.
function isFullHtmlDocument(html: string): boolean {
  return /<!doctype html/i.test(html) || /<html[\s>]/i.test(html)
}

function bodyToHtml(text: string): string {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  const paragraphs = `<p>${escaped.split('\n\n').join('</p><p>')}</p>`
  return wrapHtml(paragraphs)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return corsOptionsResponse(request)
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, request)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'BLW CAN NEXUS <noreply@blwcannexus.ca>'

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return jsonResponse(500, { error: 'Missing required environment variables' }, request)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header' }, request)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return jsonResponse(401, { error: 'Unable to validate caller' }, request)
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null

  if (!body) {
    return jsonResponse(400, { error: 'Invalid JSON body' }, request)
  }

  const {
    recipients = [],
    subject = '',
    body: bodyTemplate = '',
    format = 'text',
    wrapHeader = true,
  } = body

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return jsonResponse(400, { error: 'recipients must be a non-empty array' }, request)
  }

  if (recipients.some((r) => !r || typeof r.email !== 'string' || r.email.trim() === '')) {
    return jsonResponse(400, { error: 'every recipient must have a non-empty email' }, request)
  }

  if (!subject || typeof subject !== 'string' || subject.trim() === '') {
    return jsonResponse(400, { error: 'subject must be non-empty' }, request)
  }

  if (!bodyTemplate || typeof bodyTemplate !== 'string') {
    return jsonResponse(400, { error: 'body must be non-empty' }, request)
  }

  let sent = 0
  let failed = 0
  const errors: Array<{ name: string; email: string; error: string }> = []
  const sentIds: string[] = []

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]

    const vars: PersonalizeVars = {
      name: recipient.name ?? '',
      subgroup: recipient.subgroup ?? '',
      fellowship: recipient.fellowship ?? '',
      email: recipient.email ?? '',
    }
    const personalizedBody = personalize(bodyTemplate, vars)
    const personalizedSubject = personalize(subject, vars)

    // HTML mode: body is already HTML — wrap it in the logo-header shell, unless it's already a
    // full document (wrapping would nest it inside a <div> and break rendering) or the caller
    // opted out via wrapHeader:false (e.g. a template that already has its own designed header).
    // Text mode: escape and convert to HTML paragraphs.
    const htmlContent = format === 'html'
      ? (isFullHtmlDocument(personalizedBody) || !wrapHeader ? personalizedBody : wrapHtml(personalizedBody))
      : bodyToHtml(personalizedBody)

    // Plain text fallback: strip HTML tags for text-only clients
    const textContent = personalizedBody.replace(/<[^>]*>/g, '')

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
          subject: personalizedSubject,
          html: htmlContent,
          text: textContent,
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

  return jsonResponse(200, { sent, failed, errors }, request)
})
