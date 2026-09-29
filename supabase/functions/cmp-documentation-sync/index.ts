/**
 * cmp-documentation-sync
 *
 * Fetches CMP documentation form submissions and applies them to ICPLC
 * participants with identity reconciliation, override protection, and
 * comprehensive failure classification.
 *
 * Auth: Service role bearer token required
 * Method: POST { action: 'preview' | 'apply', event_id: uuid }
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
}

async function processSubmission(
  sub: CMPSubmission,
  supabase: any,
  eventId: string,
  action: string,
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
  const existingMap = await supabase
    .from('icplc_identity_maps')
    .select('participant_id')
    .eq('event_id', eventId)
    .eq('source_type', 'cmp_documentation')
    .eq('source_key', sub.id)
    .maybeSingle()

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
    const emailClaim = await supabase
      .from('icplc_email_claims')
      .select('participant_id')
      .eq('event_id', eventId)
      .eq('normalized_email', emailNorm)
      .maybeSingle()

    if (emailClaim?.data) {
      emailClaimParticipantId = emailClaim.data.participant_id
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

  // Step 2: Handle unmatched or conflicted identity
  if (!participantId) {
    result.status = 'unmatched'
    return result
  }

  // Step 3: Fetch participant
  const participant = await supabase
    .from('icplc_participants')
    .select('*')
    .eq('id', participantId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (!participant?.data) {
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
    const updateResp = await supabase
      .from('icplc_participants')
      .update(updates)
      .eq('id', participantId)
      .eq('event_id', eventId)

    if (updateResp.error) {
      result.status = 'error'
      result.issues?.push(updateResp.error.message)
      return result
    }

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

  if (!['preview', 'apply'].includes(action)) {
    return json(400, { error: 'action must be preview or apply' })
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

  try {
    while (true) {
      const res = await fetch(
        `${DOCUMENTATION_FORM_URL}?pageSize=${pageSize}&page=${page}`,
        {
          headers: { Authorization: `Bearer ${platformToken}` },
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
      allSubmissions.push(...payload.data)

      const total = payload.pagination?.total
      if (total && allSubmissions.length >= total) break
      page++
    }
  } catch (err) {
    return json(502, {
      error: 'Network error fetching CMP API',
      detail: String(err).slice(0, 200),
    })
  }

  // Process submissions
  const results: ProcessResult[] = []
  for (const sub of allSubmissions) {
    const result = await processSubmission(sub, supabase, event_id, action)
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
