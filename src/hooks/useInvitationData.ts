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
          .select('*')
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
          .select('*')
          .eq('id', recipient.campaign_id)
          .single()

        if (campaignError) throw campaignError

        // Fetch template
        const { data: templateData, error: templateError } = await supabase
          .from('invitation_templates')
          .select('*')
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
