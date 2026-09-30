/**
 * cmp-documentation-sync
 *
 * Fetches CMP documentation form submissions and applies them to ICPLC
 * participants with identity reconciliation, override protection, and
 * comprehensive failure classification.
 *
 * Auth: Service role bearer token required
 * Method: POST { action: 'preview' | 'apply' | 'add_unmatched', event_id: uuid, submission_ids?: string[] }
 *
 * add_unmatched: staff-chosen unmatched submissions are added to the Working List as
 * NOT-registered participants (registration_status 'not_registered', participation 'tracking'),
 * then their documentation is applied through the normal override-protected path.
 *
 * Response includes classification counts and individual submission results.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DOCUMENTATION_FORM_URL =
  Deno.env.get('CMP_DOCUMENTATION_FORM_URL')
  || 'https://leaders.lwcanada.org/api/forms/cmuj6atvq01v5rhwzjsu4xzgj/submissions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Field ID constants (must match discovery output exactly)
const FIELD_IDS = {
  email: 'email_hfrr',
  firstName: 'first_name_3t0m',
  lastName: 'last_name_4fjk',
  phone: 'phone_number_z74r',
  passportStatus: 'do_you_currently_have_a_valid_pa_tmoi',
  passportRegion: 'what_country_issued_your_passpor_r7rv',
  canadianStatus: 'what_is_your_current_status_in_c_65cl',
  canadianDocValidity: 'will_your_current_canadian_immig_wt9e',
  assistanceRequested: 'would_you_like_assistance_from_t_a8nq',
}

// Explicit allowlists (with type index signatures)
const passportStatusMap: Record<string, string> = {
  'I have a valid passport': 'ready',
  'I do not currently have a valid passport': 'no_passport',
  'My passport application or renewal is in progress': 'renewal_in_progress',
}

const canadianStatusMap: Record<string, string> = {
  'Canadian Citizen': 'CANADIAN_CITIZEN',
  'Permanent Resident': 'PERMANENT_RESIDENT',
  'International Student / Study Permit Holder': 'INTERNATIONAL_STUDENT',
  'Post-Graduation Work Permit Holder': 'POST_GRADUATION_WORKER',
  'Visitor': 'VISITOR_OTHER',
}

// "Will your Canadian documents remain valid through the required period?" is self-reported triage evidence.
// It is only recognised here (to flag unexpected values) and kept raw in source_values; it is never converted
// into a document status, because "No" means "staff should review", not "a renewal is needed".
const docValidityAnswers = new Set(['yes', 'no'])

const assistanceMap: Record<string, boolean> = { yes: true, no: false }

const passportRegionMap: Record<string, string> = {
  'ecowas': 'ECOWAS',
  'non-ecowas': 'NON_ECOWAS',
  'non ecowas': 'NON_ECOWAS',
  'non_ecowas': 'NON_ECOWAS',
}

function normalizeEmail(email: string): string | null {
  if (!email) return null
  const normalized = email.trim().toLowerCase()
  return normalized || null
}

function mergeSourceValues(existing: Record<string, unknown> | null, incoming: Record<string, unknown>) {
  const existingValues = existing || {}
  const existingCmp = (existingValues.cmp_documentation || {}) as Record<string, unknown>
  const incomingCmp = (incoming.cmp_documentation || {}) as Record<string, unknown>
  const definedIncomingCmp = Object.fromEntries(
    Object.entries(incomingCmp).filter(([, value]) => value !== undefined),
  )

  return {
    ...existingValues,
    ...incoming,
    cmp_documentation: {
      ...existingCmp,
      ...definedIncomingCmp,
    },
  }
}

// First + last name concatenated, lowercased, punctuation and honorifics dropped, for name matching.
function normalizeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(pastor|sis|sister|brother|bro|dr|rev|prolific)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function submitterDisplayName(sub: CMPSubmission, answers: Record<string, unknown>): string | null {
  const first = String(answers[FIELD_IDS.firstName] ?? '').trim()
  const last = String(answers[FIELD_IDS.lastName] ?? '').trim()
  const full = `${first} ${last}`.trim()
  return full || String(sub.submitterName ?? sub.member?.fullName ?? '').trim() || null
}

interface CMPSubmission {
  id: string
  createdAt: string
  answers: Record<string, unknown>
  submitterName?: string
  member?: { id: string; fullName: string }
}

interface ProcessResult {
  submission_id: string
  status: string
  participant_id?: string
  canonical_mutations?: Record<string, unknown>
  issues?: string[]
  submitter?: { name: string | null; email: string | null }
}

interface Lookups {
  identityMaps: Map<string, string> // cmp submission id -> participant id
  emailClaims: Map<string, string> // normalized email -> participant id
  participants: Map<string, any> // participant id -> row
  byName: Map<string, string[]> // normalized full name -> participant ids
}

// PostgREST caps a response at 1000 rows by default, so page through the event's rows.
async function fetchAll(build: (from: number, to: number) => any): Promise<any[]> {
  const rows: any[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
    if (!data || data.length < size) break
  }
  return rows
}

async function loadLookups(supabase: any, eventId: string): Promise<Lookups> {
  const [maps, claims, parts] = await Promise.all([
    fetchAll((a, b) => supabase.from('icplc_identity_maps').select('source_key, participant_id')
      .eq('event_id', eventId).eq('source_type', 'cmp_documentation').order('source_key').range(a, b)),
    fetchAll((a, b) => supabase.from('icplc_email_claims').select('normalized_email, participant_id')
      .eq('event_id', eventId).order('normalized_email').range(a, b)),
    fetchAll((a, b) => supabase.from('icplc_participants').select('*')
      .eq('event_id', eventId).order('id').range(a, b)),
  ])
  const byName = new Map<string, string[]>()
  for (const p of parts) {
    const key = normalizeName(p.full_name)
    if (key) byName.set(key, [...(byName.get(key) || []), p.id])
  }
  return {
    byName,
    identityMaps: new Map(maps.map((m: any) => [m.source_key, m.participant_id])),
    emailClaims: new Map(claims.map((c: any) => [c.normalized_email, c.participant_id])),
    participants: new Map(parts.map((p: any) => [p.id, p])),
  }
}

async function processSubmission(
  sub: CMPSubmission,
  supabase: any,
  eventId: string,
  action: string,
  lookups: Lookups,
): Promise<ProcessResult> {
  const answers = (sub.answers || {}) as Record<string, unknown>
  const result: ProcessResult = {
    submission_id: sub.id,
    status: 'error',
    issues: [],
  }

  // Step 1: Resolve participant identity (order of precedence)
  let participantId: string | null = null
  let identityMethod: string | null = null

  // 1a. Durable CMP identity map
  const durableParticipantId = lookups.identityMaps.get(sub.id) ?? null
  const existingMap = durableParticipantId ? { data: { participant_id: durableParticipantId } } : null

  if (existingMap?.data) {
    participantId = existingMap.data.participant_id
    identityMethod = 'durable_map'
  }

  // 1b. Email claim lookup. Always collect this when present so durable-map
  // disagreements are detected instead of silently trusting the first match.
  let emailClaimParticipantId: string | null = null
  const emailRaw = answers[FIELD_IDS.email] as string
  const emailNorm = normalizeEmail(emailRaw)

  if (emailNorm) {
    const claimed = lookups.emailClaims.get(emailNorm)
    if (claimed) {
      emailClaimParticipantId = claimed
      if (!participantId) {
        participantId = emailClaimParticipantId
        identityMethod = 'email_claim'
      }
    }
  }

  // Step 1c: CRITICAL — Check for identity conflict
  // If durable map exists AND email claim exists but they disagree
  if (existingMap?.data && emailClaimParticipantId && existingMap.data.participant_id !== emailClaimParticipantId) {
    result.status = 'identity_conflict'
    result.issues?.push(
      `durable_map→${existingMap.data.participant_id} vs email_claim→${emailClaimParticipantId}`,
    )
    return result // STOP: do not mutate either participant
  }

  // 1d. No email match: fall back to the first + last name on the form, only when it names exactly one person.
  if (!participantId) {
    const nameKey = normalizeName(submitterDisplayName(sub, answers))
    const candidates = nameKey ? lookups.byName.get(nameKey) || [] : []
    if (candidates.length === 1) {
      participantId = candidates[0]
      identityMethod = 'exact_name'
    }
  }

  // Step 2: Handle unmatched or conflicted identity
  if (!participantId) {
    result.status = 'unmatched'
    result.submitter = { name: submitterDisplayName(sub, answers), email: emailNorm }
    return result
  }

  // Step 3: Look up participant (event-scoped: lookups only contain this event's rows)
  const participant = { data: lookups.participants.get(participantId) ?? null }

  if (!participant.data) {
    result.status = 'error'
    result.issues?.push('participant_not_found')
    return result
  }

  const part = participant.data

  // Step 4: Build source values
  const sourceValues = {
    cmp_documentation: {
      submission_id: sub.id,
      submitter_name: sub.submitterName,
      created_at: sub.createdAt,
      observed_at: new Date().toISOString(),
      first_name: answers[FIELD_IDS.firstName],
      last_name: answers[FIELD_IDS.lastName],
      email: answers[FIELD_IDS.email],
      phone: answers[FIELD_IDS.phone],
      passport_status_raw: answers[FIELD_IDS.passportStatus],
      passport_region: answers[FIELD_IDS.passportRegion],
      canadian_status_raw: answers[FIELD_IDS.canadianStatus],
      canadian_doc_valid_through_nov: answers[FIELD_IDS.canadianDocValidity],
      assistance_requested: answers[FIELD_IDS.assistanceRequested],
    },
  }

  // Step 5: Compute canonical mutations with override protection
  const updates: Record<string, unknown> = {
    source_values: mergeSourceValues(part.source_values || {}, sourceValues),
  }

  let hasCanonicalMutation = false

  // Passport status
  const passportRaw = answers[FIELD_IDS.passportStatus] as string | null
  const passportCanonical = passportRaw ? passportStatusMap[passportRaw] : null

  if (passportCanonical) {
    if (!(part.override_fields?.passport_readiness?.overridden)) {
      updates.passport_readiness = passportCanonical
      hasCanonicalMutation = true
    }
  } else if (passportRaw) {
    result.status = 'unknown_value'
    result.issues?.push(`unrecognized_passport_status: ${passportRaw}`)
  }

  // Canadian status
  const canadianRaw = answers[FIELD_IDS.canadianStatus] as string | null
  const canadianCanonical = canadianRaw ? canadianStatusMap[canadianRaw] : null

  if (canadianCanonical) {
    if (!(part.override_fields?.canada_residency_status?.overridden)) {
      updates.canada_residency_status = canadianCanonical
      hasCanonicalMutation = true
    }
  } else if (canadianRaw) {
    result.status = 'unknown_value'
    result.issues?.push(`unrecognized_canadian_status: ${canadianRaw}`)
  }

  // Passport region — reported ECOWAS / Non-ECOWAS, kept separate from passport_country
  const regionRaw = answers[FIELD_IDS.passportRegion] as string | null
  const regionCanonical = typeof regionRaw === 'string' ? passportRegionMap[regionRaw.trim().toLowerCase()] : null

  if (regionCanonical) {
    if (!(part.override_fields?.passport_region?.overridden)) {
      updates.passport_region = regionCanonical
      hasCanonicalMutation = true
    }
  } else if (regionRaw) {
    result.status = 'unknown_value'
    result.issues?.push(`unrecognized_passport_region: ${regionRaw}`)
  }

  // Canadian document validity: raw answer only (already in source_values above).
  const validityRaw = answers[FIELD_IDS.canadianDocValidity] as string | null
  if (validityRaw && !(typeof validityRaw === 'string' && docValidityAnswers.has(validityRaw.trim().toLowerCase()))) {
    result.status = 'unknown_value'
    result.issues?.push(`unrecognized_doc_validity: ${validityRaw}`)
  }

  // Documentation assistance requested (feeds the visa / travel-documentation follow-up queue)
  const assistanceRaw = answers[FIELD_IDS.assistanceRequested] as string | null
  const assistanceCanonical = typeof assistanceRaw === 'string' ? assistanceMap[assistanceRaw.trim().toLowerCase()] : undefined

  if (assistanceCanonical !== undefined) {
    if (!(part.override_fields?.documentation_assistance_requested?.overridden)) {
      updates.documentation_assistance_requested = assistanceCanonical
      hasCanonicalMutation = true
    }
  } else if (assistanceRaw) {
    result.status = 'unknown_value'
    result.issues?.push(`unrecognized_assistance_requested: ${assistanceRaw}`)
  }

  // Step 6: Determine result status
  if (result.issues && result.issues.length > 0) {
    return result // unknown_value
  }

  if (hasCanonicalMutation) {
    result.status = 'matched_applied'
  } else {
    result.status = 'matched_source_only'
  }

  result.participant_id = participantId
  result.canonical_mutations = updates

  // Step 7: Apply (if action='apply')
  if (action === 'apply') {
    let updateResp = await supabase
      .from('icplc_participants')
      .update(updates)
      .eq('id', participantId)
      .eq('event_id', eventId)

    // Deployed before the documentation_assistance_requested migration? Keep the rest of the sync working;
    // the raw answer is still stored in source_values and the app reads it from there.
    if (updateResp.error && /documentation_assistance_requested/.test(updateResp.error.message ?? '')) {
      delete updates.documentation_assistance_requested
      updateResp = await supabase
        .from('icplc_participants')
        .update(updates)
        .eq('id', participantId)
        .eq('event_id', eventId)
    }

    if (updateResp.error) {
      result.status = 'error'
      result.issues?.push(updateResp.error.message)
      return result
    }
    lookups.participants.set(participantId, { ...part, ...updates })

    // Insert durable identity map (immutable: no UPDATE on conflict)
    // If already exists, ON CONFLICT DO NOTHING (identity is immutable)
    await supabase.from('icplc_identity_maps').insert(
      {
        event_id: eventId,
        source_type: 'cmp_documentation',
        source_key: sub.id,
        participant_id: participantId,
      },
      { onConflict: 'do nothing' }, // Immutable: never transfer participant_id
    )
  }

  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed — use POST' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const platformToken = Deno.env.get('LEADERS_PLATFORM_TOKEN')

  if (!supabaseUrl || !supabaseKey || !platformToken) {
    return json(500, { error: 'Missing environment configuration' })
  }

  // Verify caller is authenticated with JWT (required for staff-triggered sync)
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Authentication required — use Bearer JWT' })
  }

  const jwtToken = authHeader.slice(7)

  // Verify JWT with Supabase and extract user
  const supabaseClient = createClient(supabaseUrl, supabaseKey)
  const { data: user, error: authError } = await supabaseClient.auth.getUser(jwtToken)

  if (authError || !user?.user) {
    return json(401, { error: 'Invalid or expired JWT' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Parse request
  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const { action, event_id } = body
  if (!action || !event_id) {
    return json(400, { error: 'Required: action (preview|apply), event_id' })
  }

  if (!['preview', 'apply', 'add_unmatched'].includes(action)) {
    return json(400, { error: 'action must be preview, apply or add_unmatched' })
  }
  const requestedIds: Set<string> | null = action === 'add_unmatched'
    ? new Set(Array.isArray(body.submission_ids) ? body.submission_ids.map(String) : [])
    : null
  if (requestedIds && requestedIds.size === 0) {
    return json(400, { error: 'add_unmatched requires submission_ids' })
  }

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.user.id)
    .maybeSingle()

  const callerRole = caller?.role
  let authorized = callerRole === 'super_admin' || callerRole === 'regional_secretary'

  if (!authorized) {
    const { data: eventConfig } = await supabase
      .from('event_configs')
      .select('sprint_pattern')
      .eq('id', event_id)
      .maybeSingle()

    if (eventConfig?.sprint_pattern) {
      const { data: memberships } = await supabase
        .from('sprint_team_members')
        .select('user_id, sprint_teams!inner(name, sprints!inner(name))')
        .eq('user_id', user.user.id)

      authorized = (memberships || []).some((m: any) => {
        const teamName = String(m.sprint_teams?.name || '')
        const sprintName = String(m.sprint_teams?.sprints?.name || '')
        const pattern = String(eventConfig.sprint_pattern).replace(/%/g, '').toLowerCase()
        return sprintName.toLowerCase().includes(pattern)
          && !/finance|transportation|accommodation|hospitality/i.test(teamName)
      })
    }
  }

  if (!authorized) {
    return json(403, { error: 'Insufficient authorization: ICPLC documentation sync requires write access' })
  }

  // Fetch CMP submissions with pagination
  const allSubmissions: CMPSubmission[] = []
  let page = 1
  const pageSize = 1000

  const seenIds = new Set<string>()
  const MAX_PAGES = 50
  try {
    while (page <= MAX_PAGES) {
      const res = await fetch(
        `${DOCUMENTATION_FORM_URL}?pageSize=${pageSize}&page=${page}`,
        {
          headers: { Authorization: `Bearer ${platformToken}` },
          // Never let a slow/blocked upstream hang the whole sync.
          signal: AbortSignal.timeout(20_000),
        },
      )

      if (!res.ok) {
        return json(502, {
          error: 'CMP API fetch failed',
          status: res.status,
        })
      }

      const payload = (await res.json()) as {
        data: CMPSubmission[]
        pagination?: { total?: number; page?: number; pageSize?: number }
      }

      if (!payload.data || payload.data.length === 0) break

      // If the API ignores `page` it returns the same rows again: stop instead of looping forever.
      const fresh = payload.data.filter((s) => !seenIds.has(s.id))
      if (fresh.length === 0) break
      for (const s of fresh) seenIds.add(s.id)
      allSubmissions.push(...fresh)

      const total = payload.pagination?.total
      if (total && allSubmissions.length >= total) break
      if (payload.data.length < pageSize) break // short page = last page
      page++
    }
  } catch (err) {
    return json(502, {
      error: 'Network error fetching CMP API',
      detail: String(err).slice(0, 200),
    })
  }

  // Process submissions against lookups loaded once (a handful of queries, not several per submission)
  let lookups: Lookups
  try {
    lookups = await loadLookups(supabase, event_id)
  } catch (err) {
    return json(500, { error: 'Failed to load participants', detail: String(err).slice(0, 200) })
  }
  const results: ProcessResult[] = []
  for (const sub of allSubmissions) {
    if (requestedIds) {
      if (!requestedIds.has(sub.id)) continue
      // Only submissions that are genuinely unmatched right now may be added.
      const check = await processSubmission(sub, supabase, event_id, 'preview', lookups)
      if (check.status !== 'unmatched') {
        results.push({ ...check, issues: [...(check.issues || []), 'not_unmatched'] })
        continue
      }
      const answers = (sub.answers || {}) as Record<string, unknown>
      const name = submitterDisplayName(sub, answers)
      if (!name) {
        results.push({ submission_id: sub.id, status: 'error', issues: ['no_name'] })
        continue
      }
      const created = await supabase
        .from('icplc_participants')
        .insert({
          event_id,
          full_name: name,
          email: normalizeEmail(answers[FIELD_IDS.email] as string),
          registration_status: 'not_registered',
          participation_status: 'tracking',
          source_values: {
            created_from: {
              source: 'cmp_documentation',
              submission_id: sub.id,
              observed_at: new Date().toISOString(),
            },
          },
        })
        .select('*')
        .single()
      if (created.error || !created.data) {
        results.push({ submission_id: sub.id, status: 'error', issues: [created.error?.message || 'insert_failed'] })
        continue
      }
      lookups.participants.set(created.data.id, created.data)
      lookups.identityMaps.set(sub.id, created.data.id)
      results.push(await processSubmission(sub, supabase, event_id, 'apply', lookups))
      continue
    }
    const result = await processSubmission(sub, supabase, event_id, action, lookups)
    results.push(result)
  }

  // Classify results
  const counts = {
    matched_applied: results.filter((r) => r.status === 'matched_applied').length,
    matched_source_only: results.filter((r) => r.status === 'matched_source_only').length,
    unmatched: results.filter((r) => r.status === 'unmatched').length,
    unknown_value: results.filter((r) => r.status === 'unknown_value').length,
    error: results.filter((r) => r.status === 'error').length,
  }

  return json(200, {
    action,
    submission_count: allSubmissions.length,
    processed: results.length,
    counts,
    results,
  })
})
