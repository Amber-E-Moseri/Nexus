import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

// ── Token helpers ─────────────────────────────────────────────────────────────

async function getValidToken(userId: string): Promise<string | null> {
  const supabase = adminClient()
  const { data: row } = await supabase
    .from('google_calendar_tokens')
    .select('access_token, refresh_token, token_expiry')
    .eq('user_id', userId)
    .single()

  if (!row) return null

  const expiry = new Date(row.token_expiry)
  if (expiry.getTime() - Date.now() > 60_000) return row.access_token

  // Refresh
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) return null

  const tokens = await res.json()
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase
    .from('google_calendar_tokens')
    .update({ access_token: tokens.access_token, token_expiry: newExpiry })
    .eq('user_id', userId)

  return tokens.access_token
}

function toGCalDateTime(date: string, time: string): string {
  // date = 'YYYY-MM-DD', time = 'HH:MM:SS'
  return `${date}T${time.slice(0, 5)}:00`
}

// ── Action handlers ──────────────────────────────────────────────────────────

async function exchangeCode(payload: Record<string, string>) {
  const { code, redirect_uri, user_id } = payload
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return json(400, { error: `Token exchange failed: ${err}` })
  }

  const tokens = await res.json()
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const supabase = adminClient()
  const { error } = await supabase
    .from('google_calendar_tokens')
    .upsert({
      user_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      google_calendar_id: 'primary',
    }, { onConflict: 'user_id' })

  if (error) return json(500, { error: error.message })
  return json(200, { success: true, calendar_id: 'primary' })
}

async function refreshToken(payload: Record<string, string>) {
  const access_token = await getValidToken(payload.user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })
  return json(200, { access_token })
}

async function createEvent(payload: Record<string, string>) {
  const { user_id, schedule_id, task_id, title, scheduled_date, start_time, end_time, description } = payload
  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        description: description ?? '',
        start: { dateTime: toGCalDateTime(scheduled_date, start_time), timeZone: 'America/Toronto' },
        end:   { dateTime: toGCalDateTime(scheduled_date, end_time),   timeZone: 'America/Toronto' },
      }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    return json(res.status, { error: err })
  }

  const event = await res.json()
  const google_event_id = event.id

  // Persist back to task_schedule
  if (schedule_id) {
    await adminClient()
      .from('task_schedule')
      .update({ google_event_id })
      .eq('id', schedule_id)
  }

  return json(200, { google_event_id })
}

async function updateEvent(payload: Record<string, string>) {
  const { user_id, google_event_id, title, scheduled_date, start_time, end_time } = payload
  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        start: { dateTime: toGCalDateTime(scheduled_date, start_time), timeZone: 'America/Toronto' },
        end:   { dateTime: toGCalDateTime(scheduled_date, end_time),   timeZone: 'America/Toronto' },
      }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    return json(res.status, { error: err })
  }
  return json(200, { success: true })
}

async function deleteEvent(payload: Record<string, string>) {
  const { user_id, google_event_id } = payload
  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` } },
  )

  if (!res.ok && res.status !== 410) {
    const err = await res.text()
    return json(res.status, { error: err })
  }
  return json(200, { success: true })
}

async function listExternalEvents(payload: Record<string, string>) {
  const { user_id, date_min, date_max } = payload
  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  const params = new URLSearchParams({
    timeMin: `${date_min}T00:00:00-05:00`,
    timeMax: `${date_max}T23:59:59-05:00`,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${access_token}` } },
  )

  if (!res.ok) {
    const err = await res.text()
    return json(res.status, { error: err })
  }

  const data = await res.json()
  const events = (data.items ?? []).map((item: Record<string, unknown>) => {
    const startObj = item.start as Record<string, string>
    const endObj   = item.end   as Record<string, string>
    return {
      google_event_id: item.id,
      title: item.summary ?? '(no title)',
      start: startObj.dateTime ?? startObj.date,
      end:   endObj.dateTime   ?? endObj.date,
      is_external: true,
    }
  })

  return json(200, { events })
}

async function syncOrgCalendarEvent(payload: Record<string, unknown>) {
  const { org_event_id, title, description, start_date, end_date, action: eventAction } = payload as Record<string, string>

  const supabase = adminClient()
  const { data: orgConfig } = await supabase
    .from('org_calendar_config')
    .select('google_calendar_id')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (!orgConfig) return json(400, { error: 'Org calendar not configured' })

  // For org calendar, we use a stored org token (access via the first super_admin token)
  // In production, use a dedicated service account token instead
  const { data: orgToken } = await supabase
    .from('google_calendar_tokens')
    .select('access_token, refresh_token, token_expiry, user_id')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (!orgToken) return json(401, { error: 'No org calendar token available' })

  const access_token = await getValidToken(orgToken.user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  const calId = encodeURIComponent(orgConfig.google_calendar_id)
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`
  const headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }

  if (eventAction === 'create') {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        summary: title,
        description,
        start: { date: start_date },
        end:   { date: end_date ?? start_date },
      }),
    })
    if (!res.ok) return json(res.status, { error: await res.text() })
    const event = await res.json()
    if (org_event_id) {
      await supabase.from('calendar_events').update({ google_event_id: event.id }).eq('id', org_event_id)
    }
    return json(200, { google_event_id: event.id })
  }

  if (eventAction === 'update') {
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('google_event_id')
      .eq('id', org_event_id)
      .single()
    if (!existing?.google_event_id) return json(404, { error: 'No google_event_id on record' })
    const res = await fetch(`${baseUrl}/${existing.google_event_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ summary: title, description, start: { date: start_date }, end: { date: end_date ?? start_date } }),
    })
    if (!res.ok) return json(res.status, { error: await res.text() })
    return json(200, { google_event_id: existing.google_event_id })
  }

  if (eventAction === 'delete') {
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('google_event_id')
      .eq('id', org_event_id)
      .single()
    if (existing?.google_event_id) {
      await fetch(`${baseUrl}/${existing.google_event_id}`, { method: 'DELETE', headers })
    }
    return json(200, { success: true })
  }

  return json(400, { error: `Unknown event action: ${eventAction}` })
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  let body: { action: string; payload: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const { action, payload } = body

  try {
    switch (action) {
      case 'exchange_code':          return await exchangeCode(payload as Record<string, string>)
      case 'refresh_token':          return await refreshToken(payload as Record<string, string>)
      case 'create_event':           return await createEvent(payload as Record<string, string>)
      case 'update_event':           return await updateEvent(payload as Record<string, string>)
      case 'delete_event':           return await deleteEvent(payload as Record<string, string>)
      case 'list_external_events':   return await listExternalEvents(payload as Record<string, string>)
      case 'sync_org_calendar_event': return await syncOrgCalendarEvent(payload)
      default:                       return json(400, { error: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error('[google-calendar-sync]', err)
    return json(500, { error: String(err) })
  }
})
