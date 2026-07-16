import { supabase } from '../supabase'

/**
 * Send campaign invitations (test mode or production)
 * Test mode: Mark recipients as sent without actually sending emails
 * Production: Call Supabase edge function to send via Resend
 */
export async function sendCampaignInvitations(campaignId, testMode = false) {
  if (testMode) {
    return sendCampaignInvitationsTest(campaignId)
  }

  return sendCampaignInvitationsProduction(campaignId)
}

/**
 * TEST MODE: Simulate sending (mark as sent, don't actually email)
 */
export async function sendCampaignInvitationsTest(campaignId) {
  try {
    // Fetch pending recipients
    const { data: recipients, error: fetchError } = await supabase
      .from('invitation_recipients')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')

    if (fetchError) throw fetchError

    if (recipients.length === 0) {
      return {
        sent: 0,
        failed: 0,
        testMode: true,
        message: '[TEST MODE] No pending recipients to mark as sent'
      }
    }

    // Mark all pending recipients as "sent"
    const { error: updateError } = await supabase
      .from('invitation_recipients')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')

    if (updateError) throw updateError

    // Update campaign status
    await supabase
      .from('invitation_campaigns')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', campaignId)

    return {
      sent: recipients.length,
      failed: 0,
      testMode: true,
      message: `[TEST MODE] Marked ${recipients.length} recipients as sent (no emails sent)`
    }
  } catch (err) {
    console.error('Test mode error:', err)
    throw err
  }
}

/**
 * PRODUCTION MODE: Call edge function to send via Resend
 */
export async function sendCampaignInvitationsProduction(campaignId) {
  try {
    const { data: session } = await supabase.auth.getSession()
    const authToken = session?.access_token

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-invitations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ campaignId })
      }
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || `Failed to send invitations (${response.status})`)
    }

    const result = await response.json()
    return {
      sent: result.sent,
      failed: result.failed,
      testMode: false,
      message: result.errors ? `Sent ${result.sent} with ${result.failed} failures` : `Successfully sent ${result.sent} invitations`
    }
  } catch (err) {
    console.error('Production send error:', err)
    throw err
  }
}

/**
 * Merge template tokens with recipient data
 * Replaces {{token}} with values from object
 */
export function mergeTokens(text, values) {
  if (!text) return text
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return values[key] || match
  })
}
