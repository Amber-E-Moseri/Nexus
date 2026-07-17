import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

import { corsOptionsResponse, jsonResponse } from '../_shared/cors.ts'

interface Recipient {
  name: string
  email: string
  subgroup?: string
  leadership_category?: string
}

interface CampaignRow {
  id: string
  name: string
  subject: string
  preview_text: string | null
  body: string
  body_html: string | null
  body_text: string | null
  from_name: string | null
  reply_to_email: string | null
  segment_id: string | null
  recipient_filters: RecipientPill[] | null
  status: string
  attachments: CampaignAttachment[] | null
}

interface RecipientPill {
  id?: string
  type: string
  email?: string
  name?: string
  deptId?: string
  subgroup?: string
  category?: string
  entries?: Array<{ email: string; name?: string }>
}

interface CampaignAttachment {
  filename: string
  storage_path: string
  size: number
  mime_type: string
  public_url: string | null
}

interface RequestBody {
  to?: Recipient[]
  subject?: string
  body?: string
  body_html?: string
  body_text?: string
  preview_text?: string
  reply_to?: string
  campaign_id?: string
  context?: { space_name?: string; sender_name?: string }
  test_email?: string
}

function normalizeEmail(email = ''): string {
  return email.trim().toLowerCase()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// Generate a cryptographically random 32-byte token (64-char hex)
function generateRandomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Hash a token using SHA-256 (for storage)
async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function stripHtmlToText(html = ''): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function sanitizeEmailHtml(html = ''): string {
  let safe = html
  safe = safe.replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  safe = safe.replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link)\b[^>]*\/?\s*>/gi, '')
  safe = safe.replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  safe = safe.replace(/\sstyle=(?:"[^"]*"|'[^']*')/gi, '')
  safe = safe.replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1="#"')
  return safe
}


async function resolveAllTags(
  template: string,
  recipient: Recipient,
  context: { space_name?: string; sender_name?: string },
  supabase: ReturnType<typeof createClient>,
  unsubscribeToken: string,
): Promise<string> {
  let pastorName = 'your subgroup pastor'

  if (recipient.email) {
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('email', recipient.email)
      .single()

    if (userRow?.id) {
      const { data: pastorMember } = await supabase
        .from('pastor_members')
        .select('pastor:users!pastor_id(name)')
        .eq('member_id', userRow.id)
        .single()

      if (pastorMember?.pastor?.name) pastorName = pastorMember.pastor.name
    }
  }

  const today = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? ''
  const unsubUrl = `${frontendUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`

  return template
    .replace(/\{\{name\}\}/g, recipient.name ?? '')
    .replace(/\{\{subgroup\}\}/g, recipient.subgroup ?? '')
    .replace(/\{\{leadership_category\}\}/g, recipient.leadership_category ?? '')
    .replace(/\{\{space_name\}\}/g, context.space_name ?? '')
    .replace(/\{\{pastor_name\}\}/g, pastorName)
    .replace(/\{\{sender_name\}\}/g, context.sender_name ?? 'BLW CAN NEXUS Team')
    .replace(/\{\{org_name\}\}/g, 'BLW CAN NEXUS')
    .replace(/\{\{date_today\}\}/g, today)
    .replace(/\{\{unsubscribe_link\}\}/g, unsubUrl)
    .replace(/\{\{meeting_label\}\}/g, context.space_name ?? '')
    .replace(/\{\{next_date\}\}/g, '')
    .replace(/\{\{recap\}\}/g, '')
}

function renderHtmlShell(bodyHtml: string, previewText: string, unsubscribeToken: string) {
  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? ''
  const unsubUrl = `${frontendUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
  const safePreview = escapeHtml(previewText || ' ')

  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${safePreview}
    </div>
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
      <div style="padding:28px 24px 16px;border-bottom:1px solid #EDE8DC;">
        <div style="font-size:20px;font-weight:700;color:#4C2A92;">BLW CAN NEXUS</div>
        <div style="margin-top:4px;font-size:12px;color:#9E9488;">Sent via BLW CAN NEXUS</div>
      </div>
      <div style="padding:24px;color:#2D2A22;line-height:1.7;font-size:14px;">
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #EDE8DC;font-size:11px;color:#9E9488;text-align:center;">
        BLW CAN NEXUS |
        <a href="${unsubUrl}" style="color:#9E9488;text-decoration:underline;">Unsubscribe</a>
      </div>
    </div>
  `
}

function validateSubject(subject: string): string | null {
  const s = subject.trim()
  if (s.length < 3) return 'Subject must be at least 3 characters.'
  if (s.length > 78) return 'Subject must be 78 characters or fewer.'
  if (/\b[A-Z]{4,}\b/.test(s)) return 'Subject contains ALL CAPS words which may trigger spam filters.'
  if (/[!?]{3,}/.test(s)) return 'Subject contains excessive punctuation (!!!, ???) which triggers spam filters.'
  return null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function rewriteLinksForTracking(html: string, campaignId: string, recipientEmail: string, frontendUrl: string): string {
  const trackingBaseUrl = `${frontendUrl}/track-click`
  return html.replace(/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, before, url, after) => {
    try {
      const encodedUrl = encodeURIComponent(url)
      const trackingUrl = `${trackingBaseUrl}?url=${encodedUrl}&campaign=${encodeURIComponent(campaignId)}&email=${encodeURIComponent(recipientEmail)}`
      return `<a ${before}href="${trackingUrl}"${after}>`
    } catch {
      return match
    }
  })
}

function resolveFromPills(pills: RecipientPill[] = [], data: ReturnType<typeof buildRecipientData>) {
  const resolved = new Map<string, Recipient>()

  function add(person: Record<string, string | null | undefined>) {
    const email = normalizeEmail(String(person.email ?? ''))
    if (!email) return
    resolved.set(email, {
      name: String(person.name ?? person.full_name ?? person.email ?? email),
      email: String(person.email ?? email),
      subgroup: String(person.subgroup ?? ''),
      leadership_category: String(person.leadership_category ?? ''),
    })
  }

  for (const pill of pills) {
    if (pill.type === 'individual') {
      add(pill)
    }

    if (pill.type === 'department') {
      for (const user of data.deptMembers[pill.deptId ?? ''] ?? []) add(user)
    }

    if (pill.type === 'subgroup') {
      for (const person of data.subgroupMembers[pill.subgroup ?? ''] ?? []) add(person)
    }

    if (pill.type === 'category') {
      for (const person of data.categoryMembers[pill.category ?? ''] ?? []) add(person)
    }

    if (pill.type === 'all_roster') {
      for (const person of data.rosterWithEmail) add(person)
    }

    if (pill.type === 'csv_import') {
      for (const entry of pill.entries ?? []) add(entry)
    }
  }

  return Array.from(resolved.values())
}

function buildRecipientData({
  users = [],
  roster = [],
  contacts = [],
  contactCategoryLinks = [],
}: {
  users?: Array<Record<string, string | null>>
  roster?: Array<Record<string, string | null>>
  contacts?: Array<Record<string, string | null>>
  contactCategoryLinks?: Array<{ contact_id: string; category_id: string }>
}) {
  const deptMembers: Record<string, Array<Record<string, string | null>>> = {}
  const subgroupMembers: Record<string, Array<Record<string, string | null>>> = {}
  const categoryMembers: Record<string, Array<Record<string, string | null>>> = {}

  for (const user of users) {
    if (user.department_id) {
      deptMembers[user.department_id] = [...(deptMembers[user.department_id] ?? []), user]
    }
    if (user.role) {
      const key = `role:${user.role}`
      categoryMembers[key] = [...(categoryMembers[key] ?? []), user]
    }
  }

  for (const person of roster) {
    if (person.subgroup) {
      subgroupMembers[person.subgroup] = [...(subgroupMembers[person.subgroup] ?? []), person]
    }
    if (person.leadership_category) {
      const key = `leadership:${person.leadership_category}`
      categoryMembers[key] = [...(categoryMembers[key] ?? []), person]
    }
  }

  const contactsById = new Map(contacts.map((contact) => [contact.id ?? '', contact]))
  for (const link of contactCategoryLinks) {
    const contact = contactsById.get(link.contact_id)
    if (!contact) continue
    const key = `contact:${link.category_id}`
    categoryMembers[key] = [...(categoryMembers[key] ?? []), contact]
  }

  return {
    deptMembers,
    subgroupMembers,
    categoryMembers,
    rosterWithEmail: roster.filter((person) => person.email),
  }
}

async function fetchCampaignRecipients(campaign: CampaignRow, supabase: ReturnType<typeof createClient>) {
  if (Array.isArray(campaign.recipient_filters) && campaign.recipient_filters.length > 0) {
    const [usersRes, rosterRes, contactsRes, linksRes] = await Promise.all([
      supabase.from('users').select('id, name, email, role, department_id'),
      supabase.from('expected_attendees').select('id, full_name, email, subgroup, leadership_category').eq('active', true),
      supabase.from('communication_contacts').select('id, full_name, email'),
      supabase.from('communication_contact_categories').select('contact_id, category_id'),
    ])

    return resolveFromPills(
      campaign.recipient_filters ?? [],
      buildRecipientData({
        users: usersRes.data ?? [],
        roster: rosterRes.data ?? [],
        contacts: contactsRes.data ?? [],
        contactCategoryLinks: linksRes.data ?? [],
      }),
    )
  }

  if (!campaign.segment_id) return []

  const { data: segment } = await supabase
    .from('communication_segments')
    .select('filters')
    .eq('id', campaign.segment_id)
    .single()

  const pills: RecipientPill[] = []
  const filters = segment?.filters ?? {}

  if (filters.include_roster) {
    pills.push({ id: 'all_roster', type: 'all_roster' })
  }

  for (const departmentId of filters.departments ?? []) {
    pills.push({ id: `department:${departmentId}`, type: 'department', deptId: departmentId })
  }

  for (const subgroup of filters.subgroups ?? []) {
    pills.push({ id: `subgroup:${subgroup}`, type: 'subgroup', subgroup })
  }

  for (const category of filters.categories ?? []) {
    pills.push({ id: `category:leadership:${category}`, type: 'category', category: `leadership:${category}` })
  }

  for (const role of filters.roles ?? []) {
    pills.push({ id: `category:role:${role}`, type: 'category', category: `role:${role}` })
  }

  const [usersRes, rosterRes] = await Promise.all([
    supabase.from('users').select('id, name, email, role, department_id'),
    supabase.from('expected_attendees').select('id, full_name, email, subgroup, leadership_category').eq('active', true),
  ])

  return resolveFromPills(
    pills,
    buildRecipientData({
      users: usersRes.data ?? [],
      roster: rosterRes.data ?? [],
    }),
  )
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return corsOptionsResponse(request)
  }

  const respond = (status: number, body: Record<string, unknown>) =>
    jsonResponse(status, body, undefined, request)

  if (request.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' })
  }

  const fromEmail = Deno.env.get('FROM_EMAIL')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  if (!fromEmail || !supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return respond(500, { error: 'Missing required environment variables' })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return respond(401, { error: 'Missing authorization header' })

  const requestBody = (await request.json().catch(() => null)) as RequestBody | null
  if (!requestBody) return respond(400, { error: 'Invalid JSON body' })

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim()
  const isInternalServiceCall = bearerToken === serviceRoleKey

  let callerUserId: string | null = null
  let callerEmail: string | null = null
  let senderSignature: string | null = null
  let senderProfile: { name?: string; role?: string } | null = null

  if (!isInternalServiceCall) {
    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: authData, error: authError } = await authClient.auth.getUser()
    if (authError || !authData.user) return respond(401, { error: 'Unable to validate caller' })

    const { data: profile } = await supabase
      .from('users')
      .select('id, email, role, name')
      .eq('id', authData.user.id)
      .single()

    if (!profile || !['super_admin', 'dept_lead'].includes(profile.role ?? '')) {
      return respond(403, { error: 'You do not have permission to send campaigns.' })
    }

    callerUserId = profile.id
    callerEmail = profile.email ?? authData.user.email ?? null
    senderProfile = { name: profile.name, role: profile.role }

    // Fetch the sender's email signature
    const { data: sigData } = await supabase
      .from('email_signatures')
      .select('signature_html')
      .eq('user_id', authData.user.id)
      .eq('is_default', true)
      .maybeSingle()

    senderSignature = sigData?.signature_html ?? null
  }

  let {
    to = [],
    subject = '',
    body = '',
    body_html: bodyHtml = '',
    body_text: bodyText = '',
    preview_text: previewText = '',
    reply_to: replyTo,
    campaign_id: campaignId,
    context = {},
    test_email: testEmail,
  } = requestBody

  let campaignAttachments: CampaignAttachment[] | null = null

  if (campaignId) {
    const { data: campaign, error: campaignError } = await supabase
      .from('communication_campaigns')
      .select('id, name, subject, preview_text, body, body_html, body_text, from_name, reply_to_email, segment_id, recipient_filters, status, attachments')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return respond(404, { error: 'Campaign not found.' })
    }

    const typedCampaign = campaign as CampaignRow
    subject = subject || typedCampaign.subject
    body = body || typedCampaign.body || typedCampaign.body_text || ''
    bodyHtml = bodyHtml || typedCampaign.body_html || typedCampaign.body || ''
    bodyText = bodyText || typedCampaign.body_text || typedCampaign.body || stripHtmlToText(bodyHtml)
    previewText = previewText || typedCampaign.preview_text || ''
    replyTo = replyTo || typedCampaign.reply_to_email || callerEmail || undefined
    to = to.length > 0 ? to : await fetchCampaignRecipients(typedCampaign, supabase)
    campaignAttachments = typedCampaign.attachments ?? null
  }

  if (testEmail?.trim()) {
    to = [{ name: 'Test Recipient', email: testEmail.trim() }]
  }

  if (!Array.isArray(to) || to.length === 0) {
    return respond(400, { error: 'No recipients resolved for this send.' })
  }

  if (to.some((recipient) => !recipient?.email || recipient.email.trim() === '')) {
    return respond(400, { error: 'Every recipient must have a non-empty email.' })
  }

  if (!subject.trim()) return respond(400, { error: 'subject must be non-empty' })
  if (!bodyHtml.trim() && !bodyText.trim() && !body.trim()) {
    return respond(400, { error: 'body must be non-empty' })
  }

  if (!subject.trim().startsWith('[TEST]')) {
    const subjectError = validateSubject(subject)
    if (subjectError) return respond(400, { error: subjectError })
  }

  const safeHtmlTemplate = sanitizeEmailHtml(bodyHtml || body || '')
  const plainTextTemplate = bodyText || body || stripHtmlToText(safeHtmlTemplate)

  const emailList = to.map((recipient) => normalizeEmail(recipient.email))
  const [unsubscribesRes, bouncesRes] = await Promise.all([
    supabase.from('communication_unsubscribes').select('email').in('email', emailList),
    supabase.from('email_bounces').select('email').eq('suppressed', true).in('email', emailList),
  ])

  const unsubscribed = new Set((unsubscribesRes.data ?? []).map((row: { email: string }) => normalizeEmail(row.email)))
  const bounced = new Set((bouncesRes.data ?? []).map((row: { email: string }) => normalizeEmail(row.email)))
  const filteredRecipients = to.filter((recipient) => {
    const normalized = normalizeEmail(recipient.email)
    return !unsubscribed.has(normalized) && !bounced.has(normalized)
  })
  const skippedUnsubscribed = to.length - filteredRecipients.length

  if (campaignId) {
    const skippedRows = [
      ...to
        .filter((recipient) => unsubscribed.has(normalizeEmail(recipient.email)))
        .map((recipient) => ({
          campaign_id: campaignId,
          recipient_email: recipient.email,
          recipient_name: recipient.name ?? recipient.email,
          status: 'unsubscribed' as const,
          error_message: 'Recipient unsubscribed before send.',
        })),
      ...to
        .filter((recipient) => bounced.has(normalizeEmail(recipient.email)))
        .map((recipient) => ({
          campaign_id: campaignId,
          recipient_email: recipient.email,
          recipient_name: recipient.name ?? recipient.email,
          status: 'suppressed' as const,
          error_message: 'Recipient email bounced; suppressed from send.',
        })),
    ]

    if (skippedRows.length > 0) {
      await supabase.from('communication_sends').insert(skippedRows)
    }
  }

  if (filteredRecipients.length === 0) {
    if (campaignId) {
      await supabase
        .from('communication_campaigns')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          recipient_count: to.length,
          sent_count: 0,
          failed_count: 0,
        })
        .eq('id', campaignId)
    }

    return respond(200, { sent: 0, failed: 0, errors: [], skipped_unsubscribed: skippedUnsubscribed })
  }

  // Fetch A/B test data if this is a campaign
  let abTest: { split_percent: number; subject_a: string; subject_b: string } | null = null
  if (campaignId) {
    const { data: abData } = await supabase
      .from('communication_ab_tests')
      .select('split_percent, subject_a, subject_b')
      .eq('campaign_id', campaignId)
      .maybeSingle()
    abTest = abData ?? null
  }

  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? ''

  let sent = 0
  let failed = 0
  const errors: Array<{ name: string; email: string; error: string }> = []
  const batchSize = 10

  const resendAttachments = (campaignAttachments ?? [])
    .filter((a) => a.public_url !== null)
    .map((a) => ({ filename: a.filename, path: a.public_url as string }))
  console.log(`[send-communication-email] ${resendAttachments.length} attachment(s) will be included with each send`)

  for (let batchStart = 0; batchStart < filteredRecipients.length; batchStart += batchSize) {
    const batch = filteredRecipients.slice(batchStart, batchStart + batchSize)

    const batchResults = await Promise.all(batch.map(async (recipient, batchIndex) => {
      // Generate secure random unsubscribe token
      const unsubscribeToken = generateRandomToken()
      const unsubscribeTokenHash = await hashToken(unsubscribeToken)

      // Assign A/B test variant if applicable
      let subjectVariant: 'a' | 'b' | null = null
      let personalizedSubject = subject.trim()

      if (abTest) {
        const recipientIndex = batchStart + batchIndex
        const threshold = (abTest.split_percent / 100) * filteredRecipients.length
        subjectVariant = recipientIndex < threshold ? 'b' : 'a'
        personalizedSubject = subjectVariant === 'a' ? abTest.subject_a : abTest.subject_b
      }

      personalizedSubject = await resolveAllTags(personalizedSubject, recipient, context, supabase, unsubscribeToken)
      const personalizedText = await resolveAllTags(plainTextTemplate.trim(), recipient, context, supabase, unsubscribeToken)
      let personalizedHtmlTemplate = await resolveAllTags(safeHtmlTemplate.trim(), recipient, context, supabase, unsubscribeToken)

      // Append signature if present
      if (senderSignature && senderProfile) {
        let processedSignature = senderSignature
        processedSignature = processedSignature.replace(/\{\{your_name\}\}/g, senderProfile.name ?? '')
        processedSignature = processedSignature.replace(/\{\{your_role\}\}/g, senderProfile.role ?? '')
        processedSignature = processedSignature.replace(/\{\{org_name\}\}/g, 'BLW CAN NEXUS')
        personalizedHtmlTemplate += `<hr style="border:none;border-top:1px solid #EDE8DC;margin:24px 0">${processedSignature}`
      }

      // Rewrite links for tracking if this is a campaign
      if (campaignId) {
        personalizedHtmlTemplate = rewriteLinksForTracking(personalizedHtmlTemplate, campaignId, recipient.email, frontendUrl)
      }

      const renderedHtml = renderHtmlShell(personalizedHtmlTemplate, previewText, unsubscribeToken)

      // Store the unsubscribe token in the database (upsert to handle existing records)
      const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      await supabase
        .from('communication_unsubscribes')
        .upsert(
          {
            email: normalizeEmail(recipient.email),
            unsubscribe_token: unsubscribeTokenHash,
            token_created_at: new Date().toISOString(),
            token_expires_at: tokenExpiresAt,
          },
          { onConflict: 'email' }
        )
        .then(({ error }) => {
          if (error) console.error('Failed to store unsubscribe token:', error)
        })

      const unsubUrl = `${frontendUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`

      let resendEmailId: string | null = null
      let status: 'sent' | 'failed' = 'sent'
      let errorMessage: string | null = null

      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipient.email],
            subject: personalizedSubject,
            html: renderedHtml,
            text: personalizedText,
            reply_to: replyTo || undefined,
            headers: {
              'List-Unsubscribe': `<${unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              'X-Entity-Ref-ID': campaignId ?? crypto.randomUUID(),
              Precedence: 'bulk',
            },
            attachments: resendAttachments.length ? resendAttachments : undefined,
          }),
        })

        if (!resendResponse.ok) {
          const errorText = await resendResponse.text()
          throw new Error(errorText || `Resend responded with ${resendResponse.status}`)
        }

        const resendData = await resendResponse.json()
        resendEmailId = resendData.id ?? null
      } catch (error) {
        status = 'failed'
        errorMessage = error instanceof Error ? error.message : String(error)
        errors.push({ name: recipient.name ?? '', email: recipient.email, error: errorMessage })
      }

      const logPayload = {
        report_id: null,
        recipient_name: recipient.name ?? '',
        recipient_email: recipient.email,
        subject: personalizedSubject,
        body: personalizedText,
        status,
        error_message: errorMessage,
        sent_by: callerUserId,
      }

      const { error: logError } = await supabase.from('absence_email_log').insert(logPayload)
      if (logError) console.error('Failed to write absence_email_log', logError)

      if (campaignId) {
        const { error: sendError } = await supabase.from('communication_sends').insert({
          campaign_id: campaignId,
          recipient_email: recipient.email,
          recipient_name: recipient.name ?? '',
          status,
          resend_email_id: resendEmailId,
          error_message: errorMessage,
          sent_at: status === 'sent' ? new Date().toISOString() : null,
          subject_variant: subjectVariant,
        })
        if (sendError) console.error('Failed to write communication_sends', sendError)
      }

      return status
    }))

    for (const status of batchResults) {
      if (status === 'sent') sent++
      else failed++
    }

    if (batchStart + batchSize < filteredRecipients.length) {
      await sleep(1000)
    }
  }

  if (campaignId) {
    const campaign = await supabase
      .from('communication_campaigns')
      .select('retry_count')
      .eq('id', campaignId)
      .single()

    let finalStatus = failed > 0 && filteredRecipients.length > 0 ? 'failed' : 'sent'
    let nextRetryAt = null
    let newRetryCount = campaign.data?.retry_count ?? 0

    // Determine if we should retry
    if (failed > 0 && filteredRecipients.length > 0 && newRetryCount < 3) {
      finalStatus = 'retrying'
      newRetryCount += 1

      const backoffSeconds = newRetryCount === 1 ? 60 : newRetryCount === 2 ? 300 : 1800
      nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString()
    }

    await supabase
      .from('communication_campaigns')
      .update({
        status: finalStatus,
        sent_at: finalStatus === 'sent' || finalStatus === 'failed' ? new Date().toISOString() : null,
        recipient_count: to.length,
        sent_count: sent,
        failed_count: failed,
        suppressed_count: bounced.size,
        retry_count: newRetryCount,
        next_retry_at: nextRetryAt,
        last_error_at: failed > 0 ? new Date().toISOString() : null,
      })
      .eq('id', campaignId)
  }

  return respond(200, {
    sent,
    failed,
    errors,
    skipped_unsubscribed: skippedUnsubscribed,
    skipped_bounced: bounced.size,
  })
})
