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

  const body = await req.json().catch(() => null) as {
    userId?: string
    taskId?: string
    title?: string
    message?: string
    url?: string
    type?: string
  } | null

  const { userId, taskId, title, message, url = '/', type = 'task' } = body || {}

  if (!userId || !title || !message) {
    return jsonResponse(400, {
      error: 'Missing required fields: userId, title, message'
    })
  }

  try {
    // 1. Get user's push subscription
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('push_subscription, push_enabled, email')
      .eq('id', userId)
      .single()

    if (userError) {
      console.error('User not found:', userError)
      return jsonResponse(200, {
        sent: 0,
        reason: 'User not found',
      })
    }

    if (!user?.push_enabled || !user?.push_subscription) {
      console.log(`User ${userId} has push disabled or no subscription`)
      return jsonResponse(200, {
        sent: 0,
        reason: 'Push not enabled or no subscription',
      })
    }

    // 2. Prepare push payload
    const pushPayload = {
      title,
      body: message,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: type,
      requireInteraction: false,
      data: {
        url,
        taskId,
        timestamp: Date.now(),
      },
    }

    const payloadJson = JSON.stringify(pushPayload)

    // 3. Send Web Push to subscription endpoint
    const subscription = user.push_subscription as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    console.log(`Sending push to user ${userId}`)

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'TTL': '86400', // 24 hours
      },
      body: payloadJson,
    })

    console.log(`Push API response: ${response.status}`)

    if (response.ok) {
      console.log(`Push sent successfully to user ${userId}`)
      return jsonResponse(200, {
        sent: 1,
        userId,
        message: 'Push notification sent',
      })
    } else if (response.status === 410) {
      // Subscription expired, clean up
      console.log(`Subscription expired for user ${userId}, cleaning up`)
      await supabase
        .from('users')
        .update({
          push_subscription: null,
          push_enabled: false,
        })
        .eq('id', userId)

      return jsonResponse(200, {
        sent: 0,
        reason: 'Subscription expired and cleaned up',
      })
    } else {
      const errorText = await response.text()
      console.error(
        `Failed to send push: ${response.status} ${response.statusText}`,
        errorText
      )
      return jsonResponse(200, {
        sent: 0,
        error: `Push API returned ${response.status}`,
      })
    }
  } catch (err) {
    console.error('Error in send-task-push-notification:', err)
    return jsonResponse(500, {
      error: `Server error: ${String(err)}`,
    })
  }
})
