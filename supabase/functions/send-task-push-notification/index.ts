import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)

  function jsonResponse(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@blwcanada.org'

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys not configured')
    return jsonResponse(500, { error: 'Push notifications not configured (missing VAPID keys)' })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

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
    return jsonResponse(400, { error: 'Missing required fields: userId, title, message' })
  }

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('push_subscription, push_enabled')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return jsonResponse(200, { sent: 0, reason: 'User not found' })
    }

    if (!user.push_enabled || !user.push_subscription) {
      return jsonResponse(200, { sent: 0, reason: 'Push not enabled or no subscription' })
    }

    const subscription = user.push_subscription as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    const payload = JSON.stringify({
      title,
      body: message,
      icon: '/logo-purple-192.png',
      badge: '/logo-purple-192.png',
      tag: type,
      requireInteraction: false,
      data: { url, taskId, timestamp: Date.now() },
    })

    await webpush.sendNotification(subscription, payload, { TTL: 86400 })

    console.log(`Push sent to user ${userId}`)
    return jsonResponse(200, { sent: 1, userId })
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 410 || status === 404) {
      // Subscription expired — clean up so we stop trying
      await supabase
        .from('users')
        .update({ push_subscription: null, push_enabled: false })
        .eq('id', userId)
      return jsonResponse(200, { sent: 0, reason: 'Subscription expired, cleaned up' })
    }
    console.error('Push error:', err)
    return jsonResponse(200, { sent: 0, error: String(err) })
  }
})
