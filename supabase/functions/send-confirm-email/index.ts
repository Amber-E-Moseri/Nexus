import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

// Send a subscription confirmation email. Called by the `subscribe` edge
// function when double_opt_in_enabled is true.

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  ...(ALLOWED_ORIGIN ? { Vary: 'Origin' } : {}),
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function renderConfirmEmail(recipientName: string, confirmUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1C1610; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #FAFAF8; }
          .email-body { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 32px; }
          .title { font-size: 20px; font-weight: 700; color: #1C1610; margin-bottom: 8px; }
          .subtitle { font-size: 14px; color: #6D6860; }
          .message { margin: 28px 0; line-height: 1.6; color: #4A4641; }
          .cta-button { display: inline-block; background: #4C2A92; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; }
          .cta-container { text-align: center; margin: 32px 0; }
          .footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #6D6860; }
          .code-block { background: #F5F3F0; padding: 16px; border-radius: 6px; font-family: monospace; font-size: 11px; word-break: break-all; margin: 16px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="email-body">
            <div class="header">
              <div class="title">Confirm your subscription</div>
              <div class="subtitle">You're almost on our mailing list</div>
            </div>

            <div class="message">
              <p>Hi ${recipientName || 'there'},</p>
              <p>Thanks for signing up! Click the button below to confirm your email address and complete your subscription.</p>
            </div>

            <div class="cta-container">
              <a href="${confirmUrl}" class="cta-button">Confirm subscription</a>
            </div>

            <div class="message" style="font-size: 13px; color: #9E9488; margin-top: 20px;">
              <p>Or copy and paste this link in your browser:</p>
              <div class="code-block">${confirmUrl}</div>
            </div>

            <div class="footer">
              <p>This confirmation link expires in 7 days.</p>
              <p>If you didn't sign up for this, you can safely ignore this email.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `
}

async function sendViaResend(to: string, html: string): Promise<{ success: boolean; error?: string }> {
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
        from: 'BLW CAN NEXUS <noreply@blwcannexus.ca>',
        to,
        subject: 'Confirm your subscription',
        html,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  try {
    const { email, full_name, confirm_url } = await req.json().catch(() => null) as Record<string, string> | null

    if (!email || !confirm_url) {
      return jsonResponse(400, { error: 'email and confirm_url are required' })
    }

    const recipientName = full_name || email
    const html = renderConfirmEmail(recipientName, confirm_url)

    const result = await sendViaResend(email, html)
    if (!result.success) {
      return jsonResponse(500, { error: result.error || 'Failed to send confirmation email' })
    }

    return jsonResponse(200, { success: true })
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Internal server error' })
  }
})
