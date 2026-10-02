import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

import { corsOptionsResponse, jsonResponse } from '../_shared/cors.ts'
import {
  normalizeEmail,
  personalizeSubject,
  replaceMergeTags,
  renderIcplcEmailHtml,
  resolveRecipients,
  stripPlain,
} from '../_shared/icplcEmailCore.ts'

type SupabaseClient = ReturnType<typeof createClient>

interface RequestBody {
  event_id?: string
  participant_ids?: string[]
  subject?: string
  body?: string
  idempotency_key?: string
  test?: boolean
  retry_campaign_id?: string
}

interface Profile {
  id: string
  email: string | null
  name: string | null
  role: string | null
}

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown provider error')
  return stripPlain(raw.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted]'), 500)
}

function requireUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

async function sendViaResend({
  apiKey,
  fromEmail,
  to,
  subject,
  html,
  text,
  campaignId,
  sendId,
  replyTo,
}: {
  apiKey: string
  fromEmail: string
  to: string
  subject: string
  html: string
  text: string
  campaignId: string
  sendId: string
  replyTo?: string | null
}): Promise<{ id: string | null }> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      html,
      text,
      reply_to: replyTo || undefined,
      headers: {
        'X-Entity-Ref-ID': `${campaignId}:${sendId}`,
        Precedence: 'bulk',
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Resend responded with ${response.status}`)
  }

  const data = await response.json().catch(() => ({}))
  return { id: typeof data?.id === 'string' ? data.id : null }
}

async function countCampaign(supabase: SupabaseClient, campaignId: string) {
  const { count: sent } = await supabase
    .from('communication_sends')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'sent')

  const { count: failed } = await supabase
    .from('communication_sends')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'failed')

  const { count: remaining } = await supabase
    .from('communication_sends')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'retrying'])

  return { sent: sent ?? 0, failed: failed ?? 0, remaining: remaining ?? 0 }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return corsOptionsResponse(request)

  const respond = (status: number, body: Record<string, unknown>) =>
    jsonResponse(status, body, undefined, request)

  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL') ?? Deno.env.get('INVITATION_FROM_EMAIL')

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    return respond(500, { error: 'Email service is not configured.' })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return respond(401, { error: 'Missing authorization header.' })

  const body = (await request.json().catch(() => null)) as RequestBody | null
  if (!body) return respond(400, { error: 'Invalid JSON body.' })

  const eventId = body.event_id
  if (!requireUuid(eventId)) return respond(400, { error: 'event_id is required.' })

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const authClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: authData, error: authError } = await authClient.auth.getUser()
  if (authError || !authData.user) return respond(401, { error: 'Unable to validate caller.' })

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', authData.user.id)
    .single()

  if (!profile) return respond(403, { error: 'Sender profile not found.' })
  const sender = profile as Profile

  const { data: eventConfig, error: eventError } = await supabase
    .from('event_configs')
    .select('id, event_name')
    .eq('id', eventId)
    .single()

  if (eventError || !eventConfig || !/icplc/i.test(String(eventConfig.event_name ?? ''))) {
    return respond(404, { error: 'ICPLC event not found.' })
  }

  const { data: isProgramsMember } = await authClient.rpc('icplc_is_programs_member')
  const isPrivilegedRole = ['super_admin', 'regional_secretary'].includes(sender.role ?? '')
  if (!isPrivilegedRole && isProgramsMember !== true) {
    return respond(403, { error: 'You do not have permission to send ICPLC mass email.' })
  }

  if (body.test) {
    const subject = stripPlain(body.subject, 200)
    const messageBody = String(body.body ?? '').trim()
    if (!subject || !messageBody) return respond(400, { error: 'subject and body are required.' })
    const to = sender.email ?? authData.user.email ?? ''
    if (!to || normalizeEmail(to) !== normalizeEmail(authData.user.email ?? to)) {
      return respond(403, { error: 'Test emails can only be sent to the signed-in sender.' })
    }

    const testCampaignId = crypto.randomUUID()
    const testSendId = crypto.randomUUID()
    const vars = {
      name: sender.name ?? 'Test Recipient',
      first_name: (sender.name ?? 'Test').split(/\s+/)[0],
      subgroup: 'Preview',
      email: to,
    }
    await sendViaResend({
      apiKey: resendApiKey,
      fromEmail,
      to,
      subject: `[TEST] ${personalizeSubject(subject, vars)}`,
      html: renderIcplcEmailHtml(messageBody, vars, { isTest: true }),
      text: stripPlain(replaceMergeTags(messageBody, vars), 5000),
      campaignId: testCampaignId,
      sendId: testSendId,
      replyTo: sender.email,
    })

    return respond(200, { test: true, sent: 1, failed: 0, to: normalizeEmail(to) })
  }

  const retryCampaignId = body.retry_campaign_id
  let campaignId: string | null = null
  let resolution = null as ReturnType<typeof resolveRecipients> | null
  let subject = ''
  let messageBody = ''

  if (retryCampaignId) {
    if (!requireUuid(retryCampaignId)) return respond(400, { error: 'retry_campaign_id must be a UUID.' })
    const { data: campaign, error } = await supabase
      .from('communication_campaigns')
      .select('id, created_by, subject, body, body_text, event_config_id, recipient_type')
      .eq('id', retryCampaignId)
      .single()
    if (error || !campaign) return respond(404, { error: 'Campaign not found.' })
    if (campaign.recipient_type !== 'icplc' || campaign.event_config_id !== eventId) {
      return respond(403, { error: 'Campaign is not scoped to this ICPLC event.' })
    }
    campaignId = campaign.id
    subject = String(campaign.subject ?? '')
    messageBody = String(campaign.body_text ?? campaign.body ?? '')
  } else {
    subject = stripPlain(body.subject, 200)
    messageBody = String(body.body ?? '').trim()
    const idempotencyKey = stripPlain(body.idempotency_key, 180)
    const requestedIds = Array.isArray(body.participant_ids) ? body.participant_ids.filter(requireUuid) : []

    if (!subject || !messageBody) return respond(400, { error: 'subject and body are required.' })
    if (!idempotencyKey) return respond(400, { error: 'idempotency_key is required.' })
    if (requestedIds.length === 0) return respond(400, { error: 'participant_ids are required.' })

    const { data: participants, error } = await supabase
      .from('icplc_participants')
      .select('id, full_name, email, subgroup, participation_status')
      .eq('event_id', eventId)
      .in('id', requestedIds)

    if (error) return respond(500, { error: 'Unable to resolve participants.' })
    resolution = resolveRecipients(requestedIds, participants ?? [])

    const campaignPayload = {
      name: `ICPLC ${eventConfig.event_name} email`,
      subject,
      body: messageBody,
      body_text: messageBody,
      body_html: renderIcplcEmailHtml(messageBody, {
        name: 'Preview Recipient',
        first_name: 'Preview',
        subgroup: 'Preview',
        email: 'preview@example.com',
      }),
      status: 'sending',
      recipient_type: 'icplc',
      event_config_id: eventId,
      recipient_source: 'participant_selection',
      recipient_count: resolution.uniqueRecipients,
      skipped_count: resolution.skippedMissingEmail + resolution.skippedInvalidEmail + resolution.skippedNotAttending + resolution.unmatchedParticipantIds.length,
      created_by: sender.id,
      idempotency_key: idempotencyKey,
    }

    const { data: inserted, error: insertError } = await supabase
      .from('communication_campaigns')
      .insert(campaignPayload)
      .select('id')
      .single()

    if (insertError) {
      const { data: existing } = await supabase
        .from('communication_campaigns')
        .select('id')
        .eq('created_by', sender.id)
        .eq('idempotency_key', idempotencyKey)
        .single()
      if (!existing?.id) return respond(500, { error: 'Unable to claim campaign.' })
      campaignId = existing.id
    } else {
      campaignId = inserted.id
    }

    const sendRows = resolution.recipients.map((recipient) => ({
      campaign_id: campaignId,
      recipient_email: recipient.email,
      recipient_email_normalized: recipient.normalizedEmail,
      recipient_name: recipient.name,
      status: 'pending',
      source_participant_id: recipient.participantIds[0] ?? null,
      source_participant_ids: recipient.participantIds,
      recipient_metadata: {
        subgroup: recipient.subgroup,
        participant_ids: recipient.participantIds,
      },
    }))

    if (sendRows.length > 0) {
      const { error: sendsError } = await supabase
        .from('communication_sends')
        .upsert(sendRows, { onConflict: 'campaign_id,recipient_email_normalized', ignoreDuplicates: true })
      if (sendsError) return respond(500, { error: 'Unable to persist recipient audit rows.' })
    }
  }

  if (!campaignId) return respond(500, { error: 'Campaign was not claimed.' })

  const { data: rows, error: rowError } = await supabase
    .from('communication_sends')
    .select('id, recipient_email, recipient_name, status, recipient_metadata')
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'failed'])

  if (rowError) return respond(500, { error: 'Unable to load pending sends.' })

  const errors: Array<{ email: string; error: string }> = []
  let sentThisRun = 0
  let failedThisRun = 0

  for (const row of rows ?? []) {
    const { data: claimed, error: claimError } = await supabase
      .from('communication_sends')
      .update({ status: 'retrying', error_message: null })
      .eq('id', row.id)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle()

    if (claimError || !claimed) continue

    const vars = {
      name: row.recipient_name,
      first_name: String(row.recipient_name ?? '').split(/\s+/)[0] ?? '',
      subgroup: row.recipient_metadata?.subgroup ?? '',
      email: row.recipient_email,
    }

    try {
      const result = await sendViaResend({
        apiKey: resendApiKey,
        fromEmail,
        to: row.recipient_email,
        subject: personalizeSubject(subject, vars),
        html: renderIcplcEmailHtml(messageBody, vars),
        text: stripPlain(replaceMergeTags(messageBody, vars), 5000),
        campaignId,
        sendId: row.id,
        replyTo: sender.email,
      })

      await supabase
        .from('communication_sends')
        .update({
          status: 'sent',
          resend_email_id: result.id,
          error_message: null,
          sent_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      sentThisRun += 1
    } catch (error) {
      const errorMessage = safeErrorMessage(error)
      await supabase
        .from('communication_sends')
        .update({
          status: 'failed',
          error_message: errorMessage,
          last_error_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      failedThisRun += 1
      errors.push({ email: normalizeEmail(row.recipient_email), error: errorMessage })
    }
  }

  const totals = await countCampaign(supabase, campaignId)
  const finalStatus = totals.remaining > 0 ? 'sending' : totals.failed > 0 ? 'failed' : 'sent'
  await supabase
    .from('communication_campaigns')
    .update({
      status: finalStatus,
      sent_count: totals.sent,
      failed_count: totals.failed,
      sent_at: finalStatus === 'sent' || finalStatus === 'failed' ? new Date().toISOString() : null,
      last_error_at: totals.failed > 0 ? new Date().toISOString() : null,
    })
    .eq('id', campaignId)

  return respond(200, {
    campaign_id: campaignId,
    status: finalStatus,
    sent: totals.sent,
    failed: totals.failed,
    sent_this_run: sentThisRun,
    failed_this_run: failedThisRun,
    errors,
    resolution: resolution ? {
      requested_participants: resolution.requestedParticipants,
      eligible_participants: resolution.eligibleParticipants,
      unique_recipients: resolution.uniqueRecipients,
      skipped_missing_email: resolution.skippedMissingEmail,
      skipped_invalid_email: resolution.skippedInvalidEmail,
      skipped_not_attending: resolution.skippedNotAttending,
      deduplicated_recipients: resolution.deduplicatedRecipients,
      unmatched_participants: resolution.unmatchedParticipantIds.length,
    } : null,
  })
})
