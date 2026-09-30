/**
 * cmp-flight-sync
 *
 * Fetches the CMP "Flight Form" submissions and applies arrival/departure details to ICPLC
 * participants. The form has no email field, so identity is resolved by (in order):
 *   1. saved links in icplc_identity_maps (source_type 'cmp_flights'): the submission id, or a staff-assigned form name ('name:<key>')
 *   2. email claim, when the submission carries a member email
 *   3. normalized full name (honorifics stripped, as in registration), only if it matches exactly ONE participant
 * Anything else is 'unmatched' or 'ambiguous'; staff can assign those by hand (manual_matches) on Apply.
 *
 * Auth: staff JWT (same authorization rule as cmp-documentation-sync)
 * Method: POST { action: 'preview' | 'apply', event_id: uuid, manual_matches?: [{ submission_id, participant_id }] }
 * Only the six flight columns change; a field with a staff override is left alone, and an
 * empty answer never blanks existing data. When someone submits more than once, only their
 * latest submission is used.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FLIGHT_FORM_URL =
  Deno.env.get('CMP_FLIGHT_FORM_URL')
  || 'https://leaders.lwcanada.org/api/forms/cmunw78iq00wsolf5g5wvzh3z/submissions'

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

// Field IDs from the form definition. Note the departure date field's id really is "arrival_date_u4to".
const FIELD_IDS = {
  firstName: 'first_name_n8lv',
  lastName: 'last_name_jh4r',
  arrivalDate: 'arrival_date_ymd7',
  arrivalTime: 'arrival_time_y5si',
  arrivalFlight: 'arrival_flight_code_451b',
  departureDate: 'arrival_date_u4to',
  departureTime: 'departure_time_8uel',
  departureFlight: 'departure_flight_code_73kt',
}

interface CMPSubmission {
  id: string
  createdAt: string
  answers: Record<string, unknown>
  submitterName?: string
  member?: { id?: string; fullName?: string; email?: string }
}

interface ProcessResult {
  submission_id: string
  status: string
  participant_id?: string
  canonical_mutations?: Record<string, unknown>
  issues?: string[]
  submitter?: { name: string | null; email: string | null }
  flight?: Record<string, string | null>
  matched_by?: string
}

interface Lookups {
  identityMaps: Map<string, string> // submission id -> participant id
  emailClaims: Map<string, string> // normalized email -> participant id
  participants: Map<string, any>
  byName: Map<string, string[]> // normalized full name -> participant ids
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  return email.trim().toLowerCase() || null
}

// Same fuzzy name key as registration-api-sync: strip honorifics, lowercase, drop punctuation.
function normalizeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(pastor|sis|sister|brother|bro|dr|rev|prolific)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// YYYY-MM-DD from an ISO timestamp / date string; falls back to Date parsing. Null if unreadable.
function formatDate(value: unknown): string | null {
  const v = str(value)
  if (!v) return null
  const iso = v.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// HH:MM (24-hour) from ISO datetimes, HH:MM[:SS] or 12-hour "2:30 PM". Null if unreadable.
function formatTime(value: unknown): string | null {
  const v = str(value)
  if (!v) return null
  const isoMatch = v.match(/T(\d{2}):(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`
  const h24 = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (h24) return `${h24[1].padStart(2, '0')}:${h24[2]}`
  const ampm = v.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const isPM = ampm[3].toUpperCase() === 'PM'
    if (isPM && h !== 12) h += 12
    if (!isPM && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${ampm[2] ?? '00'}`
  }
  return null
}

// The first + last name typed on the form is who the flight is for (someone may fill it in for another
// person, so the logged-in submitter is only a last resort).
function submitterDisplayName(sub: CMPSubmission, answers: Record<string, unknown>): string | null {
  const full = `${str(answers[FIELD_IDS.firstName])} ${str(answers[FIELD_IDS.lastName])}`.trim()
  return full || str(sub.member?.fullName) || str(sub.submitterName) || null
}

// The formatted flight answers, shown for rows staff have to match by hand.
function flightSummary(answers: Record<string, unknown>): Record<string, string | null> {
  return {
    arrival_date: formatDate(answers[FIELD_IDS.arrivalDate]),
    arrival_time: formatTime(answers[FIELD_IDS.arrivalTime]),
    arrival_flight: str(answers[FIELD_IDS.arrivalFlight]).toUpperCase() || null,
    departure_date: formatDate(answers[FIELD_IDS.departureDate]),
    departure_time: formatTime(answers[FIELD_IDS.departureTime]),
    departure_flight: str(answers[FIELD_IDS.departureFlight]).toUpperCase() || null,
  }
}

function mergeSourceValues(existing: Record<string, unknown> | null, incoming: Record<string, unknown>) {
  const base = existing || {}
  return {
    ...base,
    cmp_flights: { ...((base.cmp_flights || {}) as Record<string, unknown>), ...incoming },
  }
}

// PostgREST caps a response at 1000 rows, so page through the event's rows.
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
      .eq('event_id', eventId).eq('source_type', 'cmp_flights').order('source_key').range(a, b)),
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
    identityMaps: new Map(maps.map((m: any) => [m.source_key, m.participant_id])),
    emailClaims: new Map(claims.map((c: any) => [c.normalized_email, c.participant_id])),
    participants: new Map(parts.map((p: any) => [p.id, p])),
    byName,
  }
}

function resolveParticipant(sub: CMPSubmission, answers: Record<string, unknown>, lookups: Lookups):
  { id: string | null; method?: string; ambiguous?: boolean } {
  const durable = lookups.identityMaps.get(sub.id)
  if (durable) return { id: durable, method: 'saved_link' }

  // A staff-assigned name alias: the same form name keeps landing on the same person, even on new submissions.
  const nameKey = normalizeName(submitterDisplayName(sub, answers))
  const alias = nameKey ? lookups.identityMaps.get(`name:${nameKey}`) : null
  if (alias) return { id: alias, method: 'saved_name' }

  const email = normalizeEmail(sub.member?.email)
  const claimed = email ? lookups.emailClaims.get(email) : null
  if (claimed) return { id: claimed, method: 'email_claim' }

  const name = normalizeName(submitterDisplayName(sub, answers))
  const candidates = name ? lookups.byName.get(name) || [] : []
  if (candidates.length === 1) return { id: candidates[0], method: 'exact_name' }
  if (candidates.length > 1) return { id: null, ambiguous: true }
  return { id: null }
}

async function processSubmission(
  sub: CMPSubmission,
  supabase: any,
  eventId: string,
  action: string,
  lookups: Lookups,
  participantId: string,
  method: string,
): Promise<ProcessResult> {
  const answers = (sub.answers || {}) as Record<string, unknown>
  const result: ProcessResult = { submission_id: sub.id, status: 'error', issues: [] }
  const part = lookups.participants.get(participantId)
  if (!part) {
    result.issues?.push('participant_not_found')
    return result
  }

  const rawArrivalDate = str(answers[FIELD_IDS.arrivalDate])
  const rawDepartureDate = str(answers[FIELD_IDS.departureDate])
  const rawArrivalTime = str(answers[FIELD_IDS.arrivalTime])
  const rawDepartureTime = str(answers[FIELD_IDS.departureTime])
  const arrivalDate = formatDate(rawArrivalDate)
  const departureDate = formatDate(rawDepartureDate)
  const arrivalTime = formatTime(rawArrivalTime)
  const departureTime = formatTime(rawDepartureTime)
  if (rawArrivalDate && !arrivalDate) result.issues?.push(`unrecognized_arrival_date: ${rawArrivalDate}`)
  if (rawDepartureDate && !departureDate) result.issues?.push(`unrecognized_departure_date: ${rawDepartureDate}`)
  if (rawArrivalTime && !arrivalTime) result.issues?.push(`unrecognized_arrival_time: ${rawArrivalTime}`)
  if (rawDepartureTime && !departureTime) result.issues?.push(`unrecognized_departure_time: ${rawDepartureTime}`)
  if (result.issues && result.issues.length > 0) {
    result.status = 'unknown_value'
    return result
  }

  const incoming: Record<string, string | null> = {
    arrival_date: arrivalDate,
    arrival_time: arrivalTime,
    arrival_flight: str(answers[FIELD_IDS.arrivalFlight]).toUpperCase() || null,
    departure_date: departureDate,
    departure_time: departureTime,
    departure_flight: str(answers[FIELD_IDS.departureFlight]).toUpperCase() || null,
  }

  const updates: Record<string, unknown> = {}
  let hasCanonicalMutation = false
  for (const [field, value] of Object.entries(incoming)) {
    if (value === null) continue // an empty answer never blanks existing data
    if (part.override_fields?.[field]?.overridden) continue
    updates[field] = value
    if (part[field] !== value) hasCanonicalMutation = true
  }

  updates.source_values = mergeSourceValues(part.source_values, {
    submission_id: sub.id,
    created_at: sub.createdAt,
    observed_at: new Date().toISOString(),
    matched_by: method,
    ...incoming,
  })

  result.status = hasCanonicalMutation ? 'matched_applied' : 'matched_source_only'
  result.participant_id = participantId
  result.canonical_mutations = updates

  if (action === 'apply') {
    const resp = await supabase.from('icplc_participants').update(updates)
      .eq('id', participantId).eq('event_id', eventId)
    if (resp.error) {
      result.status = 'error'
      result.issues?.push(resp.error.message)
      return result
    }
    lookups.participants.set(participantId, { ...part, ...updates })
    // Durable links so later runs keep matching. A staff assignment overwrites any earlier link and also
    // remembers the name on the form, so the person's next submission lands on the same participant.
    const manual = method === 'manual'
    const links = [{ event_id: eventId, source_type: 'cmp_flights', source_key: sub.id, participant_id: participantId }]
    const nameKey = normalizeName(submitterDisplayName(sub, answers))
    if (manual && nameKey) links.push({ event_id: eventId, source_type: 'cmp_flights', source_key: `name:${nameKey}`, participant_id: participantId })
    await supabase.from('icplc_identity_maps').upsert(links, {
      onConflict: 'event_id,source_type,source_key',
      ignoreDuplicates: !manual,
    })
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

  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Authentication required — use Bearer JWT' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data: user, error: authError } = await supabase.auth.getUser(authHeader.slice(7))
  if (authError || !user?.user) return json(401, { error: 'Invalid or expired JWT' })

  let body: any
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' })
  }

  const { action, event_id } = body
  // Staff-assigned matches for names the sync could not resolve: [{ submission_id, participant_id }]
  const manualMatches: Array<{ submission_id: string; participant_id: string }> = Array.isArray(body.manual_matches)
    ? body.manual_matches.filter((m: any) => m?.submission_id && m?.participant_id)
    : []
  if (!action || !event_id) return json(400, { error: 'Required: action (preview|apply), event_id' })
  if (!['preview', 'apply'].includes(action)) return json(400, { error: 'action must be preview or apply' })

  // Same rule as cmp-documentation-sync: admins, or sprint-team members for this event (minus finance-type teams).
  const { data: caller } = await supabase.from('users').select('role').eq('id', user.user.id).maybeSingle()
  let authorized = caller?.role === 'super_admin' || caller?.role === 'regional_secretary'

  if (!authorized) {
    const { data: eventConfig } = await supabase
      .from('event_configs').select('sprint_pattern').eq('id', event_id).maybeSingle()

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
    return json(403, { error: 'Insufficient authorization: ICPLC flight sync requires write access' })
  }

  // Fetch CMP submissions with pagination
  const allSubmissions: CMPSubmission[] = []
  const seenIds = new Set<string>()
  const pageSize = 1000
  const MAX_PAGES = 50
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(`${FLIGHT_FORM_URL}?pageSize=${pageSize}&page=${page}`, {
        headers: { Authorization: `Bearer ${platformToken}` },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) return json(502, { error: 'CMP API fetch failed', status: res.status })

      const payload = (await res.json()) as {
        data: CMPSubmission[]
        pagination?: { total?: number }
      }
      if (!payload.data || payload.data.length === 0) break

      // If the API ignores `page` it returns the same rows again: stop instead of looping forever.
      const fresh = payload.data.filter((s) => !seenIds.has(s.id))
      if (fresh.length === 0) break
      for (const s of fresh) seenIds.add(s.id)
      allSubmissions.push(...fresh)

      const total = payload.pagination?.total
      if (total && allSubmissions.length >= total) break
      if (payload.data.length < pageSize) break
    }
  } catch (err) {
    return json(502, { error: 'Network error fetching CMP API', detail: String(err).slice(0, 200) })
  }

  let lookups: Lookups
  try {
    lookups = await loadLookups(supabase, event_id)
  } catch (err) {
    return json(500, { error: 'Failed to load participants', detail: String(err).slice(0, 200) })
  }

  // One entry per person: the latest submission for each name on the form.
  const bestByPerson = new Map<string, CMPSubmission>()
  const extras: ProcessResult[] = []
  const personKey = (sub: CMPSubmission) =>
    normalizeName(submitterDisplayName(sub, (sub.answers || {}) as Record<string, unknown>)) || sub.id
  const beats = (a: CMPSubmission, b: CMPSubmission) => String(a.createdAt) > String(b.createdAt)
  for (const sub of allSubmissions) {
    const key = personKey(sub)
    const existing = bestByPerson.get(key)
    if (!existing) { bestByPerson.set(key, sub); continue }
    const [winner, loser] = beats(sub, existing) ? [sub, existing] : [existing, sub]
    bestByPerson.set(key, winner)
    extras.push({ submission_id: loser.id, status: 'superseded' })
  }

  const manualBySubmission = new Map(manualMatches.map((m) => [m.submission_id, m.participant_id]))
  const seenParticipants = new Set<string>()
  const results: ProcessResult[] = [...extras]
  // Hand-assigned submissions go first so they claim their participant before any automatic match does.
  const ordered = [...bestByPerson.values()].sort((a, b) => Number(manualBySubmission.has(b.id)) - Number(manualBySubmission.has(a.id)))
  for (const sub of ordered) {
    const answers = (sub.answers || {}) as Record<string, unknown>
    let resolved = resolveParticipant(sub, answers, lookups)
    // A staff assignment beats any automatic match, so a wrong match can be corrected.
    const manualId = manualBySubmission.get(sub.id)
    if (manualId && lookups.participants.has(manualId)) {
      resolved = { id: manualId, method: 'manual' }
    }
    if (!resolved.id) {
      results.push({
        submission_id: sub.id,
        status: resolved.ambiguous ? 'ambiguous' : 'unmatched',
        issues: resolved.ambiguous ? ['more than one participant has this name'] : [],
        submitter: { name: submitterDisplayName(sub, answers), email: normalizeEmail(sub.member?.email) },
        flight: flightSummary(answers),
      })
      continue
    }
    if (seenParticipants.has(resolved.id)) {
      results.push({ submission_id: sub.id, status: 'superseded', participant_id: resolved.id })
      continue
    }
    seenParticipants.add(resolved.id)
    const r = await processSubmission(sub, supabase, event_id, action, lookups, resolved.id, resolved.method!)
    r.matched_by = resolved.method
    r.submitter = { name: submitterDisplayName(sub, answers), email: normalizeEmail(sub.member?.email) }
    results.push(r)
  }

  const count = (s: string) => results.filter((r) => r.status === s).length
  return json(200, {
    action,
    submission_count: allSubmissions.length,
    processed: results.length,
    counts: {
      matched_applied: count('matched_applied'),
      matched_source_only: count('matched_source_only'),
      unmatched: count('unmatched'),
      ambiguous: count('ambiguous'),
      unknown_value: count('unknown_value'),
      superseded: count('superseded'),
      error: count('error'),
    },
    results,
  })
})
