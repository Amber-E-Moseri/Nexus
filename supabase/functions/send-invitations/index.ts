import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

const corsHeaders: Record<string, string> = ALLOWED_ORIGIN
  ? {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    }
  : {}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface InvitationTemplate {
  id: string
  email_subject: string
  content_slots: Record<string, string>
  theme_config: {
    palette: {
      text_primary: string
      text_secondary: string
      accent: string
    }
  }
}

interface InvitationCampaign {
  id: string
  name: string
  content: Record<string, string>
  status: string
}

interface InvitationRecipient {
  id: string
  email: string
  token: string
  status: string
  custom_fields: Record<string, string>
}

function tokenReplace(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => tokens[key] ?? '')
}

function mergeTokens(
  template: InvitationTemplate,
  campaign: InvitationCampaign,
  recipient: InvitationRecipient,
): Record<string, string> {
  return {
    ...campaign.content,
    ...recipient.custom_fields,
  }
}

function renderInvitationEmail(link: string, merged: Record<string, string>, theme: any): string {
  const recipientName = merged.name || merged.full_name || 'Friend'
  const eventDate = merged.event_date || ''
  const eventTime = merged.event_time || ''
  const venue = merged.venue || ''
  const message = merged.message || ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
          .email-body { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 32px; }
          .name { font-size: 24px; font-weight: 700; color: ${theme?.palette?.text_primary || '#2D2A22'}; margin-bottom: 4px; }
          .subtext { font-size: 14px; color: ${theme?.palette?.text_secondary || '#9E9488'}; }
          .details { margin: 24px 0; line-height: 1.8; color: ${theme?.palette?.text_primary || '#2D2A22'}; }
          .detail-line { margin: 12px 0; }
          .label { font-weight: 600; color: ${theme?.palette?.accent || '#4C2A92'}; }
          .message { font-style: italic; margin: 24px 0; padding: 16px; background: #f9f9f9; border-left: 4px solid ${theme?.palette?.accent || '#4C2A92'}; color: ${theme?.palette?.text_primary || '#2D2A22'}; }
          .button { display: inline-block; margin: 32px auto; }
          .button-link { background: ${theme?.palette?.accent || '#4C2A92'}; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; }
          .footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #9E9488; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="email-body">
            <div class="header">
              <div class="name">${recipientName}</div>
              <div class="subtext">You're invited</div>
            </div>

            <div class="details">
              ${eventDate ? `<div class="detail-line"><span class="label">Date:</span> ${eventDate}</div>` : ''}
              ${eventTime ? `<div class="detail-line"><span class="label">Time:</span> ${eventTime}</div>` : ''}
              ${venue ? `<div class="detail-line"><span class="label">Location:</span> ${venue}</div>` : ''}
            </div>

            ${message ? `<div class="message">${message}</div>` : ''}

            <div style="text-align: center; margin: 40px 0;">
              <a href="${link}" class="button-link">View Invitation</a>
            </div>

            <div class="footer">
              <p>This is an invitation. Please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendViaResend(
  email: string,
  subject: string,
  html: string,
  replyTo?: string,
): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BLW Canada <invites@blwcanada.ca>',
        to: email,
        subject: subject.trim(),
        html: html,
        reply_to: replyTo || 'noreply@blwcanada.ca',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: `Resend error: ${response.status}` }
    }

    const data = await response.json()
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

async function handleRequest(req: Request, supabase: ReturnType<typeof createClient>) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  try {
    const { campaign_id, filter_unopened } = await req.json()

    if (!campaign_id) {
      return jsonResponse(400, { error: 'campaign_id is required' })
    }

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('invitation_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()

    if (campaignError || !campaign) {
      return jsonResponse(404, { error: 'Campaign not found' })
    }

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from('invitation_templates')
      .select('*')
      .eq('id', campaign.template_id)
      .single()

    if (templateError || !template) {
      return jsonResponse(404, { error: 'Template not found' })
    }

    // Fetch recipients (pending or unopened if filter_unopened is true)
    let query = supabase
      .from('invitation_recipients')
      .select('*')
      .eq('campaign_id', campaign_id)

    if (filter_unopened) {
      query = query.eq('status', 'sent').is('opened_at', null)
    } else {
      query = query.eq('status', 'pending')
    }

    const { data: recipients, error: recipientsError } = await query

    if (recipientsError) {
      return jsonResponse(500, { error: recipientsError.message })
    }

    const invitationBaseUrl = Deno.env.get('INVITATION_BASE_URL') || 'https://invitations.blwcanada.ca'
    let sent = 0
    let failed = 0
    const errors: Array<{ email: string; error: string }> = []

    // Send emails with 100ms delay between sends (Resend free tier: 100/day)
    for (const recipient of recipients || []) {
      await sleep(100)

      try {
        const merged = mergeTokens(template, campaign, recipient)
        const inviteLink = `${invitationBaseUrl}/i/${recipient.token}`
        const subject = tokenReplace(template.email_subject || `You're invited to ${campaign.name}`, merged)
        const html = renderInvitationEmail(inviteLink, merged, template.theme_config)

        const sendResult = await sendViaResend(recipient.email, subject, html, campaign.content?.rsvp_email)

        if (sendResult.success) {
          // Update status to 'sent'
          const { error: updateError } = await supabase
            .from('invitation_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
            })
            .eq('id', recipient.id)

          if (!updateError) {
            sent++
          } else {
            failed++
            errors.push({ email: recipient.email, error: updateError.message })
          }
        } else {
          failed++
          errors.push({ email: recipient.email, error: sendResult.error || 'Failed to send' })
        }
      } catch (err) {
        failed++
        errors.push({
          email: recipient.email,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return jsonResponse(200, {
      sent,
      failed,
      total: (recipients || []).length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : 'Internal server error',
    })
  }
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )

  return handleRequest(req, supabase)
})
