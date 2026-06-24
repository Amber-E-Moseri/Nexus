import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

// Public endpoint — no ALLOWED_ORIGIN restriction needed
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Generate a cryptographically random 32-byte token (64-char hex)
async function generateRandomToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Hash a token using SHA-256 (for storage)
async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Legacy: Verify deterministic token (for backwards compatibility during migration)
async function verifyLegacyToken(email: string, token: string): Promise<boolean> {
  const key = Deno.env.get('UNSUBSCRIBE_SECRET') ?? 'default'
  const data = new TextEncoder().encode(email + key)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const expected = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/[+/=]/g, '')
    .slice(0, 32)
  return token === expected
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Missing environment variables' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const body = await request.json().catch(() => null)
  if (!body) return json(400, { error: 'Invalid JSON body' })

  const { email, token, action = 'unsubscribe' } = body as {
    email?: string
    token?: string
    action?: string
  }

  if (!token) {
    return json(400, { error: 'token is required' })
  }

  const normalizedEmail = email?.toLowerCase() ?? ''

  // Verify token: support both new random tokens and legacy deterministic tokens
  let tokenValid = false
  let storedRecord: { email: string; token_expires_at: string | null } | null = null

  // Try new random token system first
  const tokenHash = await hashToken(token)
  const { data: record } = await supabase
    .from('communication_unsubscribes')
    .select('email, token_expires_at')
    .eq('unsubscribe_token', tokenHash)
    .maybeSingle()

  if (record) {
    // Check if token is not expired
    if (record.token_expires_at && new Date(record.token_expires_at) > new Date()) {
      tokenValid = true
      storedRecord = record
    } else if (!record.token_expires_at) {
      // Expired or no expiration set (migrate from old system)
      return json(401, { error: 'Token expired. Request a new unsubscribe link.' })
    }
  }

  // Fallback: verify legacy deterministic token (for backwards compatibility)
  if (!tokenValid && normalizedEmail) {
    tokenValid = await verifyLegacyToken(normalizedEmail, token)
    if (tokenValid && !record) {
      // Old token is valid but no DB record yet; allow the unsubscribe
      storedRecord = { email: normalizedEmail, token_expires_at: null }
    }
  }

  if (!tokenValid) {
    return json(401, { error: 'Invalid or expired token' })
  }

  const finalEmail = storedRecord?.email || normalizedEmail
  if (!finalEmail) {
    return json(400, { error: 'Could not determine email from token' })
  }

  if (action === 'resubscribe') {
    const { error } = await supabase
      .from('communication_unsubscribes')
      .delete()
      .eq('email', finalEmail)

    if (error) return json(500, { error: error.message })
    return json(200, { success: true })
  }

  // Default: unsubscribe
  const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase
    .from('communication_unsubscribes')
    .upsert(
      {
        email: finalEmail,
        unsubscribed_via: 'link',
        unsubscribe_token: tokenHash,
        token_created_at: new Date().toISOString(),
        token_expires_at: tokenExpiresAt,
      },
      { onConflict: 'email' }
    )

  if (error) return json(500, { error: error.message })
  return json(200, { success: true })
})
