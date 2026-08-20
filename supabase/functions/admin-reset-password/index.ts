import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing env vars' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Verify caller is admin by checking JWT
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Missing authorization header' })
  }

  const token = authHeader.slice(7)
  const { data: { user }, error: userError } = await adminClient.auth.getUser(token)

  if (userError || !user) {
    return jsonResponse(401, { error: 'Invalid token' })
  }

  // Check if user is super_admin or regional_secretary
  const userRole = user.app_metadata?.user_role ?? user.user_metadata?.user_role
  if (userRole !== 'super_admin' && userRole !== 'regional_secretary') {
    return jsonResponse(403, { error: 'Only admins can reset passwords' })
  }

  // Parse request body
  const body = await req.json().catch(() => null) as { email?: string } | null

  if (!body?.email) {
    return jsonResponse(400, { error: 'Email required' })
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
    return jsonResponse(500, { error: `Failed to generate recovery link: ${error.message}` })
  }

  return jsonResponse(200, {
    success: true,
    email: body.email,
    recovery_link: data?.properties?.action_link,
  })
})
