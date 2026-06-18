import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { mergeTokens } from '../lib/invitations/mergeTokens'
import { ResolvedInvitation, InvitationRecipient } from '../shared/types'

export function useInvitationData(token: string) {
  const [data, setData] = useState<ResolvedInvitation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // Fetch recipient by token
        const { data: recipientData, error: recipientError } = await supabase
          .from('invitation_recipients')
          .select('id, campaign_id, email, token, custom_fields, status, sent_at, opened_at, rsvp_at')
          .eq('token', token)
          .single()

        if (recipientError) {
          if (recipientError.code === 'PGRST116') {
            setData(null)
          } else {
            throw recipientError
          }
          return
        }

        const recipient = recipientData as InvitationRecipient

        // Fetch campaign
        const { data: campaignData, error: campaignError } = await supabase
          .from('invitation_campaigns')
          .select('id, org_id, template_id, name, content, status, scheduled_at, sent_at, created_at')
          .eq('id', recipient.campaign_id)
          .single()

        if (campaignError) throw campaignError

        // Fetch template
        const { data: templateData, error: templateError } = await supabase
          .from('invitation_templates')
          .select('id, org_id, name, description, occasion, theme_config, animation_config, content_slots, token_fields, email_subject, email_preview, thumbnail_url, status, version, created_at')
          .eq('id', campaignData.template_id)
          .single()

        if (templateError) throw templateError

        // Merge tokens
        const merged = mergeTokens(templateData, campaignData, recipient)

        // Update status to 'opened' if not already
        if (recipient.status === 'sent') {
          await supabase
            .from('invitation_recipients')
            .update({ status: 'opened', opened_at: new Date().toISOString() })
            .eq('id', recipient.id)
        }

        setData({
          template: templateData,
          campaign: campaignData,
          recipient,
          merged,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invitation')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [token])

  return { data, loading, error }
}
