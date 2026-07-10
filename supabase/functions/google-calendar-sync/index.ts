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
// NOTE: previously inserted an `org_id` key that was never a real column on
// sync_failures — every call silently failed (console.error'd, never
// surfaced). Fixed: dropped org_id/spaceId, added sourceId.

async function recordSyncFailure(opts: {
  userId?:        string | null
  sourceId?:      string | null
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
    source_id:       opts.sourceId      ?? null,
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

// ── Mark a personal token as needing re-auth ──────────────────────────────────

async function markTokenNeedsReauth(userId: string | null) {
  if (!userId) return
  const supabase = adminClient()
  await supabase
    .from('google_calendar_tokens')
    .update({ needs_reauth: true })
    .eq('user_id', userId)
}

// ── Mark the shared ministry calendar connection as needing re-auth ────────────

async function markConnectionNeedsReauth() {
  const supabase = adminClient()
  await supabase
    .from('ministry_calendar_connection')
    .update({ needs_reauth: true })
    .not('id', 'is', null)
}

// ── Retry after refresh: attempt refresh on 401/403, retry once if successful ──

async function retryAfterRefresh(
  userId: string,
  originalRequest: () => Promise<Response>
): Promise<Response> {
  // Attempt to refresh the token
  const refreshedToken = await getValidToken(userId)

  if (!refreshedToken) {
    // Refresh failed — mark as needing re-auth and abort
    await markTokenNeedsReauth(userId)
    throw new NonRetryableError('Token refresh failed and user re-auth required', 401)
  }

  // Refresh succeeded — retry the original request once
  return await originalRequest()
}

// ── Personal-path token helpers (alive, unrelated to Ministry Calendar sources) ─

async function getValidToken(userId: string): Promise<string | null> {
  const supabase = adminClient()
  const { data: row } = await supabase
    .from('google_calendar_tokens')
    .select('access_token_vault_id, refresh_token_vault_id, token_expiry')
    .eq('user_id', userId)
    .single()

  if (!row) return null

  const expiry = new Date(row.token_expiry)
  if (expiry.getTime() - Date.now() > 60_000) {
    // Token still valid — decrypt and return access token from Vault
    const { data: accessToken, error } = await supabase
      .rpc('vault_get_secret', { secret_id: row.access_token_vault_id })
    if (error || !accessToken) {
      console.error('Failed to retrieve access token from vault:', error)
      return null
    }
    return accessToken
  }

  // Token expired — refresh it
  // First, get refresh token from Vault
  const { data: refreshToken, error: refreshError } = await supabase
    .rpc('vault_get_secret', { secret_id: row.refresh_token_vault_id })
  if (refreshError || !refreshToken) {
    console.error('Failed to retrieve refresh token from vault:', refreshError)
    await markTokenNeedsReauth(userId)
    return null
  }

  // Refresh — not wrapped in withRetry: a 4xx means the token is revoked
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
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

  // Store new access token in Vault
  const { data: newVaultId, error: vaultError } = await supabase
    .rpc('vault_create_secret', {
      secret_name: `google_calendar_access_${userId}`,
      secret_value: tokens.access_token,
    })
  if (vaultError || !newVaultId) {
    console.error('Failed to store new access token in vault:', vaultError)
    return null
  }

  // Update token_expiry and vault reference
  await supabase
    .from('google_calendar_tokens')
    .update({ access_token_vault_id: newVaultId, token_expiry: newExpiry })
    .eq('user_id', userId)

  return tokens.access_token
}

function toGCalDateTime(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}:00`
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

// ── Ministry Calendar shared connection (singleton) ───────────────────────────
// One Google account connection covers all sources (Birthdays/Holidays/main
// org calendar/etc are all visible via that account's calendarList), so
// sources don't each need their own OAuth dance.

async function getValidConnectionToken(): Promise<string | null> {
  const supabase = adminClient()
  const { data: row } = await supabase
    .from('ministry_calendar_connection')
    .select('access_token_vault_id, refresh_token_vault_id, token_expiry')
    .single()

  if (!row) return null

  const expiry = new Date(row.token_expiry)
  if (expiry.getTime() - Date.now() > 60_000) {
    // Token still valid — decrypt and return access token from Vault
    const { data: accessToken, error } = await supabase
      .rpc('vault_get_secret', { secret_id: row.access_token_vault_id })
    if (error || !accessToken) {
      console.error('Failed to retrieve ministry connection access token from vault:', error)
      return null
    }
    return accessToken
  }

  // Token expired — refresh it
  // First, get refresh token from Vault
  const { data: refreshToken, error: refreshError } = await supabase
    .rpc('vault_get_secret', { secret_id: row.refresh_token_vault_id })
  if (refreshError || !refreshToken) {
    console.error('Failed to retrieve ministry connection refresh token from vault:', refreshError)
    await markConnectionNeedsReauth()
    return null
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    await markConnectionNeedsReauth()
    return null
  }

  const tokens    = await res.json()
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Store new access token in Vault
  const { data: newVaultId, error: vaultError } = await supabase
    .rpc('vault_create_secret', {
      secret_name: 'google_calendar_ministry_access',
      secret_value: tokens.access_token,
    })
  if (vaultError || !newVaultId) {
    console.error('Failed to store new ministry connection access token in vault:', vaultError)
    return null
  }

  // Update token_expiry and vault reference
  await supabase
    .from('ministry_calendar_connection')
    .update({ access_token_vault_id: newVaultId, token_expiry: newExpiry, updated_at: new Date().toISOString() })
    .not('id', 'is', null)

  return tokens.access_token
}

async function exchangeCodeForConnection(payload: Record<string, string>) {
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

  // Store tokens in Vault (never in plaintext)
  const { data: accessVaultId, error: accessVaultError } = await supabase
    .rpc('vault_create_secret', {
      secret_name: 'google_calendar_ministry_access',
      secret_value: tokens.access_token,
    })
  if (accessVaultError || !accessVaultId) {
    return json(500, { error: `Failed to store access token in vault: ${accessVaultError?.message}` })
  }

  const { data: refreshVaultId, error: refreshVaultError } = await supabase
    .rpc('vault_create_secret', {
      secret_name: 'google_calendar_ministry_refresh',
      secret_value: tokens.refresh_token,
    })
  if (refreshVaultError || !refreshVaultId) {
    return json(500, { error: `Failed to store refresh token in vault: ${refreshVaultError?.message}` })
  }

  // True singleton, enforced by a UNIQUE ((true)) index — a partial/expression
  // index isn't usable as a PostgREST upsert onConflict target, so replace
  // the row outright. No concurrent admin OAuth flows are expected.
  await supabase.from('ministry_calendar_connection').delete().not('id', 'is', null)
  const { error } = await supabase.from('ministry_calendar_connection').insert({
    access_token_vault_id:  accessVaultId,
    refresh_token_vault_id: refreshVaultId,
    token_expiry:           expiry,
    connected_by:           user_id ?? null,
    secret_type:            'vault',
  })

  if (error) return json(500, { error: error.message })
  return json(200, { success: true })
}

async function listAvailableCalendars() {
  const access_token = await getValidConnectionToken()
  if (!access_token) return json(401, { error: 'reauth_required' })

  let res: Response
  try {
    res = await gcalFetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${access_token}` } },
    )
  } catch (err) {
    return json(err instanceof NonRetryableError ? err.statusCode : 500, { error: String(err) })
  }

  const data = await res.json()
  const calendars = (data.items ?? []).map((item: Record<string, unknown>) => ({
    id:               item.id,
    summary:          item.summary,
    background_color: item.backgroundColor ?? null,
    primary:          item.primary ?? false,
    access_role:      item.accessRole ?? null,
  }))

  return json(200, { calendars })
}

async function addSource(payload: Record<string, unknown>) {
  const { google_calendar_id, display_name, color, push_enabled, created_by } = payload as {
    google_calendar_id: string
    display_name:       string
    color?:             string | null
    push_enabled?:      boolean
    created_by?:        string | null
  }

  if (!google_calendar_id || !display_name) {
    return json(400, { error: 'google_calendar_id and display_name are required' })
  }

  const supabase = adminClient()
  const { data, error } = await supabase
    .from('ministry_calendar_sources')
    .insert({
      google_calendar_id,
      display_name,
      color:        color ?? null,
      push_enabled: push_enabled ?? false,
      created_by:   created_by ?? null,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation — either the one-push partial index or the
    // google_calendar_id uniqueness constraint.
    if (error.code === '23505') {
      return json(409, { error: 'Another source already has push enabled, or this calendar is already added.' })
    }
    return json(500, { error: error.message })
  }

  return json(200, { source: data })
}

async function updateSource(payload: Record<string, unknown>) {
  const { source_id, push_enabled, sync_enabled } = payload as {
    source_id:     string
    push_enabled?: boolean
    sync_enabled?: boolean
  }
  if (!source_id) return json(400, { error: 'source_id is required' })

  const updates: Record<string, boolean> = {}
  if (typeof push_enabled === 'boolean') updates.push_enabled = push_enabled
  if (typeof sync_enabled === 'boolean') updates.sync_enabled = sync_enabled
  if (Object.keys(updates).length === 0) return json(400, { error: 'Nothing to update' })

  const supabase = adminClient()
  const { data, error } = await supabase
    .from('ministry_calendar_sources')
    .update(updates)
    .eq('id', source_id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return json(409, { error: 'Another source already has push enabled — disable it there first.' })
    }
    return json(500, { error: error.message })
  }

  return json(200, { source: data })
}

async function removeSource(payload: Record<string, string>) {
  const { source_id } = payload
  if (!source_id) return json(400, { error: 'source_id is required' })

  const supabase = adminClient()
  const { error } = await supabase.from('ministry_calendar_sources').delete().eq('id', source_id)
  if (error) return json(500, { error: error.message })
  return json(200, { success: true })
}

// ── syncOneSource — pull/push for a single Ministry Calendar source ───────────

async function syncOneSource(payload: Record<string, string>) {
  const { source_id } = payload
  if (!source_id) return json(400, { error: 'source_id is required' })

  const syncStart = Date.now()
  const supabase  = adminClient()

  const { data: source } = await supabase
    .from('ministry_calendar_sources')
    .select('*')
    .eq('id', source_id)
    .single()

  if (!source) return json(404, { error: 'Source not found' })

  const access_token = await getValidConnectionToken()
  if (!access_token) return json(401, { error: 'reauth_required' })

  const calId   = encodeURIComponent(source.google_calendar_id)
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`
  const headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }

  let created = 0
  let updated = 0
  let pulled  = 0

  // ── PUSH: local, never-synced approved events → Google (primary source only) ──
  // Gated on source_id IS NULL (never touched by any sync — the unambiguous
  // discriminator) AND synced_to_google = false (don't re-push every run).
  if (source.push_enabled) {
    const { data: pending } = await supabase
      .from('calendar_events')
      .select('id, title, description, start_date, end_date, all_day, google_event_id')
      .is('source_id', null)
      .eq('status', 'approved')
      .eq('synced_to_google', false)
      .is('deleted_at', null)

    for (const ev of pending ?? []) {
      const body = {
        summary:     ev.title,
        description: ev.description ?? '',
        start: toDateOnlyOrDateTime(ev.start_date, ev.all_day),
        end:   toDateOnlyOrDateTime(ev.end_date ?? ev.start_date, ev.all_day),
      }

      try {
        if (ev.google_event_id) {
          // Outbound (Nexus → Google): Nexus always wins — no timestamp comparison, always push.
          // This is simple: Nexus is the source of truth for events not synced from Google.
          await gcalFetch(`${baseUrl}/${ev.google_event_id}`, { method: 'PATCH', headers, body: JSON.stringify(body) })
          updated++
        } else {
          const res        = await gcalFetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(body) })
          const created_ev = await res.json()
          await supabase.from('calendar_events').update({ google_event_id: created_ev.id }).eq('id', ev.id)
          created++
        }
        await supabase.from('calendar_events').update({ synced_to_google: true }).eq('id', ev.id)
      } catch (err) {
        const errorCode  = err instanceof NonRetryableError ? err.statusCode : null
        const retryCount = err instanceof MaxRetriesExceededError ? GCAL_RETRY_OPTIONS.maxRetries : 0

        console.error(`[google-calendar-sync] Push failed for event ${ev.id}:`, String(err))

        if (errorCode === 403) {
          // Google rejected the write — this source can't accept pushes
          // (e.g. it's actually read-only). Disable push and stop rather
          // than keep hammering it every event.
          await supabase.from('ministry_calendar_sources')
            .update({ is_read_only: true, push_enabled: false })
            .eq('id', source_id)
          await recordSyncFailure({
            sourceId: source_id, eventId: ev.id, googleEventId: ev.google_event_id ?? null,
            errorCode, errorMessage: String(err), payload: { action: 'push', event: ev }, retryCount,
          })
          await supabase.rpc('notify_sync_failure', { p_source_id: source_id, p_error_message: String(err) })
          break
        }

        await recordSyncFailure({
          sourceId: source_id, eventId: ev.id, googleEventId: ev.google_event_id ?? null,
          errorCode, errorMessage: String(err),
          payload: { action: ev.google_event_id ? 'patch' : 'create', event: ev }, retryCount,
        })
        await supabase.rpc('notify_sync_failure', { p_source_id: source_id, p_error_message: String(err) })
      }
    }

    // Push deletions: locally soft-deleted events that were previously pushed.
    const { data: toDelete } = await supabase
      .from('calendar_events')
      .select('id, google_event_id')
      .is('source_id', null)
      .not('deleted_at', 'is', null)
      .eq('synced_to_google', true)
      .not('google_event_id', 'is', null)

    for (const ev of toDelete ?? []) {
      try {
        await gcalFetch(`${baseUrl}/${ev.google_event_id}`, { method: 'DELETE', headers })
        await supabase.from('calendar_events').update({ synced_to_google: false, google_event_id: null }).eq('id', ev.id)
      } catch (err) {
        if (err instanceof NonRetryableError && err.statusCode === 410) {
          // Already gone on Google's side — treat as success.
          await supabase.from('calendar_events').update({ synced_to_google: false, google_event_id: null }).eq('id', ev.id)
          continue
        }
        console.error(`[google-calendar-sync] Delete-push failed for event ${ev.id}:`, String(err))
      }
    }
  }

  // ── PULL: Google → local calendar_events, tagged with this source ─────────
  const params = new URLSearchParams({
    timeMin:      new Date(Date.now() - 30  * 86_400_000).toISOString(),
    timeMax:      new Date(Date.now() + 365 * 86_400_000).toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '250',
  })

  const seenGoogleIds = new Set<string>()

  try {
    const res  = await gcalFetch(`${baseUrl}?${params}`, { headers: { Authorization: `Bearer ${access_token}` } })
    const data = await res.json()

    for (const item of data.items ?? []) {
      if (item.status === 'cancelled') continue
      seenGoogleIds.add(item.id)

      const startObj   = item.start as Record<string, string>
      const endObj     = item.end   as Record<string, string>
      const allDay     = !startObj.dateTime
      const start_date = startObj.dateTime ?? startObj.date
      const end_date   = endObj.dateTime   ?? endObj.date

      // Inbound (Google → Nexus): last-write-wins with Nexus as tiebreaker.
      // Only update if Google event is newer than the existing Nexus event.
      const googleUpdated = item.updated ? new Date(item.updated).getTime() : Date.now()
      const existingEvent = await supabase
        .from('calendar_events')
        .select('updated_at')
        .eq('source_id', source_id)
        .eq('google_event_id', item.id)
        .maybeSingle()

      // Skip if Nexus event is newer (or equal, giving Nexus the tiebreaker)
      if (existingEvent.data?.updated_at) {
        const nexusUpdated = new Date(existingEvent.data.updated_at).getTime()
        if (nexusUpdated >= googleUpdated) {
          pulled++ // Count it as pulled even though we skipped the update
          continue
        }
      }

      const { error: upsertError } = await supabase
        .from('calendar_events')
        .upsert({
          source_id,
          google_event_id:    item.id,
          title:              item.summary ?? '(no title)',
          description:        item.description ?? null,
          event_type:         'event',
          start_date,
          end_date,
          all_day:            allDay,
          status:             'approved',
          synced_from_google: true,
          deleted_at:         null,
        }, { onConflict: 'source_id,google_event_id' })

      if (upsertError) {
        console.error(`[google-calendar-sync] Pull upsert failed for ${item.id}:`, upsertError.message)
      } else {
        pulled++
      }
    }

    // Completeness check: soft-delete previously-synced events for this
    // source that no longer appear in the latest pull window.
    const { data: existingForSource } = await supabase
      .from('calendar_events')
      .select('id, google_event_id')
      .eq('source_id', source_id)
      .is('deleted_at', null)

    const staleIds = (existingForSource ?? [])
      .filter((e) => e.google_event_id && !seenGoogleIds.has(e.google_event_id))
      .map((e) => e.id)

    if (staleIds.length > 0) {
      await supabase.from('calendar_events').update({ deleted_at: new Date().toISOString() }).in('id', staleIds)
    }

  } catch (err) {
    const errorCode  = err instanceof NonRetryableError ? err.statusCode : null
    const retryCount = err instanceof MaxRetriesExceededError ? GCAL_RETRY_OPTIONS.maxRetries : 0

    console.error('[google-calendar-sync] Pull (list events) failed:', String(err))

    await recordSyncFailure({
      sourceId: source_id, errorCode, errorMessage: String(err),
      payload: { action: 'list_events', params: Object.fromEntries(params) }, retryCount,
    })
    await supabase.rpc('notify_sync_failure', { p_source_id: source_id, p_error_message: String(err) })

    await supabase.from('ministry_calendar_sources')
      .update({ last_sync_error: String(err) })
      .eq('id', source_id)

    return json(500, { error: String(err), created, updated, pulled })
  }

  const durationMs = Date.now() - syncStart

  await supabase.from('ministry_calendar_sources')
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
    .eq('id', source_id)

  console.log(
    `[google-calendar-sync] sync_one_source complete — source=${source_id} ` +
    `created=${created} updated=${updated} pulled=${pulled} duration=${durationMs}ms`
  )

  return json(200, { created, updated, pulled, duration_ms: durationMs })
}

// ── Personal-path action handlers (alive, unrelated to this phase) ───────────

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

  // Store tokens in Vault (never in plaintext)
  const { data: accessVaultId, error: accessVaultError } = await supabase
    .rpc('vault_create_secret', {
      secret_name: `google_calendar_access_${user_id}`,
      secret_value: tokens.access_token,
    })
  if (accessVaultError || !accessVaultId) {
    return json(500, { error: `Failed to store access token in vault: ${accessVaultError?.message}` })
  }

  const { data: refreshVaultId, error: refreshVaultError } = await supabase
    .rpc('vault_create_secret', {
      secret_name: `google_calendar_refresh_${user_id}`,
      secret_value: tokens.refresh_token,
    })
  if (refreshVaultError || !refreshVaultId) {
    return json(500, { error: `Failed to store refresh token in vault: ${refreshVaultError?.message}` })
  }

  // Delete existing row (upsert via unique user_id) and insert with vault references
  await supabase.from('google_calendar_tokens').delete().eq('user_id', user_id)
  const { error } = await supabase
    .from('google_calendar_tokens')
    .insert({
      user_id,
      access_token_vault_id:  accessVaultId,
      refresh_token_vault_id: refreshVaultId,
      token_expiry:           expiry,
      google_calendar_id:     'primary',
      needs_reauth:           false,
      secret_type:            'vault',
    })

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
      // On 401/403, attempt token refresh and retry once
      if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
        res = await retryAfterRefresh(user_id, async () =>
          gcalFetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${await getValidToken(user_id)}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                summary:     title,
                description: description ?? '',
                start: { dateTime: toGCalDateTime(scheduled_date, start_time), timeZone: 'America/Toronto' },
                end:   { dateTime: toGCalDateTime(scheduled_date, end_time),   timeZone: 'America/Toronto' },
              }),
            },
          )
        )
      } else {
        throw err
      }
    }
  } catch (err) {
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
      // On 401/403, attempt token refresh and retry once
      if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
        await retryAfterRefresh(user_id, async () =>
          gcalFetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`,
            {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${await getValidToken(user_id)}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                summary: title,
                start: { dateTime: toGCalDateTime(scheduled_date, start_time), timeZone: 'America/Toronto' },
                end:   { dateTime: toGCalDateTime(scheduled_date, end_time),   timeZone: 'America/Toronto' },
              }),
            },
          )
        )
      } else {
        throw err
      }
    }
  } catch (err) {
    return json(err instanceof NonRetryableError ? err.statusCode : 500, { error: String(err) })
  }

  return json(200, { success: true })
}

async function deleteEvent(payload: Record<string, string>) {
  const { user_id, google_event_id } = payload
  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  try {
    try {
      await gcalFetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${access_token}` } },
      )
    } catch (err) {
      // 410 Gone = already deleted on Google's side — treat as success
      if (err instanceof NonRetryableError && err.statusCode === 410) return json(200, { success: true })
      // On 401/403, attempt token refresh and retry once
      if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
        await retryAfterRefresh(user_id, async () =>
          gcalFetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${google_event_id}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${await getValidToken(user_id)}` } },
          )
        )
      } else {
        throw err
      }
    }
  } catch (err) {
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
    try {
      res = await gcalFetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      )
    } catch (err) {
      // On 401/403, attempt token refresh and retry once
      if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
        res = await retryAfterRefresh(user_id, async () =>
          gcalFetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
            { headers: { Authorization: `Bearer ${await getValidToken(user_id)}` } },
          )
        )
      } else {
        throw err
      }
    }
  } catch (err) {
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

// ── sync_my_tasks: push a user's assigned + followed tasks as all-day events ──

function addOneDay(dateOnly: string): string {
  const d = new Date(`${dateOnly}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function putTaskEvent(
  userId: string,
  accessToken: string,
  googleEventId: string | null,
  task: { title: string; due_date: string; priority: string | null },
): Promise<string> {
  const body = {
    summary: task.title,
    description: `Synced from Nexus${task.priority ? ` • Priority: ${task.priority}` : ''}`,
    start: { date: task.due_date },
    end:   { date: addOneDay(task.due_date) },
  }

  const baseUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
  const url     = googleEventId ? `${baseUrl}/${googleEventId}` : baseUrl
  const method  = googleEventId ? 'PATCH' : 'POST'
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  let res: Response
  try {
    res = await gcalFetch(url, { method, headers, body: JSON.stringify(body) })
  } catch (err) {
    if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
      res = await retryAfterRefresh(userId, async () =>
        gcalFetch(url, {
          method,
          headers: { Authorization: `Bearer ${await getValidToken(userId)}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    } else {
      throw err
    }
  }

  const event = await res.json()
  return event.id
}

async function deleteTaskEvent(userId: string, accessToken: string, googleEventId: string): Promise<void> {
  const url     = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`
  const headers = { Authorization: `Bearer ${accessToken}` }

  try {
    await gcalFetch(url, { method: 'DELETE', headers })
  } catch (err) {
    if (err instanceof NonRetryableError && err.statusCode === 410) return // already gone
    if (err instanceof NonRetryableError && (err.statusCode === 401 || err.statusCode === 403)) {
      await retryAfterRefresh(userId, async () =>
        gcalFetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${await getValidToken(userId)}` } })
      )
      return
    }
    throw err
  }
}

async function syncMyTasks(payload: Record<string, string>) {
  const { user_id } = payload
  if (!user_id) return json(400, { error: 'user_id is required' })

  const supabase = adminClient()

  const { data: tokenRow } = await supabase
    .from('google_calendar_tokens')
    .select('sync_tasks_enabled')
    .eq('user_id', user_id)
    .maybeSingle()

  if (!tokenRow) return json(400, { error: 'Google Calendar is not connected' })
  if (!tokenRow.sync_tasks_enabled) return json(400, { error: 'Task sync is not enabled' })

  const access_token = await getValidToken(user_id)
  if (!access_token) return json(401, { error: 'reauth_required' })

  const { data: follows } = await supabase
    .from('task_follows')
    .select('task_id')
    .eq('user_id', user_id)

  const followedIds = (follows ?? []).map((f) => f.task_id)

  let taskQuery = supabase
    .from('tasks')
    .select(`
      id, title, due_date, priority, assignee_id,
      status_definition:task_status_definitions!status_id(category)
    `)
    .is('deleted_at', null)
    .not('due_date', 'is', null)

  taskQuery = followedIds.length > 0
    ? taskQuery.or(`assignee_id.eq.${user_id},id.in.(${followedIds.join(',')})`)
    : taskQuery.eq('assignee_id', user_id)

  const { data: candidateTasks, error: taskError } = await taskQuery
  if (taskError) return json(500, { error: taskError.message })

  const inScopeTasks = (candidateTasks ?? []).filter((t) => {
    const category = (t.status_definition as { category?: string } | null)?.category
    return category !== 'completed' && category !== 'cancelled'
  })
  const inScopeIds = new Set(inScopeTasks.map((t) => t.id))

  const { data: syncRows } = await supabase
    .from('task_calendar_sync')
    .select('task_id, google_event_id')
    .eq('user_id', user_id)

  const existingByTaskId = new Map((syncRows ?? []).map((r) => [r.task_id, r.google_event_id]))

  let created = 0
  let updated = 0
  let deleted = 0
  let errors  = 0

  for (const task of inScopeTasks) {
    const existingEventId = existingByTaskId.get(task.id) ?? null
    try {
      const googleEventId = await putTaskEvent(user_id, access_token, existingEventId, {
        title:    task.title,
        due_date: task.due_date,
        priority: task.priority ?? null,
      })
      await supabase.from('task_calendar_sync').upsert({
        user_id, task_id: task.id, google_event_id: googleEventId, synced_at: new Date().toISOString(),
      }, { onConflict: 'user_id,task_id' })
      existingEventId ? updated++ : created++
    } catch (err) {
      errors++
      console.error(`[google-calendar-sync] sync_my_tasks push failed for task ${task.id}:`, String(err))
      await recordSyncFailure({
        userId: user_id, eventId: task.id, googleEventId: existingEventId,
        errorCode: err instanceof NonRetryableError ? err.statusCode : null,
        errorMessage: String(err),
        payload: { action: 'sync_my_tasks_push', task_id: task.id },
        retryCount: err instanceof MaxRetriesExceededError ? GCAL_RETRY_OPTIONS.maxRetries : 0,
      })
    }
  }

  // Delete propagation: drop events for tasks no longer in scope
  // (unassigned, unfollowed, due date cleared, completed/cancelled, deleted).
  for (const row of syncRows ?? []) {
    if (inScopeIds.has(row.task_id)) continue
    try {
      await deleteTaskEvent(user_id, access_token, row.google_event_id)
      await supabase.from('task_calendar_sync').delete().eq('user_id', user_id).eq('task_id', row.task_id)
      deleted++
    } catch (err) {
      errors++
      console.error(`[google-calendar-sync] sync_my_tasks delete failed for task ${row.task_id}:`, String(err))
    }
  }

  await supabase.from('google_calendar_tokens').update({
    last_synced_at: new Date().toISOString(),
    tasks_synced:   inScopeTasks.length,
  }).eq('user_id', user_id)

  return json(200, { created, updated, deleted, errors })
}

// ── Multi-source auto-sync (cron) ─────────────────────────────────────────────

async function runMultiSourceAutoSync(): Promise<void> {
  const runId    = crypto.randomUUID().slice(0, 8)
  const runStart = Date.now()
  console.log(`[auto-sync][${runId}] Starting scheduled run at ${new Date().toISOString()}`)

  const supabase = adminClient()

  const { data: sources, error: fetchError } = await supabase
    .from('ministry_calendar_sources')
    .select('id')
    .eq('sync_enabled', true)

  if (fetchError) {
    console.error(`[auto-sync][${runId}] Failed to fetch sources:`, fetchError.message)
    return
  }

  if (!sources || sources.length === 0) {
    console.log(`[auto-sync][${runId}] No enabled sources found — skipping`)
    return
  }

  console.log(`[auto-sync][${runId}] Processing ${sources.length} source(s)`)

  let succeeded = 0
  let failed    = 0

  for (const source of sources) {
    try {
      console.log(`[auto-sync][${runId}] Syncing source=${source.id}`)
      await syncOneSource({ source_id: source.id })
      succeeded++
    } catch (err) {
      console.error(`[auto-sync][${runId}] Sync failed for source=${source.id}:`, String(err))
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
      case 'exchange_code':             return await exchangeCode(payload as Record<string, string>)
      case 'refresh_token':              return await refreshToken(payload as Record<string, string>)
      case 'create_event':               return await createEvent(payload as Record<string, string>)
      case 'update_event':               return await updateEvent(payload as Record<string, string>)
      case 'delete_event':               return await deleteEvent(payload as Record<string, string>)
      case 'list_external_events':       return await listExternalEvents(payload as Record<string, string>)
      case 'exchange_code_connection':   return await exchangeCodeForConnection(payload as Record<string, string>)
      case 'list_available_calendars':   return await listAvailableCalendars()
      case 'add_source':                 return await addSource(payload)
      case 'update_source':              return await updateSource(payload)
      case 'remove_source':              return await removeSource(payload as Record<string, string>)
      case 'sync_one_source':            return await syncOneSource(payload as Record<string, string>)
      case 'sync_my_tasks':              return await syncMyTasks(payload as Record<string, string>)
      default:                           return json(400, { error: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error('[google-calendar-sync]', err)
    return json(500, { error: String(err) })
  }
})

// ── 15-minute multi-source auto-sync cron ─────────────────────────────────────

if (Deno.env.get('ENABLE_AUTO_SYNC') === 'true') {
  Deno.cron('google-calendar-auto-sync', '*/15 * * * *', async () => {
    try {
      await runMultiSourceAutoSync()
    } catch (err) {
      console.error('[auto-sync] Unhandled error in cron handler:', String(err))
    }
  })
}
