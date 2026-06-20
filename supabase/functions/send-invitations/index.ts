import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@latest'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FRONTEND_URL = Deno.env.get('FRONTEND_URL') || 'https://yourdomain.com'

export default async (req: Request) => {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { campaignId } = await req.json()
  if (!campaignId) {
    return new Response(JSON.stringify({ error: 'campaignId is required' }), { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!)
  const resend = new Resend(RESEND_API_KEY)

  try {
    const { data: campaign, error: campaignError } = await supabase
      .from('invitation_campaigns')
      .select(`
        id,
        org_id,
        template_id,
        name,
        content,
        status,
        invitation_templates(
          id,
          name,
          email_subject,
          theme_config,
          animation_config
        ),
        invitation_recipients(
          id,
          email,
          token,
          custom_fields,
          status
        )
      `)
      .eq('id', campaignId)
      .single()

    if (campaignError) throw campaignError
    if (!campaign) throw new Error('Campaign not found')

    const template = campaign.invitation_templates
    const recipients = campaign.invitation_recipients || []
    const pendingRecipients = recipients.filter((r: any) => r.status === 'pending')

    let sent = 0
    let failed = 0
    const errors: Array<{ email: string; error: string }> = []

    for (const recipient of pendingRecipients) {
      const invitationLink = `${FRONTEND_URL}/invitations/${recipient.token}`
      const emailSubject = mergeTokens(template.email_subject || 'You\'re invited!', {
        ...campaign.content,
        ...recipient.custom_fields
      })

      try {
        await resend.emails.send({
          from: 'invitations@blwcannexus.org',
          to: recipient.email,
          subject: emailSubject,
          html: generateEmailHTML({
            recipientName: recipient.custom_fields?.name || recipient.email,
            eventName: campaign.content?.event_name || 'Event',
            invitationLink,
            templateTheme: template.theme_config
          })
        })

        await supabase
          .from('invitation_recipients')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', recipient.id)

        sent++
      } catch (err) {
        console.error(`Failed to send to ${recipient.email}:`, err)
        errors.push({
          email: recipient.email,
          error: String(err)
        })
        failed++
      }
    }

    if (sent > 0) {
      await supabase
        .from('invitation_campaigns')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', campaignId)
    }

    return new Response(JSON.stringify({
      sent,
      failed,
      total: pendingRecipients.length,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('Error in send-invitations:', err)
    return new Response(JSON.stringify({
      error: String(err),
      message: 'Failed to send invitations'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

function mergeTokens(text: string, values: Record<string, any>): string {
  if (!text) return text
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return values[key] ? String(values[key]) : match
  })
}

function generateEmailHTML(data: {
  recipientName: string
  eventName: string
  invitationLink: string
  templateTheme: any
}): string {
  const accentColor = data.templateTheme?.palette?.accent || '#4C2A92'

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px 24px; }
        .greeting { font-size: 14px; color: #666; margin: 0 0 16px 0; }
        .invite-text { font-size: 18px; font-weight: 700; color: #333; margin: 0 0 12px 0; }
        .event-name { font-size: 24px; font-weight: 800; color: ${accentColor}; margin: 12px 0 24px 0; }
        .button-container { text-align: center; margin: 32px 0; }
        .button { display: inline-block; padding: 14px 32px; background: ${accentColor}; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; }
        .footer { font-size: 12px; color: #999; margin: 24px 0 0 0; padding-top: 16px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <p class="greeting">Hello ${escapeHtml(data.recipientName)},</p>
        <p class="invite-text">You're invited to</p>
        <p class="event-name">${escapeHtml(data.eventName)}</p>

        <div class="button-container">
          <a href="${data.invitationLink}" class="button">Open Your Invitation</a>
        </div>

        <p style="font-size: 13px; color: #666; margin: 24px 0 0 0; line-height: 1.6;">
          Click the button above to view your personalized invitation and respond.
        </p>

        <div class="footer">
          BLW CAN NEXUS | Invitation Platform
        </div>
      </div>
    </body>
    </html>
  `
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, (char) => map[char])
}
