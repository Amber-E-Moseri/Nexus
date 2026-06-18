export const COMMUNICATION_ROLES = ['super_admin', 'dept_lead', 'pastor', 'member']

export function normalizeEmail(email = '') {
  return email.trim().toLowerCase()
}

export function titleize(value = '') {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function slugifyLabel(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function sanitizeEmailHtml(html = '') {
  let safe = String(html ?? '')

  safe = safe.replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  safe = safe.replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link)\b[^>]*\/?\s*>/gi, '')
  safe = safe.replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  safe = safe.replace(/\sstyle=(?:"[^"]*"|'[^']*')/gi, '')
  safe = safe.replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1="#"')

  return safe
}

export function stripHtmlToText(html = '') {
  return String(html ?? '')
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

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function fillTemplateTags(template = '', recipient = {}, context = {}) {
  const merged = {
    name: recipient.name ?? '',
    subgroup: recipient.subgroup ?? '',
    leadership_category: recipient.leadership_category ?? '',
    space_name: context.space_name ?? '',
    pastor_name: context.pastor_name ?? '',
    sender_name: context.sender_name ?? 'BLW Canada Team',
    org_name: context.org_name ?? 'BLW Canada',
    date_today: context.date_today ?? new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    unsubscribe_link: context.unsubscribe_link ?? '#',
    meeting_label: context.space_name ?? '',
    next_date: context.next_date ?? '',
    recap: context.recap ?? '',
  }

  return Object.entries(merged).reduce(
    (output, [key, value]) => output.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? ''),
    String(template ?? ''),
  )
}

/**
 * Wraps every <a href="..."> in the HTML body with a click-tracking redirect URL.
 * The edge function at /functions/v1/track-click records the click then 302s to the real URL.
 *
 * Requires the `campaign_link_clicks` table (see supabase/migrations/20260617_click_bounces.sql).
 */
export function wrapLinksForTracking(html = '', campaignId = '', recipientEmail = '') {
  if (!campaignId) return html
  const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
  return String(html).replace(
    /(<a\s[^>]*href=")([^"]+)(")/gi,
    (_, open, url, close) => {
      // Don't wrap unsubscribe or mailto links
      if (url.startsWith('mailto:') || url.includes('unsubscribe') || url === '#') {
        return `${open}${url}${close}`
      }
      const tracked = `${baseUrl}/functions/v1/track-click?campaign_id=${encodeURIComponent(campaignId)}&recipient=${encodeURIComponent(recipientEmail)}&url=${encodeURIComponent(url)}`
      return `${open}${tracked}${close}`
    },
  )
}

export function extractEmailEntries(text = '') {
  const EMAIL_REGEX = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi
  const matches = String(text ?? '').match(EMAIL_REGEX) ?? []
  const seen = new Set()
  const entries = []

  for (const email of matches) {
    const normalized = normalizeEmail(email)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    entries.push({ name: normalized, email: normalized })
  }

  return entries
}

export function parseImportedContactText(text = '') {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const contacts = []
  const categories = new Set()
  const seenEmails = new Set()

  for (const line of lines) {
    const parts = line.split(',').map((part) => part.trim())
    const candidateEmails = parts.filter((part) => /\S+@\S+\.\S+/.test(part))

    if (candidateEmails.length === 0) {
      for (const entry of extractEmailEntries(line)) {
        if (seenEmails.has(entry.email)) continue
        seenEmails.add(entry.email)
        contacts.push({ full_name: entry.name, email: entry.email, categories: [] })
      }
      continue
    }

    const email = normalizeEmail(candidateEmails[0])
    if (!email || seenEmails.has(email)) continue

    const namePart = parts.find((part) => part && normalizeEmail(part) !== email) ?? email
    const categoryPart = parts.slice(2).join(',').trim()
    const rowCategories = categoryPart
      ? categoryPart.split('|').map((value) => value.trim()).filter(Boolean)
      : []

    rowCategories.forEach((category) => categories.add(category))
    seenEmails.add(email)
    contacts.push({
      full_name: namePart,
      email,
      categories: rowCategories,
    })
  }

  return { contacts, categories: Array.from(categories) }
}

export function buildCommunicationRecipientData({
  depts = [],
  roster = [],
  users = [],
  contacts = [],
  categories = [],
  contactCategoryLinks = [],
} = {}) {
  const deptMembers = users.reduce((acc, user) => {
    if (!user.department_id) return acc
    acc[user.department_id] = [...(acc[user.department_id] ?? []), user]
    return acc
  }, {})

  const subgroupMembers = roster.reduce((acc, person) => {
    const subgroup = person.subgroup?.trim()
    if (!subgroup) return acc
    acc[subgroup] = [...(acc[subgroup] ?? []), person]
    return acc
  }, {})

  const categoryMembers = {}

  for (const user of users) {
    if (!user.role) continue
    const key = `role:${user.role}`
    categoryMembers[key] = [...(categoryMembers[key] ?? []), user]
  }

  for (const person of roster) {
    const leadershipCategory = person.leadership_category?.trim()
    if (!leadershipCategory) continue
    const key = `leadership:${leadershipCategory}`
    categoryMembers[key] = [...(categoryMembers[key] ?? []), person]
  }

  const contactById = new Map(contacts.map((contact) => [contact.id, contact]))
  for (const link of contactCategoryLinks) {
    const categoryId = link.category_id
    const contact = contactById.get(link.contact_id)
    if (!categoryId || !contact) continue
    const key = `contact:${categoryId}`
    categoryMembers[key] = [...(categoryMembers[key] ?? []), contact]
  }

  const rosterWithEmail = roster.filter((person) => person.email?.trim())
  const contactsWithEmail = contacts.filter((contact) => contact.email?.trim())

  return {
    depts,
    roster,
    users,
    contacts,
    categories,
    deptMembers,
    subgroupMembers,
    categoryMembers,
    rosterWithEmail,
    contactsWithEmail,
  }
}

export function segmentFiltersToRecipientPills(filters = {}) {
  const pills = []

  if (filters.include_roster) {
    pills.push({
      id: 'all_roster',
      type: 'all_roster',
      label: 'Everyone on roster with email',
    })
  }

  for (const departmentId of filters.departments ?? []) {
    pills.push({
      id: `department:${departmentId}`,
      type: 'department',
      deptId: departmentId,
      label: 'Department',
    })
  }

  for (const subgroup of filters.subgroups ?? []) {
    pills.push({
      id: `subgroup:${subgroup}`,
      type: 'subgroup',
      subgroup,
      label: `Subgroup: ${subgroup}`,
    })
  }

  for (const category of filters.categories ?? []) {
    pills.push({
      id: `category:leadership:${category}`,
      type: 'category',
      category: `leadership:${category}`,
      label: category,
    })
  }

  for (const role of filters.roles ?? []) {
    pills.push({
      id: `category:role:${role}`,
      type: 'category',
      category: `role:${role}`,
      label: `All ${titleize(role)}s`,
    })
  }

  return pills
}

export function getRecipientPillKey(pill) {
  return pill.id ?? `${pill.type}:${pill.email ?? pill.deptId ?? pill.subgroup ?? pill.category ?? pill.label}`
}

export function addUniqueRecipientPills(existing = [], incoming = []) {
  const seen = new Set(existing.map(getRecipientPillKey))
  const next = [...existing]

  for (const pill of incoming) {
    const key = getRecipientPillKey(pill)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(pill)
  }

  return next
}

export function resolveRecipientPills(pills = [], allData = {}) {
  const resolved = new Map()

  function addRecipient(person, fallbackNameField = 'name') {
    const email = normalizeEmail(person?.email)
    if (!email) return
    resolved.set(email, {
      name: person.name ?? person.full_name ?? person[fallbackNameField] ?? person.email,
      email: person.email,
      subgroup: person.subgroup ?? '',
      leadership_category: person.leadership_category ?? '',
    })
  }

  for (const pill of pills) {
    if (pill.type === 'individual') {
      addRecipient(pill)
    }

    if (pill.type === 'department') {
      for (const user of allData.deptMembers?.[pill.deptId] ?? []) {
        addRecipient(user)
      }
    }

    if (pill.type === 'subgroup') {
      for (const person of allData.subgroupMembers?.[pill.subgroup] ?? []) {
        addRecipient(person, 'full_name')
      }
    }

    if (pill.type === 'category') {
      for (const person of allData.categoryMembers?.[pill.category] ?? []) {
        addRecipient(person, 'full_name')
      }
    }

    if (pill.type === 'all_roster') {
      for (const person of allData.rosterWithEmail ?? []) {
        addRecipient(person, 'full_name')
      }
    }

    if (pill.type === 'csv_import') {
      for (const entry of pill.entries ?? []) {
        addRecipient(entry)
      }
    }
  }

  return Array.from(resolved.values())
}

export async function loadCommunicationSources(supabase) {
  const [deptsRes, rosterRes, usersRes, contactsRes, categoriesRes, linksRes] = await Promise.all([
    supabase.from('departments').select('id, name, color').order('name'),
    supabase
      .from('expected_attendees')
      .select('id, full_name, email, subgroup, leadership_category, active')
      .eq('active', true)
      .order('full_name'),
    supabase
      .from('users')
      .select('id, name, email, role, department_id')
      .order('name'),
    supabase
      .from('communication_contacts')
      .select('id, full_name, email, notes, source')
      .order('full_name'),
    supabase
      .from('communication_categories')
      .select('id, name, color')
      .order('name'),
    supabase
      .from('communication_contact_categories')
      .select('contact_id, category_id'),
  ])

  return buildCommunicationRecipientData({
    depts: deptsRes.data ?? [],
    roster: rosterRes.data ?? [],
    users: usersRes.data ?? [],
    contacts: contactsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    contactCategoryLinks: linksRes.data ?? [],
  })
}

export async function getEmailTemplates(supabase, filters = {}) {
  const { category = null, isSystem = null } = filters
  let query = supabase.from('communication_email_templates').select('id, name, category, is_system, html_content, subject, created_at, updated_at').order('name')

  if (category) query = query.eq('category', category)
  if (isSystem !== null) query = query.eq('is_system', isSystem)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getEmailTemplate(supabase, id) {
  const { data, error } = await supabase
    .from('communication_email_templates')
    .select('id, name, category, is_system, html_content, subject, created_at, updated_at')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createEmailTemplate(supabase, payload) {
  const { data, error } = await supabase
    .from('communication_email_templates')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEmailTemplate(supabase, id, updates) {
  const { data, error } = await supabase
    .from('communication_email_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEmailTemplate(supabase, id) {
  const { error } = await supabase
    .from('communication_email_templates')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export function applyTemplateVariables(htmlContent = '', variables = {}) {
  let result = String(htmlContent ?? '')
  const vars = variables ?? {}

  result = result.replace(/\{\{headerBg\}\}/g, vars.headerBg ?? '#4C2A92')
  result = result.replace(/\{\{accentColor\}\}/g, vars.accentColor ?? '#E8A020')
  result = result.replace(/\{\{footerText\}\}/g, vars.footerText ?? 'BLW Canada')

  return result
}

export async function getABTestResults(supabase, campaignId) {
  const { data: abTest, error: abError } = await supabase
    .from('communication_ab_tests')
    .select('id, campaign_id, subject_variant_a, subject_variant_b, created_at, updated_at')
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (abError || !abTest) return null

  const { data: sendsData } = await supabase
    .from('communication_sends')
    .select('subject_variant, status')
    .eq('campaign_id', campaignId)

  const sends = sendsData ?? []
  const sentA = sends.filter((s) => s.subject_variant === 'a').length
  const sentB = sends.filter((s) => s.subject_variant === 'b').length
  const openedA = sends.filter((s) => s.subject_variant === 'a' && s.status === 'opened').length
  const openedB = sends.filter((s) => s.subject_variant === 'b' && s.status === 'opened').length

  return {
    ...abTest,
    sent_a: sentA,
    sent_b: sentB,
    opened_a: openedA,
    opened_b: openedB,
    rate_a: sentA > 0 ? (openedA / sentA) : 0,
    rate_b: sentB > 0 ? (openedB / sentB) : 0,
  }
}

export async function getClickTrackingData(supabase, campaignId) {
  const { data: clicks, error } = await supabase
    .from('campaign_link_clicks')
    .select('id, campaign_id, link_url, click_count, clicked_at, created_at')
    .eq('campaign_id', campaignId)
    .order('clicked_at', { ascending: false })

  if (error) return []

  const topLinks = {}
  (clicks ?? []).forEach((click) => {
    const url = click.link_url
    topLinks[url] = (topLinks[url] ?? 0) + (click.click_count ?? 1)
  })

  return Object.entries(topLinks)
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count)
}

export async function getClickTimeline(supabase, campaignId) {
  const { data: clicks } = await supabase
    .from('campaign_link_clicks')
    .select('clicked_at')
    .eq('campaign_id', campaignId)

  if (!clicks) return {}

  const timeline = {}
  clicks.forEach((click) => {
    const date = new Date(click.clicked_at)
    const hour = date.toISOString().slice(0, 13) + ':00:00'
    timeline[hour] = (timeline[hour] ?? 0) + 1
  })

  return timeline
}

export async function getSuppressionList(supabase, search = '', limit = 50, offset = 0) {
  const { data, error } = await supabase.rpc('get_suppression_list', {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    console.error('Failed to fetch suppression list:', error)
    return []
  }

  return data ?? []
}

export async function getBounceMetrics(supabase) {
  const { data, error } = await supabase.rpc('get_bounce_metrics')

  if (error) {
    console.error('Failed to fetch bounce metrics:', error)
    return {
      total_bounced: 0,
      hard_bounces: 0,
      soft_bounces: 0,
      suppressed_count: 0,
    }
  }

  return data?.[0] ?? {
    total_bounced: 0,
    hard_bounces: 0,
    soft_bounces: 0,
    suppressed_count: 0,
  }
}

export async function unsuppressEmail(supabase, email) {
  const { data, error } = await supabase.rpc('unsuppress_email', {
    p_email: email,
  })

  if (error) {
    console.error('Failed to unsuppress email:', error)
    return { success: false, error: error.message }
  }

  return data ?? { success: false }
}

export async function unsuppressAll(supabase) {
  const { data, error } = await supabase.rpc('unsuppress_all')

  if (error) {
    console.error('Failed to unsuppress all:', error)
    return { success: false, error: error.message }
  }

  return data ?? { success: false }
}

export async function getScheduledCampaigns(supabase) {
  const { data, error } = await supabase
    .from('communication_campaigns')
    .select('id, name, subject, scheduled_at, status, recipient_count')
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch scheduled campaigns:', error)
    return []
  }

  return data ?? []
}

export async function getFailedCampaigns(supabase) {
  const { data, error } = await supabase
    .from('communication_campaigns')
    .select('id, name, subject, status, retry_count, next_retry_at, last_error_at, recipient_count, failed_count')
    .in('status', ['failed', 'retrying'])
    .order('last_error_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch failed campaigns:', error)
    return []
  }

  return data ?? []
}

export async function retryCampaign(supabase, campaignId) {
  const { data, error } = await supabase.rpc('retry_failed_campaign', {
    p_campaign_id: campaignId,
  })

  if (error) {
    console.error('Failed to retry campaign:', error)
    return { success: false, error: error.message }
  }

  return data ?? { success: false }
}

export async function updateCampaignSchedule(supabase, campaignId, scheduledAt) {
  const { error } = await supabase
    .from('communication_campaigns')
    .update({
      scheduled_at: scheduledAt,
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)

  if (error) {
    console.error('Failed to schedule campaign:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function cancelScheduledCampaign(supabase, campaignId) {
  const { error } = await supabase
    .from('communication_campaigns')
    .update({
      scheduled_at: null,
      status: 'draft',
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)

  if (error) {
    console.error('Failed to cancel scheduled campaign:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}
