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
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing env vars' })
  }

  const body = await req.json().catch(() => null) as {
    user_id: string
  } | null

  if (!body?.user_id) {
    return jsonResponse(400, { error: 'user_id required' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Generate a temporary password for the user
  const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12)

  // Update user password via admin API
  const { data: { user }, error: updateError } = await adminClient.auth.admin.updateUserById(
    body.user_id,
    { password: tempPassword }
  )

  if (updateError || !user?.id) {
    console.error('Failed to reset password:', updateError)
    return jsonResponse(502, { error: `Failed to reset password: ${updateError?.message || 'Unknown error'}` })
  }

  // Send password reset email to trigger Supabase's password recovery flow
  const { error: resetError } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email: user.email!,
    options: {
      redirectTo: `${Deno.env.get('ALLOWED_ORIGIN')}/reset-password`,
    },
  })

  if (resetError) {
    console.error('Failed to send recovery email:', resetError)
    return jsonResponse(502, { error: `Failed to send recovery email: ${resetError?.message || 'Unknown error'}` })
  }

  return jsonResponse(200, { success: true, message: 'Password reset email sent to user' })
})
