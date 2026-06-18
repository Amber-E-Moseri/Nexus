import { InvitationTemplate, InvitationCampaign, InvitationRecipient } from '../../shared/types'

export function mergeTokens(
  template: InvitationTemplate,
  campaign: InvitationCampaign,
  recipient: InvitationRecipient
): Record<string, string> {
  const allTokens = {
    ...campaign.content,
    ...recipient.custom_fields
  }
  return allTokens
}
