export interface ThemeConfig {
  palette: {
    envelope_body: string
    envelope_flap: string
    seal: string
    card_bg: string
    accent: string
    text_primary: string
    text_secondary: string
  }
  fonts: { display: string; body: string; accent: string }
  layout_variant: string
}

export interface AnimationConfig {
  envelope_style: 'classic' | 'scroll' | 'book' | 'letter'
  flap_animation: string
  card_reveal: string
  particles: 'confetti' | 'stars' | 'petals' | 'none'
  particle_colors: string[]
  seal_icon: string
  ambient: string
}

export interface TokenField {
  key: string
  label: string
  required: boolean
}

export interface InvitationTemplate {
  id: string
  org_id: string
  name: string
  description?: string
  occasion: 'graduation' | 'wedding' | 'birthday' | 'corporate' | 'custom'
  theme_config: ThemeConfig
  animation_config: AnimationConfig
  content_slots: Record<string, string>
  token_fields: TokenField[]
  email_subject?: string
  email_preview?: string
  thumbnail_url?: string
  status: 'draft' | 'active' | 'archived'
  version: number
  created_at: string
}

export interface InvitationCampaign {
  id: string
  org_id: string
  template_id: string
  template?: InvitationTemplate
  name: string
  content: Record<string, string>
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused'
  scheduled_at?: string
  sent_at?: string
  created_at: string
}

export interface InvitationRecipient {
  id: string
  campaign_id: string
  email: string
  token: string
  custom_fields: Record<string, string>
  status: 'pending' | 'sent' | 'opened' | 'rsvp_yes' | 'rsvp_no'
  sent_at?: string
  opened_at?: string
  rsvp_at?: string
}

export interface ResolvedInvitation {
  template: InvitationTemplate
  campaign: InvitationCampaign
  recipient: InvitationRecipient
  merged: Record<string, string>
}
