import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: { ...corsHeaders(req), 'Content-Type': 'text/plain' },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Verify caller is admin by checking JWT
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const token = authHeader.slice(7)
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token)

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  // Check if user is super_admin or regional_secretary
  const userRole = user.app_metadata?.user_role ?? user.user_metadata?.user_role
  if (userRole !== 'super_admin' && userRole !== 'regional_secretary') {
    return new Response(JSON.stringify({ error: 'Only admins can reset passwords' }), {
      status: 403,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  // Parse request body
  const body = await req.json().catch(() => null) as { email?: string } | null

  if (!body?.email) {
    return new Response(JSON.stringify({ error: 'Email required' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  // Generate recovery link
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: body.email,
    options: {
      redirectTo: `${Deno.env.get('ALLOWED_ORIGIN') ?? 'https://nexus.lwcanada.org'}/reset-password`,
    },
  })

  if (error) {
    console.error('Failed to generate recovery link:', error)
    return new Response(JSON.stringify({ error: `Failed to generate recovery link: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    success: true,
    email: body.email,
    recovery_link: data?.properties?.action_link,
  }), {
    status: 200,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
})
