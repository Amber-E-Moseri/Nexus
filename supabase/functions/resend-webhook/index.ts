/**
 * Resend webhook handler — receives email delivery events and updates communication_sends.
 *
 * SETUP IN RESEND DASHBOARD:
 * 1. Go to resend.com/webhooks
 * 2. Add endpoint: https://[your-ref].supabase.co/functions/v1/resend-webhook
 * 3. Select events: email.opened, email.bounced, email.complained, email.delivery_delayed
 * 4. Copy the "Signing Secret" → set as RESEND_WEBHOOK_SECRET in Supabase secrets:
 *    supabase secrets set RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function verifyWebhookSignature(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): Promise<boolean> {
  try {
    const signedContent  = `${svixId}.${svixTimestamp}.${payload}`
    const secretBytes    = new TextEncoder().encode(secret.replace(/^whsec_/, ''))
    const messageBytes   = new TextEncoder().encode(signedContent)

    // svix uses base64-decoded secret as HMAC key
    let keyBytes: Uint8Array
    try {
      keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0))
    } catch {
      // If not valid base64, use raw bytes
      keyBytes = secretBytes
    }

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signature     = await crypto.subtle.sign('HMAC', key, messageBytes)
    const computed      = btoa(String.fromCharCode(...new Uint8Array(signature)))
    const expectedSigs  = svixSignature.split(' ').map((s) => s.replace(/^v1,/, ''))

    return expectedSigs.some((sig) => sig === computed)
  } catch (err) {
    console.error('Signature verification error', err)
    return false
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const webhookSecret  = Deno.env.get('RESEND_WEBHOOK_SECRET')
  const supabaseUrl    = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Missing environment variables' })
  }

  const payload        = await request.text()
  const svixId         = request.headers.get('svix-id')         ?? ''
  const svixTimestamp  = request.headers.get('svix-timestamp')  ?? ''
  const svixSignature  = request.headers.get('svix-signature')  ?? ''

  // Verify signature if secret is configured
  if (webhookSecret) {
    const valid = await verifyWebhookSignature(payload, svixId, svixTimestamp, svixSignature, webhookSecret)
    if (!valid) {
      console.error('Invalid webhook signature')
      return json(400, { error: 'Invalid signature' })
    }
  }

  let event: { type?: string; data?: { email_id?: string; email?: string } }
  try {
    event = JSON.parse(payload)
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const emailId = event.data?.email_id
  if (!emailId) {
    console.log('No email_id in event, skipping', event.type)
    return json(200, { ok: true })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Find the send record
  const { data: sendRecord, error: findError } = await supabase
    .from('communication_sends')
    .select('id, campaign_id, recipient_email, status')
    .eq('resend_email_id', emailId)
    .single()

  if (findError || !sendRecord) {
    console.log('No send record found for email_id', emailId)
    return json(200, { ok: true, note: 'no matching send record' })
  }

  switch (event.type) {
    case 'email.opened': {
      await supabase
        .from('communication_sends')
        .update({ status: 'opened', opened_at: new Date().toISOString() })
        .eq('id', sendRecord.id)

      if (sendRecord.campaign_id) {
        await supabase.rpc('increment_campaign_open_count', { campaign_id: sendRecord.campaign_id })
          .catch(() => {
            // Fallback: manual increment
            supabase
              .from('communication_campaigns')
              .select('open_count')
              .eq('id', sendRecord.campaign_id)
              .single()
              .then(({ data }) => {
                if (data) {
                  supabase
                    .from('communication_campaigns')
                    .update({ open_count: (data.open_count ?? 0) + 1 })
                    .eq('id', sendRecord.campaign_id)
                }
              })
          })
      }
      break
    }

    case 'email.bounced': {
      // Resend bounce payload includes a bounce_type field; default to 'hard' if absent
      const bounceType: string = (event.data as Record<string, unknown>)?.bounce_type as string ?? 'hard'

      await supabase
        .from('communication_sends')
        .update({ status: 'bounced', error_message: `${bounceType} bounce` })
        .eq('id', sendRecord.id)

      if (sendRecord.campaign_id) {
        const { data: camp } = await supabase
          .from('communication_campaigns')
          .select('failed_count')
          .eq('id', sendRecord.campaign_id)
          .single()
        if (camp) {
          await supabase
            .from('communication_campaigns')
            .update({ failed_count: (camp.failed_count ?? 0) + 1 })
            .eq('id', sendRecord.campaign_id)
        }
      }

      // Write to email_bounces suppression table (created in 20260617_click_bounces.sql)
      await supabase
        .from('email_bounces')
        .upsert(
          {
            email:       sendRecord.recipient_email.toLowerCase(),
            bounce_type: bounceType,
            bounced_at:  new Date().toISOString(),
            suppressed:  bounceType === 'hard',
          },
          { onConflict: 'email' },
        )

      // Hard bounces also go to unsubscribes so they're excluded from future sends
      if (bounceType === 'hard') {
        await supabase
          .from('communication_unsubscribes')
          .upsert(
            { email: sendRecord.recipient_email.toLowerCase(), unsubscribed_via: 'hard_bounce' },
            { onConflict: 'email' },
          )
      }
      break
    }

    case 'email.complained': {
      await supabase
        .from('communication_sends')
        .update({ status: 'unsubscribed' })
        .eq('id', sendRecord.id)

      // Spam complaint → add to unsubscribes
      await supabase
        .from('communication_unsubscribes')
        .upsert(
          { email: sendRecord.recipient_email.toLowerCase(), unsubscribed_via: 'complaint' },
          { onConflict: 'email' },
        )
      break
    }

    case 'email.delivery_delayed': {
      // Log only, no status change
      console.log(`Delivery delayed for ${sendRecord.recipient_email}, email_id=${emailId}`)
      break
    }

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return json(200, { ok: true, event_type: event.type })
})
