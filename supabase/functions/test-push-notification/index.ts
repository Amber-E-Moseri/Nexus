import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const body = await req.json().catch(() => null) as { user_id?: string } | null
  const userId = body?.user_id

  if (!userId) {
    return jsonResponse(400, { error: 'user_id is required' })
  }

  // Create a test in-app notification
  const { error: notifError } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'system',
      payload: {
        message: '🎉 Test notification! Browser and email notifications are now enabled.',
      },
    })

  if (notifError) {
    return jsonResponse(500, { error: notifError.message })
  }

  // Send test email notification
  const { data: user } = await supabase
    .from('users')
    .select('email, name')
    .eq('id', userId)
    .single()

  if (user?.email) {
    try {
      const emailResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            notification_type: 'system',
            payload: {
              message: 'Test email notification from BLW CAN NEXUS',
            },
          }),
        }
      )

      const emailResult = await emailResponse.json()
      return jsonResponse(200, {
        success: true,
        in_app: true,
        email: emailResult.sent ?? false,
      })
    } catch (err) {
      return jsonResponse(200, {
        success: true,
        in_app: true,
        email: false,
        email_error: err.message,
      })
    }
  }

  return jsonResponse(200, {
    success: true,
    in_app: true,
  })
})
