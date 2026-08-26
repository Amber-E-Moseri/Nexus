// Fallback for saving a single flight field (arrival/departure date, time, or flight
// number), or the manually_confirmed flag, when the direct client-side update is
// silently blocked by RLS.
//
// Why this exists: registrations' UPDATE policies (super_admin_update_flights,
// registration_event_team_update) look correct on paper, but a stale/missing JWT role
// claim, or a caller who only qualifies via the sprint-team-membership branch, can
// cause Postgres RLS to filter the row out of the UPDATE's USING clause. Supabase-js
// does NOT treat that as an error — `.update()` without `.select()` returns
// `{ error: null }` even when zero rows were actually touched, so the UI shows a
// successful save and then "reverts" once the optimistic local state is later
// overwritten by a real refetch. This mirrors the existing clear-flight fallback
// pattern, but (unlike clear-flight) actually checks the caller's permission before
// using the service role to bypass RLS, rather than accepting any anon-keyed request.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Must match FLIGHT_FIELD_TO_DB's values in RegistrationEcosystem.jsx
const FLIGHT_FIELDS = new Set([
  'arrival_date', 'arrival_time', 'arrival_flight',
  'departure_date', 'departure_time', 'departure_flight',
])

// manually_confirmed and flight_manual_override (the sync-protection lock, toggled
// directly via handleToggleFlightLock/RegistrationEditModal without editing a flight
// field) hit this same silent-RLS-no-op failure mode — reuse this fallback rather than
// standing up near-identical functions for two boolean columns.
const ALLOWED_FIELDS = new Set([...FLIGHT_FIELDS, 'manually_confirmed', 'flight_manual_override'])

const PRIVILEGED_ROLES = new Set(['super_admin', 'regional_secretary', 'dept_lead', 'pastor'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: 'Missing required environment variables' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(401, { error: 'Missing authorization header' })

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: userError } = await authClient.auth.getUser()
  if (userError || !user) return json(401, { error: 'Unable to validate caller' })

  const serviceClient = createClient(supabaseUrl, serviceKey)

  // Same permission surface as the registrations UPDATE RLS policies, checked here
  // explicitly since we're about to use the service role to bypass RLS entirely.
  const { data: profile } = await serviceClient.from('users').select('role').eq('id', user.id).maybeSingle()
  let allowed = PRIVILEGED_ROLES.has(profile?.role)

  if (!allowed) {
    const { data: grant } = await serviceClient
      .from('user_grants')
      .select('id')
      .eq('user_id', user.id)
      .eq('grant_type', 'registration_full_access')
      .maybeSingle()
    allowed = !!grant
  }

  if (!allowed) {
    const { data: teamRows } = await serviceClient
      .from('sprint_team_members')
      .select('team_id')
      .eq('user_id', user.id)
    const teamIds = (teamRows || []).map((r: { team_id: string }) => r.team_id)
    if (teamIds.length > 0) {
      const { data: teams } = await serviceClient
        .from('sprint_teams')
        .select('name, sprint_id')
        .in('id', teamIds)
      const sprintIds = [...new Set((teams || []).map((t: { sprint_id: string }) => t.sprint_id))]
      const relevantTeamNames = (teams || [])
        .filter((t: { name: string }) => /registration|program|secretariat/i.test(t.name))
        .map((t: { sprint_id: string }) => t.sprint_id)
      if (relevantTeamNames.length > 0 && sprintIds.length > 0) {
        const { data: sprints } = await serviceClient
          .from('sprints')
          .select('id, name')
          .in('id', sprintIds)
        allowed = (sprints || []).some(
          (s: { id: string; name: string }) =>
            relevantTeamNames.includes(s.id) && /this is it 2\.0/i.test(s.name),
        )
      }
    }
  }

  if (!allowed) return json(403, { error: 'Not permitted to edit this registration' })

  const body = (await req.json().catch(() => null)) as { email?: string; field?: string; value?: string | boolean | null } | null
  if (!body?.email || !body.field || !ALLOWED_FIELDS.has(body.field)) {
    return json(400, { error: 'email and a valid field are required' })
  }

  const isFlightField = FLIGHT_FIELDS.has(body.field)
  const updatePayload = isFlightField
    ? { [body.field]: body.value || null, flight_manual_override: true }
    : { [body.field]: !!body.value }

  const { data, error } = await serviceClient
    .from('registrations')
    .update(updatePayload)
    .eq('email', body.email.toLowerCase())
    .select('email')

  if (error) return json(500, { error: error.message })
  if (!data || data.length === 0) return json(404, { error: 'No registration found for that email' })

  return json(200, { success: true, email: data[0].email })
})
