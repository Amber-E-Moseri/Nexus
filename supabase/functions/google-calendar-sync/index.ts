import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  withRetry,
  throwIfErrorResponse,
  NonRetryableError,
  MaxRetriesExceededError,
  GCAL_RETRY_OPTIONS,
} from '../_shared/retryWithBackoff.ts'

const ALLOWED_ORIGIN           = Deno.env.get('ALLOWED_ORIGIN') ?? ''
const GOOGLE_CLIENT_ID         = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET     = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN || '*',
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

// ── Dead-letter: record a failure after all retries are exhausted ─────────────

async function recordSyncFailure(opts: {
  userId?:        string | null
  spaceId?:       string | null
  orgId?:         string | null
  eventId?:       string | null
  googleEventId?: string | null
  errorCode?:     number | null
  errorMessage:   string
  payload:        Record<string, unknown>
  retryCount:     number
}) {
  const supabase = adminClient()
  const { error } = await supabase.from('sync_failures').insert({
    user_id:         opts.userId        ?? null,
    space_id:        opts.spaceId       ?? null,
    org_id:          opts.orgId         ?? null,
    event_id:        opts.eventId       ?? null,
    google_event_id: opts.googleEventId ?? null,
    error_code:      opts.errorCode     ?? null,
    error_message:   opts.errorMessage,
    payload:         opts.payload,
    retry_count:     opts.retryCount,
    last_retried_at: new Date().toISOString(),
  })
  if (error) {
    console.error('[sync_failures] Failed to insert dead-letter record:', error.message)
  }
}

// ── Mark a user/space token as needing re-auth ────────────────────────────────

async function markTokenNeedsReauth(userId: string | null, spaceId?: string, orgId?: string) {
  const supabase = adminClient()
  if (userId) {
    await supabase
      .from('google_calendar_tokens')
      .update({ needs_reauth: true })
      .eq('user_id', userId)
  }
  if (spaceId && orgId) {
    await supabase
      .from('google_calendar_sync')
      .update({ sync_enabled: false, needs_reauth: true })
      .eq('space_id', spaceId)
      .eq('org_id', orgId)
  }
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

  // Refresh — not wrapped in withRetry: a 4xx means the token is revoked
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 400) {
      await markTokenNeedsReauth(userId)
    }
    return null
  }

  const tokens = await res.json()
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase
    .from('google_calendar_tokens')
    .update({ access_token: tokens.access_token, token_expiry: newExpiry })
    .eq('user_id', userId)

  return tokens.access_token
}

function toGCalDateTime(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}:00`
}

// ── Space-level token helpers ─────────────────────────────────────────────────

async function getValidSpaceToken(orgId: string, spaceId: string): Promise<{
  access_token:       string
  google_calendar_id: string
  sync_direction:     string
} | null> {
  const supabase = adminClient()
  const { data: row } = await supabase
    .from('google_calendar_sync')
    .select('google_access_token, google_refresh_token, token_expires_at, google_calendar_id, sync_direction, sync_enabled')
    .eq('org_id', orgId)
    .eq('space_id', spaceId)
    .single()

  if (!row || !row.sync_enabled) return null

  const expiry = row.token_expires_at ? new Date(row.token_expires_at) : new Date(0)
  if (expiry.getTime() - Date.now() > 60_000) {
    return { access_token: row.google_access_token, google_calendar_id: row.google_calendar_id, sync_direction: row.sync_direction }
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.google_refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 400) {
      await markTokenNeedsReauth(null, spaceId, orgId)
    }
    return null
  }

  const tokens = await res.json()
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase
    .from('google_calendar_sync')
    .update({ google_access_token: tokens.access_token, token_expires_at: newExpiry, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('space_id', spaceId)

  return { access_token: tokens.access_token, google_calendar_id: row.google_calendar_id, sync_direction: row.sync_direction }
}

async function exchangeCodeForSpace(payload: Record<string, string>) {
  const { code, redirect_uri, org_id, space_id, user_id } = payload
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type:    'authorization_code',
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
    .from('google_calendar_sync')
    .upsert({
      org_id,
      space_id,
      google_calendar_id:   'primary',
      google_access_token:  tokens.access_token,
      google_refresh_token: tokens.refresh_token,
      token_expires_at:     expiry,
      sync_enabled:         true,
      needs_reauth:         false,
      sync_direction:       'both',
      connected_by:         user_id,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'org_id,space_id,google_calendar_id' })

  if (error) return json(500, { error: error.message })
  return json(200, { success: true })
}

function toDateOnlyOrDateTime(iso: string, allDay: boolean): Record<string, string> {
  return allDay ? { date: iso.slice(0, 10) } : { dateTime: iso, timeZone: 'America/Toronto' }
}

// ── gcalFetch: wraps fetch with retry/backoff ─────────────────────────────────

async function gcalFetch(url: string, init: RequestInit): Promise<Response> {
  return withRetry(
    async () => {
      const res  = await fetch(url, init)
      const body = res.ok ? undefined : await res.text()
      throwIfErrorResponse(res, body)
      return res
    },
    GCAL_RETRY_OPTIONS,
  )
}

// ── syncSpaceCalendar ─────────────────────────────────────────────────────────

async function syncSpaceCalendar(payload: Record<string, string>) {
  const { org_id, space_id } = payload
  if (!org_id || !space_id) return json(400, { error: 'org_id and space_id are required' })

  const syncStart    = Date.now()
  const supabase     = adminClient()
  const failureCtx   = { org_id, space_id }

  const token = await getValidSpaceToken(org_id, space_id)
  if (!token) return json(401, { error: 'reauth_required' })

  const calId   = encodeURIComponent(token.google_calendar_id)
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`
  const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }

  let created = 0
  let updated = 0
  let pulled  = 0

  // ── PUSH: local approved events → Google ──────────────────────────────────
  if (token.sync_direction === 'to_google' || token.sync_direction === 'both') {
    const { data: pending } = await supabase
      .from('calendar_events')
      .select('id, title, description, start_date, end_date, all_day, google_event_id, synced_from_google')
      .eq('space_id', space_id)
      .eq('status', 'approved')
      .eq('synced_to_google', false)
      .eq('synced_from_google', false)

    for (const ev of pending ?? []) {
      const body = {
        summary:     ev.title,
        description: ev.description ?? '',
        start: toDateOnlyOrDateTime(ev.start_date, ev.all_day),
        end:   toDateOnlyOrDateTime(ev.end_date ?? ev.start_date, ev.all_day),
      }

      try {
        if (ev.google_event_id) {
          await gcalFetch(`${baseUrl}/${ev.google_event_id}`, {
            method: 'PATCH', headers, body: JSON.stringify(body),
          })
          updated++
        } else {
          const res         = await gcalFetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(body) })
          const created_ev  = await res.json()
          await supabase.from('calendar_events').update({ google_event_id: created_ev.id }).eq('id', ev.id)
          created++
        }

        await supabase
          .from('calendar_events')
          .update({ synced_to_google: true, last_sync_at: new Date().toISOString() })
          .eq('id', ev.id)

      } catch (err) {
        const errorCode  = err instanceof NonRetryableError ? err.statusCode : null
        const retryCount = err instanceof MaxRetriesExceededError ? GCAL_RETRY_OPTIONS.maxRetries : 0

        console.error(`[google-calendar-sync] Push failed for event ${ev.id}:`, String(err))

        if (errorCode === 401 || errorCode === 403) {
          await markTokenNeedsReauth(null, space_id, org_id)
          break // Token is bad — stop the push loop
        }

        await recordSyncFailure({
          spaceId:       space_id,
          orgId:         org_id,
          eventId:       ev.id,
          googleEventId: ev.google_event_id ?? null,
          errorCode,
          errorMessage:  String(err),
          payload:       { action: ev.google_event_id ? 'patch' : 'create', event: ev, ...failureCtx },
          retryCount,
        })

        await supabase.rpc('notify_sync_failure', {
          p_space_id:      space_id,
          p_error_message: String(err),
        })
      }
    }
  }

  // ── PULL: Google → local calendar_events ──────────────────────────────────
  if (token.sync_direction === 'from_google' || token.sync_direction === 'both') {
    const params = new URLSearchParams({
      timeMin:      new Date(Date.now() - 30  * 86_400_000).toISOString(),
      timeMax:      new Date(Date.now() + 365 * 86_400_000).toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '250',
    })

    try {
      const res  = await gcalFetch(`${baseUrl}?${params}`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      })
      const data = await res.json()

      for (const item of data.items ?? []) {
        if (item.status === 'cancelled') continue
        const startObj   = item.start as Record<string, string>
        const endObj     = item.end   as Record<string, string>
        const allDay     = !startObj.dateTime
        const start_date = startObj.dateTime ?? startObj.date
        const end_date   = endObj.dateTime   ?? endObj.date

        const { data: existing } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('google_event_id', item.id)
          .eq('space_id', space_id)
          .maybeSingle()

        if (existing) {
          await supabase
            .from('calendar_events')
            .update({
              title:              item.summary ?? '(no title)',
              description:        item.description ?? null,
              start_date,
              end_date,
              all_day:            allDay,
              synced_from_google: true,
              last_sync_at:       new Date().toISOString(),
            })
            .eq('id', existing.id)
        } else {
          await supabase.from('calendar_events').insert({
            title:              item.summary ?? '(no title)',
            description:        item.description ?? null,
            event_type:         'event',
            start_date,
            end_date,
            all_day:            allDay,
            space_id,
            status:             'approved',
            google_event_id:    item.id,
            google_calendar_id: token.google_calendar_id,
            synced_from_google: true,
            synced_to_google:   true,
            last_sync_at:       new Date().toISOString(),
          })
        }
        pulled++
      }
    } catch (err) {
      const errorCode  = err instanceof NonRetryableError ? err.statusCode : null
      const retryCount = err instanceof MaxRetriesExceededError ? GCAL_RETRY_OPTIONS.maxRetries : 0

      console.error('[google-calendar-sync] Pull (list events) failed:', String(err))

      if (errorCode === 401 || errorCode === 403) {
        await markTokenNeedsReauth(null, space_id, org_id)
      }

      await recordSyncFailure({
        spaceId:      space_id,
        orgId:        org_id,
        errorCode,
        errorMessage: String(err),
        payload:      { action: 'list_events', params: Object.fromEntries(params), ...failureCtx },
        retryCount,
      })

      await supabase.rpc('notify_sync_failure', {
        p_space_id:      space_id,
        p_error_message: String(err),
      })
    }
  }

  // ── Finalise ───────────────────────────────────────────────────────────────
  const durationMs = Date.now() - syncStart

  await supabase
    .from('google_calendar_sync')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('org_id', org_id)
    .eq('space_id', space_id)

  await supabase.rpc('log_calendar_sync_attempt', {
    p_status:         'success',
    p_synced_events:  pulled + created + updated,
    p_created_events: created,
    p_updated_events: updated,
  })

  console.log(
    `[google-calendar-sync] sync_space_calendar complete — ` +
    `org=${org_id} space=${space_id} ` +
    `created=${created} updated=${updated} pulled=${pulled} ` +
    `duration=${durationMs}ms`
  )

  return json(200, { created, updated, pulled, duration_ms: durationMs })
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function exchangeCode(payload: Record<string, string>) {
  const { code, redirect_uri, user_id } = payload
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri,
      grant_type:    'authorization_code',
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
      access_token:       tokens.access_token,
      refresh_token:      tokens.refresh_token,
      token_expiry:       expiry,
      google_calendar_id: 'primary',
      needs_reauth:       false,
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
  const { user_id, schedule_id, title, scheduled_date, start_time, end_time, description } = payload
  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  let res: Response
  try {
    res = await gcalFetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary:     title,
          description: description ?? '',
          start: { dateTime: toGCalDateTime(scheduled_date, start_time), timeZone: 'America/Toronto' },
          end:   { dateTime: toGCalDateTime(scheduled_date, end_time),   timeZone: 'America/Toronto' },
        }),
      },
    )
  } catch (err) {
    if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
      await markTokenNeedsReauth(user_id)
    }
    await recordSyncFailure({
      userId:       user_id,
      errorCode:    err instanceof NonRetryableError ? err.statusCode : null,
      errorMessage: String(err),
      payload:      { action: 'create_event', schedule_id, title, scheduled_date, start_time, end_time },
      retryCount:   err instanceof MaxRetriesExceededError ? GCAL_RETRY_OPTIONS.maxRetries : 0,
    })
    return json(500, { error: String(err) })
  }

  const event = await res.json()
  if (schedule_id) {
    await adminClient().from('task_schedule').update({ google_event_id: event.id }).eq('id', schedule_id)
  }
  return json(200, { google_event_id: event.id })
}

async function updateEvent(payload: Record<string, string>) {
  const { user_id, google_event_id, title, scheduled_date, start_time, end_time } = payload
  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  try {
    await gcalFetch(
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
  } catch (err) {
    if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
      await markTokenNeedsReauth(user_id)
    }
    return json(err instanceof NonRetryableError ? err.statusCode : 500, { error: String(err) })
  }

  return json(200, { success: true })
}

async function deleteEvent(payload: Record<string, string>) {
  const { user_id, google_event_id } = payload
  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  try {
    await gcalFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` } },
    )
  } catch (err) {
    // 410 Gone = already deleted on Google's side — treat as success
    if (err instanceof NonRetryableError && err.statusCode === 410) return json(200, { success: true })
    if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
      await markTokenNeedsReauth(user_id)
    }
    return json(err instanceof NonRetryableError ? err.statusCode : 500, { error: String(err) })
  }

  return json(200, { success: true })
}

async function listExternalEvents(payload: Record<string, string>) {
  const { user_id, date_min, date_max } = payload
  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  const params = new URLSearchParams({
    timeMin:      `${date_min}T00:00:00-05:00`,
    timeMax:      `${date_max}T23:59:59-05:00`,
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '50',
  })

  let res: Response
  try {
    res = await gcalFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    )
  } catch (err) {
    if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
      await markTokenNeedsReauth(user_id)
    }
    return json(err instanceof NonRetryableError ? err.statusCode : 500, { error: String(err) })
  }

  const data   = await res.json()
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
  const { org_event_id, title, description, start_date, end_date, action: eventAction } =
    payload as Record<string, string>

  const supabase = adminClient()
  const { data: orgConfig } = await supabase
    .from('org_calendar_config')
    .select('google_calendar_id')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (!orgConfig) return json(400, { error: 'Org calendar not configured' })

  const { data: orgToken } = await supabase
    .from('google_calendar_tokens')
    .select('access_token, refresh_token, token_expiry, user_id')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single()

  if (!orgToken) return json(401, { error: 'No org calendar token available' })

  const access_token = await getValidToken(orgToken.user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  const calId   = encodeURIComponent(orgConfig.google_calendar_id)
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`
  const headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }

  if (eventAction === 'create') {
    let res: Response
    try {
      res = await gcalFetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          summary:     title,
          description,
          start: { date: start_date },
          end:   { date: end_date ?? start_date },
        }),
      })
    } catch (err) {
      return json(err instanceof NonRetryableError ? err.statusCode : 500, { error: String(err) })
    }
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
    try {
      await gcalFetch(`${baseUrl}/${existing.google_event_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ summary: title, description, start: { date: start_date }, end: { date: end_date ?? start_date } }),
      })
    } catch (err) {
      return json(err instanceof NonRetryableError ? err.statusCode : 500, { error: String(err) })
    }
    return json(200, { google_event_id: existing.google_event_id })
  }

  if (eventAction === 'delete') {
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('google_event_id')
      .eq('id', org_event_id)
      .single()
    if (existing?.google_event_id) {
      try {
        await gcalFetch(`${baseUrl}/${existing.google_event_id}`, { method: 'DELETE', headers })
      } catch (err) {
        if (!(err instanceof NonRetryableError && err.statusCode === 410)) {
          return json(err instanceof NonRetryableError ? err.statusCode : 500, { error: String(err) })
        }
      }
    }
    return json(200, { success: true })
  }

  return json(400, { error: `Unknown event action: ${eventAction}` })
}

// ── Auto-sync (cron) ──────────────────────────────────────────────────────────

async function runAutoSync(): Promise<void> {
  const runId    = crypto.randomUUID().slice(0, 8)
  const runStart = Date.now()
  console.log(`[auto-sync][${runId}] Starting scheduled run at ${new Date().toISOString()}`)

  const supabase = adminClient()

  const { data: configs, error: fetchError } = await supabase
    .from('google_calendar_sync')
    .select('org_id, space_id')
    .eq('sync_enabled', true)

  if (fetchError) {
    console.error(`[auto-sync][${runId}] Failed to fetch sync configs:`, fetchError.message)
    return
  }

  if (!configs || configs.length === 0) {
    console.log(`[auto-sync][${runId}] No enabled sync configs found — skipping`)
    return
  }

  console.log(`[auto-sync][${runId}] Processing ${configs.length} sync config(s)`)

  let succeeded = 0
  let failed    = 0

  for (const config of configs) {
    const label = `org=${config.org_id} space=${config.space_id}`
    try {
      console.log(`[auto-sync][${runId}] Syncing ${label}`)
      await syncSpaceCalendar({ org_id: config.org_id, space_id: config.space_id })
      console.log(`[auto-sync][${runId}] Sync succeeded for ${label}`)
      succeeded++
    } catch (err) {
      console.error(`[auto-sync][${runId}] Sync failed for ${label}:`, String(err))
      failed++
    }
  }

  const duration = ((Date.now() - runStart) / 1000).toFixed(1)
  console.log(
    `[auto-sync][${runId}] Run complete at ${new Date().toISOString()} — ` +
    `succeeded=${succeeded} failed=${failed} duration=${duration}s`
  )
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
      case 'exchange_code':           return await exchangeCode(payload as Record<string, string>)
      case 'exchange_code_space':     return await exchangeCodeForSpace(payload as Record<string, string>)
      case 'refresh_token':           return await refreshToken(payload as Record<string, string>)
      case 'create_event':            return await createEvent(payload as Record<string, string>)
      case 'update_event':            return await updateEvent(payload as Record<string, string>)
      case 'delete_event':            return await deleteEvent(payload as Record<string, string>)
      case 'list_external_events':    return await listExternalEvents(payload as Record<string, string>)
      case 'sync_org_calendar_event': return await syncOrgCalendarEvent(payload)
      case 'sync_space_calendar':     return await syncSpaceCalendar(payload as Record<string, string>)
      default:                        return json(400, { error: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error('[google-calendar-sync]', err)
    return json(500, { error: String(err) })
  }
})

// ── 15-minute auto-sync cron ──────────────────────────────────────────────────

if (Deno.env.get('ENABLE_AUTO_SYNC') === 'true') {
  Deno.cron('google-calendar-auto-sync', '*/15 * * * *', async () => {
    try {
      await runAutoSync()
    } catch (err) {
      console.error('[auto-sync] Unhandled error in cron handler:', String(err))
    }
  })
}
