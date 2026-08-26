import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const REGISTRATIONS_FORM_URL =
  'https://leaders.lwcanada.org/api/forms/cmrgl1w5r009e853pn1x0gvws/submissions'
const FLIGHTS_FORM_URL =
  'https://leaders.lwcanada.org/api/forms/cms8ehb3j00iekhw1ywwge7oi/submissions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Normalize a name for fuzzy matching: strip honorifics, lowercase, collapse spaces
function normName(s = '') {
  return s.toLowerCase()
    .replace(/\b(pastor|sis|sister|brother|bro|dr|rev|prolific)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Extract YYYY-MM-DD from ISO timestamp or date string
function formatDate(raw: string): string {
  if (!raw) return ''
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : raw
}

// Normalize any time value to HH:MM (24-hour) for DB storage
// The frontend formats for display — the DB must store machine-readable values
// so that <input type="time"> works correctly in edit modals.
function formatTime(raw: string): string {
  if (!raw) return ''
  // ISO datetime: "1900-01-01T14:30:00.000Z"
  const isoMatch = raw.match(/T(\d{2}):(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`
  // Already HH:MM or HH:MM:SS — strip seconds
  const h24 = raw.match(/^(\d{2}):(\d{2})/)
  if (h24) return `${h24[1]}:${h24[2]}`
  // 12-hour: "2:30 PM" or "2:30PM"
  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10)
    const m = ampmMatch[2]
    const isPM = ampmMatch[3].toUpperCase() === 'PM'
    if (isPM && h !== 12) h += 12
    if (!isPM && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${m}`
  }
  return raw
}

function mapRegistration(
  sub: Record<string, unknown>,
  unitNames: Record<string, string>,
) {
  const a = (sub.answers || {}) as Record<string, string>
  const fellowship = unitNames[a.fellowship_9qwz] || ''
  const subgroup =
    (sub.unit as { name?: string } | null)?.name ||
    unitNames[a.group_subgroup_0zvc] ||
    ''
  const firstName = (a.full_name || '').trim()
  const lastName = (a.last_name_q8f9 || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')

  return {
    email: (a.email_address_m55d || '').trim().toLowerCase(),
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    gender: a.gender_tgb4 || '',
    subgroup,
    fellowship,
    phone: (a.phone_number_0uj2 || '').trim(),
    designation: a.designation_f3rl || '',
    shirt_size: a.shirt_size_kpp8 || '',
    foundation_status: a.foundation_school_status_cu0y || '',
    baptism: a.have_you_been_baptised_immersion_7cfs || '',
    allergies: a.do_you_have_any_allergies_or_die_mfv2 || '',
    team: a.which_team_would_you_like_to_joi_xqlb || '',
    submitted_at: (sub.createdAt as string) || new Date().toISOString(),
  }
}

function mapFlight(sub: Record<string, unknown>) {
  const a = (sub.answers || {}) as Record<string, string>
  const memberFullName = (sub.member as { fullName?: string } | null)?.fullName
  const fullName = memberFullName || (a.full_name || '').trim()

  return {
    full_name: fullName,
    arrival_date: formatDate(a.arrival_date_ymd7 || ''),
    arrival_time: formatTime(a.arrival_time_y5si || ''),
    arrival_flight: a.arrival_flight_code_451b || '',
    departure_date: formatDate(a.arrival_date_u4to || ''),
    departure_time: formatTime(a.departure_time_8uel || ''),
    departure_flight: a.departure_flight_code_73kt || '',
    _hasMember: !!(sub.member as { fullName?: string } | null)?.fullName,
    _createdAt: (sub.createdAt as string) || '',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const platformToken = Deno.env.get('LEADERS_PLATFORM_TOKEN')

  if (!platformToken) {
    return json(500, { error: 'LEADERS_PLATFORM_TOKEN secret not configured' })
  }

  const authHeader = req.headers.get('authorization') || ''

  // Allow service-role callers (pg_cron scheduled jobs) to bypass user-auth.
  // All other callers must present a valid user JWT.
  const isCronCall = authHeader === `Bearer ${supabaseServiceKey}`
  if (!isCronCall) {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json(401, { error: 'Unauthorized' })
  }

  // deno-lint-ignore no-explicit-any
  const body = await req.json().catch(() => ({})) as { action?: string; form?: string; manual_matches?: any[] }
  const action = body.action || 'preview'
  const form = body.form || 'registrations'

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

  // ════════════════════════════════════════════════════════════════════════════
  // FLIGHTS FORM
  // ════════════════════════════════════════════════════════════════════════════
  if (form === 'flights') {
    let platformData: { data?: unknown[] }
    try {
      const res = await fetch(FLIGHTS_FORM_URL, {
        headers: { Authorization: `Bearer ${platformToken}` },
      })
      if (!res.ok) {
        const text = await res.text()
        return json(502, { error: `Platform API returned ${res.status}`, details: text })
      }
      platformData = await res.json()
    } catch (e) {
      return json(502, { error: 'Could not reach platform API', details: String(e) })
    }

    const submissions = (platformData.data || []) as Record<string, unknown>[]

    // Deduplicate by normalized name: prefer member-matched, then latest
    const byName = new Map<string, ReturnType<typeof mapFlight>>()
    for (const sub of submissions) {
      const row = mapFlight(sub)
      if (!row.full_name) continue
      const key = normName(row.full_name)
      const existing = byName.get(key)
      const beats = !existing ||
        (!existing._hasMember && row._hasMember) ||
        (existing._hasMember === row._hasMember && row._createdAt > existing._createdAt)
      if (beats) byName.set(key, row)
    }
    const flightRows = [...byName.values()]

    // Fetch all registrations to match against by name
    const { data: regs } = await serviceClient
      .from('registrations')
      .select('email, full_name, flight_manual_override')

    const regByNorm = new Map<string, string>(
      (regs || []).map((r: { email: string; full_name: string }) => [normName(r.full_name), r.email]),
    )
    // Rows hand-edited in the Transportation tab — sync must not overwrite them
    const lockedEmails = new Set<string>(
      (regs || [])
        .filter((r: { email: string; flight_manual_override: boolean }) => r.flight_manual_override)
        .map((r: { email: string }) => r.email),
    )

    // Match each flight row to a registration email
    // deno-lint-ignore no-explicit-any
    const matched: any[] = []
    // deno-lint-ignore no-explicit-any
    const unmatchedRows: any[] = []
    for (const row of flightRows) {
      const email = regByNorm.get(normName(row.full_name))
      if (email) {
        matched.push({
          email,
          full_name: row.full_name,
          arrival_date: row.arrival_date,
          arrival_time: row.arrival_time,
          arrival_flight: row.arrival_flight,
          departure_date: row.departure_date,
          departure_time: row.departure_time,
          departure_flight: row.departure_flight,
        })
      } else {
        unmatchedRows.push({
          full_name: row.full_name,
          arrival_date: row.arrival_date,
          arrival_time: row.arrival_time,
          arrival_flight: row.arrival_flight,
          departure_date: row.departure_date,
          departure_time: row.departure_time,
          departure_flight: row.departure_flight,
        })
      }
    }

    if (action === 'preview') {
      return json(200, {
        total_submissions: submissions.length,
        unique_people: flightRows.length,
        matched_count: matched.length,
        unmatched_count: unmatchedRows.length,
        rows: matched,
        unmatched: unmatchedRows.map(r => r.full_name), // backward compat
        unmatched_rows: unmatchedRows,                   // full flight data for manual matching
      })
    }

    if (action === 'apply') {
      // Merge auto-matched with any manual overrides supplied by the caller,
      // then drop any row that was hand-edited in the Transportation tab —
      // those are locked until the edit is cleared.
      const allMatched = [...matched, ...(body.manual_matches || [])]
      const toUpsert = allMatched.filter((r) => !lockedEmails.has(r.email))
      const lockedSkipped = allMatched.length - toUpsert.length
      if (toUpsert.length === 0) {
        return json(200, { upserted: 0, locked_skipped: lockedSkipped, message: 'No matched registrations to update' })
      }
      const { error } = await serviceClient
        .from('registrations')
        .upsert(toUpsert, { onConflict: 'email' })
      if (error) return json(500, { error: 'Database error', details: error.message })
      return json(200, {
        upserted: toUpsert.length,
        locked_skipped: lockedSkipped,
        unmatched: unmatchedRows.length - (body.manual_matches?.length ?? 0),
        message: `${toUpsert.length} flight records synced${lockedSkipped ? ` (${lockedSkipped} skipped — manually edited)` : ''}`,
      })
    }

    return json(400, { error: 'Invalid action — use "preview" or "apply"' })
  }

  // ════════════════════════════════════════════════════════════════════════════
  // REGISTRATIONS FORM (default)
  // ════════════════════════════════════════════════════════════════════════════
  let platformData: { data?: unknown[]; unitNames?: Record<string, string> }
  try {
    const res = await fetch(REGISTRATIONS_FORM_URL, {
      headers: { Authorization: `Bearer ${platformToken}` },
    })
    if (!res.ok) {
      const text = await res.text()
      return json(502, { error: `Platform API returned ${res.status}`, details: text })
    }
    platformData = await res.json()
  } catch (e) {
    return json(502, { error: 'Could not reach platform API', details: String(e) })
  }

  const submissions = (platformData.data || []) as Record<string, unknown>[]
  const unitNames = platformData.unitNames || {}

  // Deduplicate: prefer member-matched, then latest createdAt
  const byEmail = new Map<string, { row: ReturnType<typeof mapRegistration>; hasMember: boolean; createdAt: string }>()
  for (const sub of submissions) {
    const row = mapRegistration(sub, unitNames)
    if (!row.email) continue
    const hasMember = !!(sub.member as { fullName?: string } | null)?.fullName
    const createdAt = (sub.createdAt as string) || ''
    const existing = byEmail.get(row.email)
    const beats = !existing ||
      (!existing.hasMember && hasMember) ||
      (existing.hasMember === hasMember && createdAt > existing.createdAt)
    if (beats) byEmail.set(row.email, { row, hasMember, createdAt })
  }
  const rows = [...byEmail.values()].map(({ row }) => row)

  // Rows hand-edited via the Edit Registration modal (name, subgroup, fellowship, phone,
  // designation, shirt size, foundation status, baptism, allergies, leadership) — sync
  // must not overwrite them. Same protection as flight_manual_override for flight fields;
  // this upsert previously had no lock check at all, so any manual correction here (e.g.
  // fixing a mis-typed name) was silently reverted by the next "Sync Registrations" run.
  const { data: existingRows } = await serviceClient
    .from('registrations')
    .select('email, registration_manual_override')
  const existingEmails = new Set(
    (existingRows || []).map((r: { email: string }) => r.email.toLowerCase()),
  )
  const lockedEmails = new Set<string>(
    (existingRows || [])
      .filter((r: { email: string; registration_manual_override: boolean }) => r.registration_manual_override)
      .map((r: { email: string }) => r.email),
  )

  if (action === 'preview') {
    const preview = rows.map((r) => ({
      ...r,
      _status: lockedEmails.has(r.email) ? 'locked' : existingEmails.has(r.email) ? 'update' : 'new',
    }))
    return json(200, {
      total_submissions: submissions.length,
      unique_emails: rows.length,
      new_count: preview.filter((r) => r._status === 'new').length,
      update_count: preview.filter((r) => r._status === 'update').length,
      locked_count: preview.filter((r) => r._status === 'locked').length,
      rows: preview,
    })
  }

  if (action === 'apply') {
    const toUpsert = rows.filter((r) => !lockedEmails.has(r.email))
    const lockedSkipped = rows.length - toUpsert.length
    if (toUpsert.length === 0) {
      return json(200, { upserted: 0, locked_skipped: lockedSkipped, message: 'No registrations to update' })
    }
    const { error } = await serviceClient
      .from('registrations')
      .upsert(toUpsert, { onConflict: 'email' })
    if (error) return json(500, { error: 'Database error', details: error.message })
    return json(200, {
      upserted: toUpsert.length,
      locked_skipped: lockedSkipped,
      message: `${toUpsert.length} registrations synced from platform API${lockedSkipped ? ` (${lockedSkipped} skipped — manually edited)` : ''}`,
    })
  }

  return json(400, { error: 'Invalid action — use "preview" or "apply"' })
})
