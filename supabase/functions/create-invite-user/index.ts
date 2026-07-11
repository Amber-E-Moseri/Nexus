import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const configuredOrigin = Deno.env.get('ALLOWED_ORIGIN')?.trim()
const allowedOrigins = new Set(
  [
    configuredOrigin,
    'http://localhost:5173',
    'http://localhost:5174',
    'https://blwcannexus.vercel.app',
    'https://app.blwcannexus.ca',
  ].filter(Boolean),
)

function getCorsHeaders(origin: string | null) {
  const allowOrigin = origin && allowedOrigins.has(origin)
    ? origin
    : configuredOrigin || 'https://blwcannexus.vercel.app'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

const defaultCorsHeaders = {
  ...getCorsHeaders(null),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'text/plain' },
    })
  }
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing env vars' }, origin)
  }

  const body = await req.json().catch(() => null) as {
    email: string
    password: string
    name: string
  } | null

  if (!body?.email || !body?.password) {
    return jsonResponse(400, { error: 'email and password required' }, origin)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Create user via admin API without triggering any emails
  const { data: { user }, error: createError } = await adminClient.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { name: body.name },
  }, {
    skipConfirmationEmail: true,
  })

  if (createError || !user?.id) {
    console.error('Failed to create user:', createError)
    return jsonResponse(502, { error: `Failed to create user: ${createError?.message || 'Unknown error'}` }, origin)
  }

  return jsonResponse(200, { user_id: user.id }, origin)
})
