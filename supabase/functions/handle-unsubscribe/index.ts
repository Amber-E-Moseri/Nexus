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

async function generateToken(email: string): Promise<string> {
  const key  = Deno.env.get('UNSUBSCRIBE_SECRET') ?? 'default'
  const data = new TextEncoder().encode(email + key)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/[+/=]/g, '')
    .slice(0, 32)
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

  if (!email || !token) {
    return json(400, { error: 'email and token are required' })
  }

  // Verify token
  const expectedToken = await generateToken(email.toLowerCase())
  if (token !== expectedToken) {
    return json(200, { success: false, error: 'invalid_token' })
  }

  if (action === 'resubscribe') {
    const { error } = await supabase
      .from('communication_unsubscribes')
      .delete()
      .eq('email', email.toLowerCase())

    if (error) return json(500, { error: error.message })
    return json(200, { success: true })
  }

  // Default: unsubscribe
  const { error } = await supabase
    .from('communication_unsubscribes')
    .upsert({ email: email.toLowerCase(), unsubscribed_via: 'link' }, { onConflict: 'email' })

  if (error) return json(500, { error: error.message })
  return json(200, { success: true })
})
