function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'text/plain' } })
  }

  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json(req, 500, { error: 'Missing env vars' })

  // Verify caller is admin by decoding JWT claims directly
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json(req, 401, { error: 'Missing authorization header' })
  const token = authHeader.slice(7)

  let claims: Record<string, unknown> | null = null
  try {
    claims = JSON.parse(atob(token.split('.')[1]))
  } catch {
    return json(req, 401, { error: 'Invalid token' })
  }

  const callerRole = (claims?.user_role ?? claims?.app_metadata?.['user_role']) as string | undefined
  if (callerRole !== 'super_admin' && callerRole !== 'regional_secretary') {
    console.error('Role check failed, claims:', JSON.stringify(claims))
    return json(req, 403, { error: `Only admins can reset passwords (role: ${callerRole})` })
  }

  const body = await req.json().catch(() => null) as { email?: string } | null
  if (!body?.email) return json(req, 400, { error: 'Email required' })

  const origin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://nexus.lwcanada.org'
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'recovery',
      email: body.email,
      options: { redirectTo: `${origin}/reset-password` },
    }),
  })

  const linkData = await linkRes.json()
  if (!linkRes.ok) {
    console.error('generate_link failed:', linkData)
    return json(req, 500, { error: linkData?.message ?? 'Failed to generate recovery link' })
  }

  return json(req, 200, {
    success: true,
    email: body.email,
    recovery_link: linkData?.action_link,
  })
})
