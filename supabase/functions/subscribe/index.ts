import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'
import { checkRateLimit, extractClientIp, type RateLimitConfig } from '../_shared/rateLimit.ts'

// Public mailing-list signup endpoint. Called by the /subscribe page with no
// auth. Uses the service role to insert into communication_contacts, but is
// rate-limited and refuses anyone who previously unsubscribed.

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  ...(ALLOWED_ORIGIN ? { Vary: 'Origin' } : {}),
}

function jsonResponse(status: number, body: Record<string, unknown>, customHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...customHeaders },
  })
}

// Deliberately loose but good enough to reject obvious junk; the real gate is
// the unique lower(email) index + rate limiting.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function generateConfirmToken(): string {
  // Random 32-char alphanumeric token for confirmation links.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const buf = new Uint8Array(24)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => chars[b % chars.length]).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )

  try {
    const ipAddress = extractClientIp(req)
    const payload = await req.json().catch(() => null)
    if (!payload) {
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    const email = normalizeEmail(payload.email)
    const fullName = typeof payload.full_name === 'string' ? payload.full_name.trim() : ''

    if (!EMAIL_RE.test(email)) {
      return jsonResponse(400, { error: 'A valid email is required.' })
    }

    // Rate limit before any DB work: 5/min per IP, 10/hour per email.
    const rateLimitConfig: RateLimitConfig = { ipPerMinute: 5, emailPerHour: 10, endpoint: 'subscribe' }
    const limitResult = await checkRateLimit(supabase, ipAddress, email, rateLimitConfig)
    if (!limitResult.allowed) {
      return jsonResponse(429, { error: 'Too many requests. Please try again later.' },
        { 'Retry-After': String(limitResult.retryAfterSeconds || 60) })
    }

    // Respect prior opt-outs — never silently re-add an unsubscribed address.
    const { data: unsub } = await supabase
      .from('communication_unsubscribes')
      .select('email')
      .eq('email', email)
      .maybeSingle()

    if (unsub) {
      // Don't reveal list membership; report a benign "needs manual re-opt-in".
      return jsonResponse(409, {
        error: 'This address previously unsubscribed. Please contact us to rejoin.',
        code: 'unsubscribed',
      })
    }

    // Already on the list? Treat as success (idempotent) without duplicating.
    const { data: existing } = await supabase
      .from('communication_contacts')
      .select('id, status')
      .ilike('email', email)
      .maybeSingle()

    if (existing) {
      return jsonResponse(200, { success: true, status: 'already_subscribed' })
    }

    // Fetch double_opt_in_enabled setting (singleton row).
    const { data: settings } = await supabase
      .from('communication_settings')
      .select('double_opt_in_enabled')
      .maybeSingle()

    const doubleOptInEnabled = settings?.double_opt_in_enabled ?? false

    if (doubleOptInEnabled) {
      // Create contact as pending; send confirmation email.
      const confirmToken = generateConfirmToken()
      const { error: insertError } = await supabase
        .from('communication_contacts')
        .insert({
          full_name: fullName || email,
          email,
          source: 'public_signup',
          status: 'pending',
          confirm_token: confirmToken,
          notes: 'Self-service signup (pending confirmation)',
        })

      if (insertError) {
        if (insertError.code === '23505') {
          return jsonResponse(200, { success: true, status: 'already_subscribed' })
        }
        return jsonResponse(500, { error: insertError.message })
      }

      // Send confirmation email (non-blocking; don't fail if email send fails).
      const frontendUrl = ALLOWED_ORIGIN || 'https://app.blwcannexus.ca'
      const confirmUrl = `${frontendUrl}/confirm-subscription/${confirmToken}`
      fetch(new URL('./send-confirm-email', `${Deno.env.get('SUPABASE_URL') || ''}/functions/v1/`).toString(), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY') || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name: fullName, confirm_url: confirmUrl }),
      }).catch((err) => console.error('Failed to send confirm email:', err))

      return jsonResponse(200, { success: true, status: 'pending_confirmation' })
    }

    // Immediate subscribe (double opt-in disabled).
    const { error: insertError } = await supabase
      .from('communication_contacts')
      .insert({
        full_name: fullName || email,
        email,
        source: 'public_signup',
        status: 'active',
        subscribed_at: new Date().toISOString(),
        notes: 'Self-service signup',
      })

    if (insertError) {
      if (insertError.code === '23505') {
        return jsonResponse(200, { success: true, status: 'already_subscribed' })
      }
      return jsonResponse(500, { error: insertError.message })
    }

    return jsonResponse(200, { success: true, status: 'subscribed' })
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Internal server error' })
  }
})
