import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

import { corsOptionsResponse, jsonResponse } from '../_shared/cors.ts'

// Mass email to ICPLC participants.
//
// Callers send participant IDs, never raw addresses: the server loads name, subgroup and email from
// icplc_participants itself, so this cannot be used to mail arbitrary people.
//
// Allowed senders: super_admin, regional_secretary, Programs department members
// (icplc_is_programs_member()) and the named editor below (Pastor Chi Nwokem, cedochie@gmail.com).

const NAMED_EDITOR_USER_IDS = ['4c70ca61-443b-4a64-87aa-3453c9dd5c65']
const MAX_RECIPIENTS = 500
const MAX_SUBJECT = 200
const MAX_BODY = 50_000

interface SendBody {
  event_id?: string
  participant_ids?: string[]
  subject?: string
  body?: string
  test?: boolean
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function personalize(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(name|first_name|subgroup|email)\s*\}\}/gi, (_m, key: string) => vars[key.toLowerCase()] ?? '')
}

function inline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g, '<a href="$1" style="color:#4C2A92;font-weight:600;text-decoration:underline">$1</a>')
}

function renderHtml(bodyText: string): string {
  const paragraphs = escapeHtml(bodyText)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${inline(p).replaceAll('\n', '<br>')}</p>`)
    .join('')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#2D2A22">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #EDE8DC">
      <div style="background:#4C2A92;padding:22px 32px">
        <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.01em">ICPLC 2026</div>
        <div style="color:#D9CCF2;font-size:12px;margin-top:2px;letter-spacing:0.04em;text-transform:uppercase">BLW Canada Sub-Region</div>
      </div>
      <div style="padding:32px;line-height:1.65;font-size:15px">${paragraphs}</div>
    </div>
    <div style="padding:18px 8px 0;font-size:12px;color:#9E9488;text-align:center">BLW Canada Sub-Region · ICPLC 2026</div>
  </div>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req)
  const respond = (status: number, body: Record<string, unknown>) => jsonResponse(status, body, undefined, req)
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL')
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    return respond(500, { error: 'Missing required environment variables' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return respond(401, { error: 'Missing authorization header' })

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const authClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: authData, error: authError } = await authClient.auth.getUser()
  if (authError || !authData.user) return respond(401, { error: 'Unable to validate caller' })
  const callerId = authData.user.id

  const { data: profile } = await admin.from('users').select('id, role, email, name').eq('id', callerId).maybeSingle()
  let allowed = ['super_admin', 'regional_secretary'].includes(profile?.role ?? '') || NAMED_EDITOR_USER_IDS.includes(callerId)
  if (!allowed) {
    // Uses the caller's JWT so auth.uid() resolves inside the SECURITY DEFINER helper.
    const { data: isPrograms } = await authClient.rpc('icplc_is_programs_member')
    allowed = isPrograms === true
  }
  if (!allowed) return respond(403, { error: 'You do not have permission to email ICPLC participants.' })

  const payload = (await req.json().catch(() => null)) as SendBody | null
  if (!payload) return respond(400, { error: 'Invalid JSON body' })

  const subject = (payload.subject ?? '').trim()
  const body = (payload.body ?? '').trim()
  const eventId = payload.event_id
  const ids = Array.isArray(payload.participant_ids) ? [...new Set(payload.participant_ids)] : []
  if (!eventId || !subject || !body) return respond(400, { error: 'event_id, subject and body are required' })
  if (subject.length > MAX_SUBJECT || body.length > MAX_BODY) return respond(400, { error: 'Subject or body is too long' })

  let recipients: Array<{ id: string | null; name: string; email: string; subgroup: string }>

  if (payload.test) {
    // Test sends go only to the caller, with placeholder values so merge tags are obvious.
    const to = profile?.email ?? authData.user.email
    if (!to) return respond(400, { error: 'No email address on your account for a test send.' })
    recipients = [{ id: null, name: '[Name]', email: to, subgroup: '[Subgroup]' }]
  } else {
    if (ids.length === 0) return respond(400, { error: 'Select at least one recipient.' })
    if (ids.length > MAX_RECIPIENTS) return respond(400, { error: `Too many recipients (max ${MAX_RECIPIENTS} per send).` })

    const { data: rows, error } = await admin
      .from('icplc_participants')
      .select('id, full_name, email, subgroup')
      .eq('event_id', eventId)
      .in('id', ids)
    if (error) return respond(500, { error: error.message })

    recipients = (rows ?? [])
      .filter((r) => r.email && r.email.includes('@'))
      .map((r) => ({ id: r.id, name: r.full_name ?? '', email: r.email, subgroup: r.subgroup ?? '' }))
    if (recipients.length === 0) return respond(400, { error: 'None of the selected participants have an email address.' })
  }

  const results: Array<{ email: string; ok: boolean; error?: string }> = []
  for (const r of recipients) {
    const vars = { name: r.name, first_name: r.name.split(/\s+/)[0] ?? '', subgroup: r.subgroup, email: r.email }
    const finalSubject = (payload.test ? '[TEST] ' : '') + personalize(subject, vars)
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, to: r.email, subject: finalSubject, html: renderHtml(personalize(body, vars)) }),
      })
      if (res.ok) results.push({ email: r.email, ok: true })
      else results.push({ email: r.email, ok: false, error: `Resend ${res.status}: ${await res.text()}` })
    } catch (err) {
      results.push({ email: r.email, ok: false, error: err instanceof Error ? err.message : 'Send failed' })
    }
  }

  const failed = results.filter((r) => !r.ok)
  return respond(200, {
    sent: results.length - failed.length,
    failed: failed.length,
    skipped: payload.test ? 0 : ids.length - recipients.length,
    errors: failed.length ? failed : undefined,
  })
})
