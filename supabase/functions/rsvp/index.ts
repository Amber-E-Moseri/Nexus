import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

const corsHeaders: Record<string, string> = ALLOWED_ORIGIN
  ? {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    }
  : {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function renderRsvpNotificationEmail(
  recipientName: string,
  recipientEmail: string,
  response: string,
  timestamp: string,
): string {
  const responseLabel = response === 'rsvp_yes' ? 'Yes' : 'No'
  const responseColor = response === 'rsvp_yes' ? '#4C2A92' : '#9E9488'
  const dateFormatted = new Date(timestamp).toLocaleString()

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #2D2A22; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
          .email-body { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 32px; }
          .title { font-size: 20px; font-weight: 700; color: #2D2A22; margin-bottom: 8px; }
          .subtitle { font-size: 14px; color: #9E9488; }
          .response-box { text-align: center; margin: 32px 0; padding: 24px; background: #f9f9f9; border-radius: 8px; }
          .response-label { font-size: 12px; font-weight: 600; color: #9E9488; text-transform: uppercase; letter-spacing: 0.5px; }
          .response-value { font-size: 36px; font-weight: 700; color: ${responseColor}; margin: 8px 0; }
          .details { margin: 24px 0; line-height: 1.8; }
          .detail-line { margin: 12px 0; }
          .label { font-weight: 600; color: #4C2A92; }
          .footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #9E9488; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="email-body">
            <div class="header">
              <div class="title">RSVP Response Received</div>
              <div class="subtitle">Invitation response notification</div>
            </div>

            <div class="response-box">
              <div class="response-label">Response</div>
              <div class="response-value">${responseLabel}</div>
            </div>

            <div class="details">
              <div class="detail-line"><span class="label">Recipient:</span> ${recipientName}</div>
              <div class="detail-line"><span class="label">Email:</span> ${recipientEmail}</div>
              <div class="detail-line"><span class="label">Response:</span> ${responseLabel}</div>
              <div class="detail-line"><span class="label">Responded At:</span> ${dateFormatted}</div>
            </div>

            <div class="footer">
              <p>This is an automated notification from BLW CAN NEXUS. Please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `
}

async function sendViaResend(
  email: string,
  subject: string,
  html: string,
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
        from: 'BLW CAN NEXUS <invites@blwcannexus.ca>',
        to: email,
        subject: subject.trim(),
        html: html,
        reply_to: 'noreply@blwcannexus.ca',
      }),
    })

    if (!response.ok) {
      return { success: false, error: `Resend error: ${response.status}` }
    }

    await response.json()
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
    const { token, response: rsvpResponse } = await req.json()

    if (!token) {
      return jsonResponse(400, { error: 'token is required' })
    }

    if (!rsvpResponse || !['rsvp_yes', 'rsvp_no'].includes(rsvpResponse)) {
      return jsonResponse(400, { error: 'response must be rsvp_yes or rsvp_no' })
    }

    // Fetch recipient by token (this is public, no auth check needed)
    const { data: recipient, error: recipientError } = await supabase
      .from('invitation_recipients')
      .select('*')
      .eq('token', token)
      .single()

    if (recipientError || !recipient) {
      return jsonResponse(404, { error: 'Invitation not found' })
    }

    // Update RSVP status (only update if not already responded)
    if (recipient.rsvp_at || ['rsvp_yes', 'rsvp_no'].includes(recipient.status)) {
      return jsonResponse(400, { error: 'Response already recorded' })
    }

    const { error: updateError } = await supabase
      .from('invitation_recipients')
      .update({
        status: rsvpResponse,
        rsvp_at: new Date().toISOString(),
      })
      .eq('id', recipient.id)

    if (updateError) {
      return jsonResponse(500, { error: updateError.message })
    }

    // Fetch campaign to get RSVP email
    const { data: campaign, error: campaignError } = await supabase
      .from('invitation_campaigns')
      .select('*')
      .eq('id', recipient.campaign_id)
      .single()

    if (!campaignError && campaign) {
      const rsvpEmail = campaign.content?.rsvp_email
      if (rsvpEmail) {
        const recipientName = recipient.custom_fields?.name || recipient.custom_fields?.full_name || 'Guest'
        const html = renderRsvpNotificationEmail(
          recipientName,
          recipient.email,
          rsvpResponse,
          new Date().toISOString(),
        )

        const subject = `RSVP: ${recipientName} responded ${rsvpResponse === 'rsvp_yes' ? 'Yes' : 'No'}`

        // Send notification email (non-blocking)
        sendViaResend(rsvpEmail, subject, html).catch((err) => {
          console.error('Failed to send RSVP notification email:', err)
        })
      }
    }

    return jsonResponse(200, {
      success: true,
      status: rsvpResponse,
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
