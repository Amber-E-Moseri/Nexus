import { useState } from 'react'
import { Send, Calendar, Bookmark } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { sendCampaignInvitations } from '../../lib/invitations/sendEmail'
import { generateRsvpToken } from '../../lib/rsvpTokens'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'

function ClassicEnvelope({ recipient, content }) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: 24,
        minHeight: 300,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <div style={{ fontSize: 13, color: MUTED, textTransform: 'uppercase', letterSpacing: '.1em' }}>
        Dear {recipient?.name || '[Recipient Name]'},
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, lineHeight: 1.6 }}>
        You are cordially invited to
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: PRIMARY, lineHeight: 1.4 }}>
        {content.event_name || '[Event Name]'}
      </div>
      <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, marginTop: 16 }}>
        <div>
          <strong>Date:</strong> {content.date || '[Date]'}
        </div>
        <div>
          <strong>Time:</strong> {content.time || '[Time]'}
        </div>
        <div>
          <strong>Location:</strong> {content.venue || '[Location]'}
        </div>
        <div style={{ marginTop: 8 }}>
          <strong>RSVP by:</strong> {content.rsvp_by || '[Date]'}
        </div>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
        Please reply to: {content.rsvp_email || '[rsvp@example.com]'}
      </div>
    </div>
  )
}

export default function Step4PreviewSend({ template, wizardState, onUpdate }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [previewRecipientIndex, setPreviewRecipientIndex] = useState(0)
  const [sendMode, setSendMode] = useState('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [testMode, setTestMode] = useState(true) // Default: test mode for soft launch
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const currentRecipient = wizardState.recipients[previewRecipientIndex]

  async function handleLaunchCampaign() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const campaignData = {
        template_id: wizardState.templateId,
        org_id: profile?.org_id,
        created_by: profile?.id,
        status: sendMode === 'now' ? 'sent' : sendMode === 'schedule' ? 'scheduled' : 'draft',
        content_data: wizardState.content,
        recipient_count: wizardState.recipients.length,
        scheduled_at: sendMode === 'schedule' ? scheduledAt : null,
      }

      const { data: campaign, error: campaignErr } = await supabase
        .from('invitation_campaigns')
        .insert([campaignData])
        .select('id')
        .single()

      if (campaignErr) throw campaignErr

      if (!campaign?.id) throw new Error('Failed to create campaign')

      const recipientRows = wizardState.recipients.map((recipient) => ({
        campaign_id: campaign.id,
        recipient_email: recipient.email,
        recipient_name: recipient.name,
        custom_fields: recipient.custom_fields,
        rsvp_token: generateRsvpToken(),
        status: 'pending',
      }))

      const { error: recipientErr } = await supabase
        .from('invitation_recipients')
        .insert(recipientRows)

      if (recipientErr) throw recipientErr

      if (sendMode === 'now') {
        // Send via test mode or production
        const sendResult = await sendCampaignInvitations(campaign.id, testMode)
        setSuccess(`Campaign ${testMode ? '[TEST MODE] ' : ''}sent successfully! (${sendResult.sent} recipients)`)
      } else if (sendMode === 'schedule') {
        setSuccess(`Campaign scheduled successfully!`)
      } else {
        setSuccess(`Campaign saved as draft!`)
      }

      window.setTimeout(() => {
        navigate(`/communications/invitations/${campaign.id}`)
      }, 2000)
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  const buttonText = sendMode === 'now'
    ? (testMode ? '🧪 Test Send' : '📧 Send Invitations')
    : sendMode === 'schedule'
    ? 'Schedule Campaign'
    : 'Save Draft'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* LEFT: Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Preview</div>

          {currentRecipient && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>
                Preview for:
              </div>
              <select
                value={previewRecipientIndex}
                onChange={(e) => setPreviewRecipientIndex(Number(e.target.value))}
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  background: '#FFFFFF',
                }}
              >
                {wizardState.recipients.map((recipient, idx) => (
                  <option key={idx} value={idx}>
                    {recipient.name} ({recipient.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <ClassicEnvelope recipient={currentRecipient} content={wizardState.content} />

          <button
            type="button"
            onClick={() => {
              const previewHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                  <title>Invitation Preview</title>
                  <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; background: #F4F1EA; }
                    .envelope { background: #FFFFFF; border: 1px solid #EDE8DC; border-radius: 8px; padding: 24px; max-width: 600px; margin: 0 auto; }
                    .greeting { font-size: 13px; color: #9E9488; text-transform: uppercase; letter-spacing: 0.1em; }
                    .invite-text { font-size: 16px; font-weight: 700; color: #2D2A22; line-height: 1.6; }
                    .event-name { font-size: 20px; font-weight: 800; color: #4C2A92; line-height: 1.4; margin-top: 16px; }
                    .details { font-size: 13px; color: #2D2A22; line-height: 1.6; margin-top: 16px; }
                    .details div { margin-bottom: 8px; }
                    .footer { font-size: 12px; color: #9E9488; margin-top: 20px; padding-top: 16px; border-top: 1px solid #EDE8DC; }
                  </style>
                </head>
                <body>
                  <div class="envelope">
                    <div class="greeting">Dear ${currentRecipient?.name || '[Recipient Name]'},</div>
                    <div class="invite-text">You are cordially invited to</div>
                    <div class="event-name">${wizardState.content.event_name || '[Event Name]'}</div>
                    <div class="details">
                      <div><strong>Date:</strong> ${wizardState.content.date || '[Date]'}</div>
                      <div><strong>Time:</strong> ${wizardState.content.time || '[Time]'}</div>
                      <div><strong>Location:</strong> ${wizardState.content.venue || '[Location]'}</div>
                      <div><strong>RSVP by:</strong> ${wizardState.content.rsvp_by || '[Date]'}</div>
                    </div>
                    <div class="footer">Please reply to: ${wizardState.content.rsvp_email || '[rsvp@example.com]'}</div>
                  </div>
                </body>
                </html>
              `
              const preview = window.open('', '_blank')
              preview.document.write(previewHtml)
              preview.document.close()
            }}
            style={{
              border: `1px solid ${BORDER}`,
              background: '#FFFFFF',
              color: PRIMARY,
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Open in New Tab
          </button>
        </div>

        {/* RIGHT: Send Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Send Options</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Send Now */}
            <button
              type="button"
              onClick={() => setSendMode('now')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: 14,
                border: `2px solid ${sendMode === 'now' ? PRIMARY : BORDER}`,
                borderRadius: 10,
                background: sendMode === 'now' ? '#EDE8F8' : '#FFFFFF',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Send size={20} style={{ flexShrink: 0, color: PRIMARY, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Send Now</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  Recipients will receive invitations immediately
                </div>
              </div>
            </button>

            {/* Schedule */}
            <button
              type="button"
              onClick={() => setSendMode('schedule')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: 14,
                border: `2px solid ${sendMode === 'schedule' ? PRIMARY : BORDER}`,
                borderRadius: 10,
                background: sendMode === 'schedule' ? '#EDE8F8' : '#FFFFFF',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Calendar size={20} style={{ flexShrink: 0, color: PRIMARY, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Schedule</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  Choose date and time
                </div>
              </div>
            </button>

            {/* Save Draft */}
            <button
              type="button"
              onClick={() => setSendMode('draft')}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: 14,
                border: `2px solid ${sendMode === 'draft' ? PRIMARY : BORDER}`,
                borderRadius: 10,
                background: sendMode === 'draft' ? '#EDE8F8' : '#FFFFFF',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Bookmark size={20} style={{ flexShrink: 0, color: PRIMARY, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Save Draft</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  Save campaign to send later
                </div>
              </div>
            </button>
          </div>

          {sendMode === 'schedule' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>
                Schedule date & time
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                style={{
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Test Mode Toggle (only show if sendMode is 'now') */}
          {sendMode === 'now' && (
            <div style={{
              background: testMode ? '#fff3cd' : '#f0f8ff',
              padding: '12px 14px',
              borderRadius: '6px',
              border: `1px solid ${testMode ? '#ffc107' : '#87ceeb'}`,
              marginTop: 8
            }}>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(e) => setTestMode(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 500, fontSize: 13, color: TEXT }}>
                  {testMode ? '🧪 Test Mode (No Emails)' : '📧 Production Mode (Send Real Emails)'}
                </span>
              </label>
              <p style={{
                margin: '6px 0 0 0',
                fontSize: '11px',
                color: testMode ? '#856404' : '#00008B',
                lineHeight: 1.4
              }}>
                {testMode
                  ? 'Recipients will be marked as "sent" but no emails will be sent. Perfect for testing!'
                  : 'Real emails will be sent via Resend. Make sure all recipients are correct!'}
              </p>
            </div>
          )}

          {/* Summary */}
          <div style={{ background: BG, borderRadius: 10, padding: '12px 14px', marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
              Summary
            </div>
            <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.6 }}>
              <div>
                <span style={{ color: MUTED }}>Template:</span> <strong>{template?.name}</strong>
              </div>
              <div>
                <span style={{ color: MUTED }}>Recipients:</span> <strong>{wizardState.recipients.length}</strong>
              </div>
              <div>
                <span style={{ color: MUTED }}>Mode:</span> <strong>{sendMode === 'now' ? 'Send immediately' : sendMode === 'schedule' ? 'Scheduled' : 'Draft'}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#FEF0ED',
            border: `1px solid #F5C4B8`,
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 13,
            color: '#C94830',
          }}
        >
          Error: {error}
        </div>
      )}

      {success && (
        <div
          style={{
            background: '#EBF7F1',
            border: `1px solid #A7DDBA`,
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 13,
            color: '#1B5E3C',
          }}
        >
          {success}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          type="button"
          onClick={handleLaunchCampaign}
          disabled={saving || (sendMode === 'schedule' && !scheduledAt)}
          style={{
            background: PRIMARY,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 8,
            padding: '9px 20px',
            fontSize: 13,
            fontWeight: 700,
            cursor: saving || (sendMode === 'schedule' && !scheduledAt) ? 'not-allowed' : 'pointer',
            opacity: saving || (sendMode === 'schedule' && !scheduledAt) ? 0.6 : 1,
          }}
        >
          {saving ? 'Processing...' : buttonText}
        </button>
      </div>
    </div>
  )
}
