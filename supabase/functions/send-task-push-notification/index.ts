// Push dispatcher. TRUSTED INTERNAL CALLERS ONLY (DB trigger / cron / service role).
//
// Contract: POST { notification_id } with Authorization: Bearer <service-role key
// or CRON_SHARED_SECRET>. The recipient, title, body and deep link are loaded /
// derived server-side from the stored `notifications` row. Client-supplied
// userId/title/message/url are ignored. See _shared/pushCore.ts.
//
// verify_jwt = false in supabase/config.toml: the gateway's JWT check admits the
// public anon key, so authorization is enforced here instead (fail closed).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { handlePushDispatch, type PushSubscriptionJson } from '../_shared/pushCore.ts'

Deno.serve(async (req) => {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@blwcanada.org'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  return handlePushDispatch(req, {
    secrets: {
      serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      cronSecret: Deno.env.get('CRON_SHARED_SECRET'),
    },
    async loadNotification(id) {
      const { data } = await supabase
        .from('notifications')
        .select('id, user_id, type, payload')
        .eq('id', id)
        .maybeSingle()
      return data ?? null
    },
    async mobilePrefEnabled(userId, type) {
      const { data } = await supabase
        .from('user_notification_prefs')
        .select('mobile')
        .eq('user_id', userId)
        .eq('notification_type', type)
        .maybeSingle()
      return data?.mobile === true
    },
    async loadSubscription(userId) {
      const { data } = await supabase
        .from('users')
        .select('push_subscription, push_enabled')
        .eq('id', userId)
        .maybeSingle()
      if (!data?.push_enabled || !data.push_subscription) return null
      return data.push_subscription as PushSubscriptionJson
    },
    async send(sub, message) {
      if (!vapidPublicKey || !vapidPrivateKey) throw new Error('VAPID not configured')
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
      try {
        await webpush.sendNotification(sub, message, { TTL: 86400 })
        return {}
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) return { gone: true }
        throw err
      }
    },
    async onGone(userId) {
      await supabase.from('users').update({ push_subscription: null, push_enabled: false }).eq('id', userId)
    },
    log: (m) => console.log(m),
  })
})
