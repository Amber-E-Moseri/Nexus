// Notification email dispatcher. TRUSTED INTERNAL CALLERS ONLY (DB trigger / cron / service role).
//
// Contract: POST { notification_id } with Authorization: Bearer <CRON_SHARED_SECRET or service-role key>.
// The recipient, template, subject, body and link are derived server-side from the stored
// `notifications` row. Client-supplied user_id / notification_type / payload / action_url are ignored.
// See _shared/emailCore.ts.
//
// verify_jwt = false in supabase/config.toml: the gateway's JWT check admits the public anon key, so
// authorization is enforced inside the function (fail closed).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleEmailDispatch } from '../_shared/emailCore.ts'

Deno.serve((req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const frontendUrl = (Deno.env.get('FRONTEND_URL') ?? 'https://blwcannexus.org').replace(/\/+$/, '')

  return handleEmailDispatch(req, {
    secrets: {
      serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      cronSecret: Deno.env.get('CRON_SHARED_SECRET'),
    },
    frontendUrl,
    async loadNotification(id) {
      const { data } = await supabase
        .from('notifications')
        .select('id, user_id, type, payload, email_sent_at')
        .eq('id', id)
        .maybeSingle()
      return data ?? null
    },
    async emailPref(userId, type) {
      const { data } = await supabase
        .from('user_notification_prefs')
        .select('email')
        .eq('user_id', userId)
        .eq('notification_type', type)
        .maybeSingle()
      return data ? data.email === true : null
    },
    async loadUser(userId) {
      const { data } = await supabase.from('users').select('name, email').eq('id', userId).maybeSingle()
      return data ?? null
    },
    async claim(id) {
      const { data } = await supabase
        .from('notifications')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', id)
        .is('email_sent_at', null)
        .select('id')
      return (data?.length ?? 0) === 1
    },
    async release(id) {
      await supabase.from('notifications').update({ email_sent_at: null }).eq('id', id)
    },
    async send({ to, subject, html }) {
      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      if (!resendApiKey) return { ok: false }
      const fromEmail = Deno.env.get('INVITATION_FROM_EMAIL') ?? 'notifications@blwcannexus.org'
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `BLW CAN NEXUS <${fromEmail}>`, to: [to], subject, html }),
      })
      const out = await res.json().catch(() => ({}))
      return { ok: res.ok, id: out?.id }
    },
    log: (m) => console.log(m),
  })
})
