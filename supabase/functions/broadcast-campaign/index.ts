import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@blwcannexus.ca'
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? 'https://app.blwcannexus.ca'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = ALLOWED_ORIGIN
  ? {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    }
  : {}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

interface Recipient {
  email: string
  name: string
}

interface RecipientPill {
  type: 'department' | 'role' | 'subgroup' | 'category' | 'individual'
  deptId?: string
  role?: string
  subgroup?: string
  category?: string
  email?: string
  name?: string
}

interface Campaign {
  id: string
  title: string
  body: string
  body_html: string | null
  icon_url: string | null
  recipient_filters: RecipientPill[]
  segment_id: string | null
  status: string
  include_email: boolean
  email_subject: string | null
  created_by: string
}

// Hardcoded email template (brand colors: purple #4C2A92, gold #E8A020)
function generateEmailHtml(title: string, bodyHtml: string | null, body: string): string {
  const content = bodyHtml || `<p>${escapeHtml(body)}</p>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #4C2A92, #6B3FD4); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
    .header p { margin: 4px 0 0 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 24px; color: #333; line-height: 1.6; }
    .content h2 { color: #4C2A92; margin-top: 0; font-size: 20px; }
    .content p { margin: 12px 0; }
    .accent { color: #E8A020; font-weight: bold; }
    .footer { background: #f5f5f5; padding: 16px 24px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #999; }
    .footer a { color: #4C2A92; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>BLW CAN NEXUS</h1>
      <p>Community Update</p>
    </div>
    <div class="content">
      <h2>${escapeHtml(title)}</h2>
      ${content}
    </div>
    <div class="footer">
      <p>© 2024 BLW CAN NEXUS. All rights reserved.</p>
      <p><a href="${FRONTEND_URL}/notifications">View in app</a></p>
    </div>
  </div>
</body>
</html>`
}

async function resolveRecipients(
  pills: RecipientPill[],
  supabase: ReturnType<typeof createClient>
): Promise<Recipient[]> {
  const recipients = new Map<string, Recipient>()

  for (const pill of pills) {
    if (pill.type === 'individual') {
      if (pill.email && pill.name) {
        recipients.set(pill.email.toLowerCase(), { email: pill.email, name: pill.name })
      }
    } else if (pill.type === 'department') {
      const { data: users } = await supabase
        .from('users')
        .select('email, name')
        .eq('department_id', pill.deptId)

      for (const user of users ?? []) {
        if (user.email) {
          recipients.set(user.email.toLowerCase(), { email: user.email, name: user.name ?? user.email })
        }
      }
    } else if (pill.type === 'role') {
      const { data: users } = await supabase
        .from('users')
        .select('email, name')
        .eq('role', pill.role)

      for (const user of users ?? []) {
        if (user.email) {
          recipients.set(user.email.toLowerCase(), { email: user.email, name: user.name ?? user.email })
        }
      }
    } else if (pill.type === 'subgroup') {
      const { data: roster } = await supabase
        .from('expected_attendees')
        .select('email, full_name')
        .eq('subgroup', pill.subgroup)
        .eq('active', true)

      for (const person of roster ?? []) {
        if (person.email) {
          recipients.set(person.email.toLowerCase(), {
            email: person.email,
            name: person.full_name ?? person.email,
          })
        }
      }
    }
  }

  return Array.from(recipients.values())
}

async function sendEmailsViaResend(
  recipients: Recipient[],
  campaign: Campaign,
  emailSubject: string
): Promise<{ sent: number; failed: number }> {
  if (!RESEND_API_KEY || !campaign.include_email) {
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  const emailHtml = generateEmailHtml(campaign.title, campaign.body_html, campaign.body)

  for (const recipient of recipients) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [recipient.email],
          subject: emailSubject,
          html: emailHtml,
          headers: {
            'X-Entity-Ref-ID': campaign.id,
            'Precedence': 'bulk',
          },
        }),
      })

      if (response.ok) {
        sent++
      } else {
        console.error(`Failed to send email to ${recipient.email}`, response.status)
        failed++
      }
    } catch (error) {
      console.error(`Error sending email to ${recipient.email}`, error)
      failed++
    }
  }

  return { sent, failed }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing environment variables' })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header' })
  }

  let requestBody: { campaign_id?: string } | null = null
  try {
    requestBody = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  if (!requestBody?.campaign_id) {
    return jsonResponse(400, { error: 'campaign_id is required' })
  }

  // Validate user is super_admin or dept_lead
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return jsonResponse(401, { error: 'Unable to validate caller' })
  }

  const { data: userProfile, error: userError } = await supabase
    .from('users')
    .select('id, role, department_id')
    .eq('id', authData.user.id)
    .single()

  if (userError || !userProfile) {
    return jsonResponse(403, { error: 'User profile not found' })
  }

  if (!['super_admin', 'dept_lead'].includes(userProfile.role)) {
    return jsonResponse(403, { error: 'Only super_admin or dept_lead can send broadcasts' })
  }

  // Fetch campaign
  const supabaseService = createClient(supabaseUrl, serviceRoleKey)
  const { data: campaign, error: campaignError } = await supabaseService
    .from('broadcast_campaigns')
    .select('*')
    .eq('id', requestBody.campaign_id)
    .single()

  if (campaignError || !campaign) {
    return jsonResponse(404, { error: 'Campaign not found' })
  }

  const typedCampaign = campaign as Campaign

  // Validate campaign status is 'draft' (Phase 1: no scheduling)
  if (typedCampaign.status !== 'draft') {
    return jsonResponse(422, {
      error: `Campaign cannot be sent while in ${typedCampaign.status} status`,
    })
  }

  // Validate dept_lead only sends within own department
  if (userProfile.role === 'dept_lead') {
    const pills: RecipientPill[] = typedCampaign.recipient_filters ?? []
    for (const pill of pills) {
      if (pill.type === 'department' && pill.deptId !== userProfile.department_id) {
        return jsonResponse(403, {
          error: 'Department leads can only send to their own department',
        })
      }
    }
  }

  try {
    // Mark as broadcasting immediately (prevent double-sends)
    await supabaseService
      .from('broadcast_campaigns')
      .update({ status: 'broadcasting' })
      .eq('id', requestBody.campaign_id)

    // Resolve recipients: prefer saved segment over inline filters
    let recipientPills: RecipientPill[] = typedCampaign.recipient_filters ?? []
    if (typedCampaign.segment_id) {
      console.log(`[broadcast-campaign] resolving recipients from saved segment ${typedCampaign.segment_id}`)
      const { data: segment } = await supabaseService
        .from('communication_segments')
        .select('filters')
        .eq('id', typedCampaign.segment_id)
        .single()
      recipientPills = (segment?.filters as RecipientPill[]) ?? []
    } else {
      console.log('[broadcast-campaign] resolving recipients from inline recipient_filters')
    }
    const recipients = await resolveRecipients(recipientPills, supabaseService)

    if (recipients.length === 0) {
      await supabaseService
        .from('broadcast_campaigns')
        .update({
          status: 'broadcast',
          broadcast_at: new Date().toISOString(),
          sent_count: 0,
        })
        .eq('id', requestBody.campaign_id)

      return jsonResponse(200, {
        success: true,
        in_app_sent: 0,
        emails_sent: 0,
        total_recipients: 0,
      })
    }

    // Create app_notifications (batched)
    let inAppSent = 0
    const batchSize = 50

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize)
      const notifications = batch.map((r) => ({
        recipient_user_id: '', // Will be looked up by email in next step
        type: 'broadcast',
        title: typedCampaign.title,
        body: typedCampaign.body,
        body_html: typedCampaign.body_html,
        icon_url: typedCampaign.icon_url,
        priority: 'normal',
        related_campaign_id: requestBody.campaign_id,
        created_by: userProfile.id,
        sent_at: new Date().toISOString(),
      }))

      // Fetch user IDs by email
      const emails = batch.map((r) => r.email)
      const { data: users } = await supabaseService
        .from('users')
        .select('id, email')
        .in('email', emails)

      const usersByEmail = new Map(users?.map((u) => [u.email.toLowerCase(), u.id]) ?? [])

      const notificationsWithUserIds = notifications
        .map((n, idx) => ({
          ...n,
          recipient_user_id: usersByEmail.get(batch[idx].email.toLowerCase()),
        }))
        .filter((n) => n.recipient_user_id) // Only include users that exist

      if (notificationsWithUserIds.length > 0) {
        const { error: insertError } = await supabaseService
          .from('app_notifications')
          .insert(notificationsWithUserIds)

        if (!insertError) {
          inAppSent += notificationsWithUserIds.length
        } else {
          console.error('Error inserting notifications:', insertError)
        }
      }
    }

    // Send emails if enabled
    const emailSubject = typedCampaign.email_subject ?? typedCampaign.title
    const { sent: emailsSent, failed: emailsFailed } = await sendEmailsViaResend(
      recipients,
      typedCampaign,
      emailSubject
    )

    // Update campaign status to broadcast
    await supabaseService
      .from('broadcast_campaigns')
      .update({
        status: 'broadcast',
        broadcast_at: new Date().toISOString(),
        sent_count: inAppSent,
      })
      .eq('id', requestBody.campaign_id)

    return jsonResponse(200, {
      success: true,
      in_app_sent: inAppSent,
      emails_sent: emailsSent,
      total_recipients: recipients.length,
    })
  } catch (error) {
    console.error('Error in broadcast-campaign:', error)

    // Update campaign status to failed
    await supabaseService
      .from('broadcast_campaigns')
      .update({ status: 'failed' })
      .eq('id', requestBody.campaign_id)

    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})
