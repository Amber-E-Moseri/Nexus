import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { extractISODate } from '../_shared/dateUtils.ts'

const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')            ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GOOGLE_CLIENT_ID        = Deno.env.get('GOOGLE_CLIENT_ID')        ?? ''
const GOOGLE_CLIENT_SECRET    = Deno.env.get('GOOGLE_CLIENT_SECRET')    ?? ''
// GOOGLE_REFRESH_TOKEN static secret is no longer used — tokens are stored in
// Supabase Vault via the meeting_doc_connection table. Use the in-app connect
// flow (Calendar Settings → Meeting Docs Drive) to provision the connection.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Idempotent vault write — updates in place if the secret name already exists.
async function vaultUpsertSecret(name: string, value: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .rpc('vault_upsert_secret', { secret_name: name, secret_value: value })
  if (error || !data) {
    console.error(`[vault] Failed to upsert secret "${name}":`, error?.message)
    return null
  }
  return data as string
}

// ── Vault-backed access token ─────────────────────────────────────────────────
// Reads meeting_doc_connection for vault UUIDs; refreshes the access token if
// within 60 s of expiry; marks needs_reauth=true on invalid_grant.

async function getValidMeetingDocToken(): Promise<string> {
  const supabase = adminClient()
  const { data: row } = await supabase
    .from('meeting_doc_connection')
    .select('access_token_vault_id, refresh_token_vault_id, token_expiry, needs_reauth')
    .maybeSingle()

  if (!row) throw new Error('not_connected')
  if (row.needs_reauth) throw new Error('reauth_required')

  // Access token still valid
  const expiry = new Date(row.token_expiry)
  if (expiry.getTime() - Date.now() > 60_000) {
    const { data: accessToken } = await supabase
      .rpc('vault_get_secret', { secret_id: row.access_token_vault_id })
    if (!accessToken) throw new Error('not_connected')
    return accessToken as string
  }

  // Access token expired — use refresh token to get a new one
  const { data: refreshToken } = await supabase
    .rpc('vault_get_secret', { secret_id: row.refresh_token_vault_id })
  if (!refreshToken) throw new Error('not_connected')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken as string,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    let errBody: Record<string, unknown> = {}
    try { errBody = await res.json() } catch {}
    if (errBody.error === 'invalid_grant') {
      await supabase.from('meeting_doc_connection')
        .update({ needs_reauth: true }).not('id', 'is', null)
      throw new Error('reauth_required')
    }
    throw new Error(`Token refresh failed: ${JSON.stringify(errBody)}`)
  }

  const tokens = await res.json()
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const newVaultId = await vaultUpsertSecret('google_meeting_doc_access', tokens.access_token)
  if (newVaultId) {
    await supabase.from('meeting_doc_connection')
      .update({ access_token_vault_id: newVaultId, token_expiry: newExpiry, updated_at: new Date().toISOString() })
      .not('id', 'is', null)
  }

  return tokens.access_token
}

// ── Connection management actions ─────────────────────────────────────────────

async function actionConnect(payload: Record<string, string>, userId: string) {
  const { code, redirect_uri } = payload
  if (!code || !redirect_uri) return json(400, { error: 'code and redirect_uri are required' })

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
    console.error('[meeting-doc] OAuth token exchange failed:', err)
    return json(400, { error: `OAuth exchange failed: ${err}` })
  }

  const tokens = await res.json()
  if (!tokens.access_token || !tokens.refresh_token) {
    return json(400, { error: 'OAuth response missing tokens — ensure offline access (prompt=consent) was requested' })
  }

  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const supabase = adminClient()

  const accessVaultId = await vaultUpsertSecret('google_meeting_doc_access', tokens.access_token)
  if (!accessVaultId) return json(500, { error: 'Failed to store access token in vault' })

  const refreshVaultId = await vaultUpsertSecret('google_meeting_doc_refresh', tokens.refresh_token)
  if (!refreshVaultId) return json(500, { error: 'Failed to store refresh token in vault' })

  // Singleton: replace existing row
  await supabase.from('meeting_doc_connection').delete().not('id', 'is', null)
  const { error } = await supabase.from('meeting_doc_connection').insert({
    access_token_vault_id:  accessVaultId,
    refresh_token_vault_id: refreshVaultId,
    token_expiry:           expiry,
    connected_by:           userId,
    needs_reauth:           false,
  })

  if (error) return json(500, { error: error.message })
  console.log('[meeting-doc] Connected. userId:', userId)
  return json(200, { success: true })
}

async function actionStatus() {
  const supabase = adminClient()
  const { data: row } = await supabase
    .from('meeting_doc_connection')
    .select('id, token_expiry, needs_reauth, connected_by, created_at, updated_at')
    .maybeSingle()

  if (!row) return json(200, { connected: false })
  return json(200, {
    connected:       true,
    needs_reauth:    row.needs_reauth ?? false,
    token_expiry:    row.token_expiry,
    connected_since: row.created_at,
    connected_by:    row.connected_by,
  })
}

async function actionDisconnect() {
  const supabase = adminClient()
  await supabase.from('meeting_doc_connection').delete().not('id', 'is', null)
  return json(200, { success: true })
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function getOrCreateFolder(
  folderName: string,
  parentId: string | null,
  accessToken: string
): Promise<string> {
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  if (parentId) query += ` and '${parentId}' in parents`

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!searchRes.ok) throw new Error(`Folder search failed: ${await searchRes.text()}`)
  const searchData = await searchRes.json()
  if (searchData.files?.length > 0) return searchData.files[0].id

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name:     folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents:  parentId ? [parentId] : [],
    }),
  })
  if (!createRes.ok) throw new Error(`Folder create failed: ${await createRes.text()}`)
  const createData = await createRes.json()
  return createData.id
}

interface ActionItem {
  action:    string
  owner?:    string
  due_date?: string
  priority?: string
}

// Non-null: falls back to today when date is absent. Used for the meeting date
// (folder structure, doc title) where null would corrupt the Drive path.
// Action-item due_date uses the shared extractISODate (nullable) instead.
function extractIsoDate(raw: string): string {
  return (raw || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? new Date().toISOString().slice(0, 10)
}

function formatDocContent(params: {
  title:          string
  date:           string
  attendees:      string
  decisions:      string
  detailed_notes: string
  minutes:        string
  next_steps:     string
  actionItems:    ActionItem[]
  meetingType:    string
}): string {
  const divider = '═'.repeat(64)
  const cleanDate = extractIsoDate(params.date)
  const dateStr = new Date(cleanDate).toLocaleDateString('en-CA', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  })

  const lines: string[] = [
    'MEETING MINUTES',
    `Meeting: ${params.title}`,
    `Date: ${dateStr}`,
    `Type: ${params.meetingType || 'Meeting'}`,
  ]
  if (params.attendees) lines.push(`Attendees: ${params.attendees}`)
  lines.push('')

  if (params.detailed_notes) {
    lines.push(divider, 'SUMMARY / AI NOTES', '', params.detailed_notes, '')
  }

  if (params.decisions) {
    lines.push(divider, 'DECISIONS', '', params.decisions, '')
  }

  if (params.minutes) {
    lines.push(divider, 'DISCUSSION NOTES', '', params.minutes, '')
  }

  if (params.next_steps) {
    lines.push(divider, 'NEXT STEPS', '', params.next_steps, '')
  }

  if (params.actionItems?.length > 0) {
    lines.push(divider, 'ACTION ITEMS', '')
    params.actionItems.forEach((item, i) => {
      let line = `${i + 1}. ${item.action}`
      if (item.owner) line += ` | Owner: ${item.owner}`
      if (item.due_date) {
        const due = extractISODate(item.due_date)
        if (due) line += ` | Due: ${due}`
      }
      if (item.priority) line += ` | Priority: ${item.priority}`
      lines.push(line)
    })
    lines.push('')
  }

  return lines.join('\n')
}

async function uploadAsGoogleDoc(
  content: string,
  fileName: string,
  folderId: string,
  accessToken: string
): Promise<{ fileId: string; webViewLink: string }> {
  const boundary = 'meeting_doc_' + Math.random().toString(36).substring(2)
  const metadata = {
    name:     fileName,
    mimeType: 'application/vnd.google-apps.document',
    parents:  [folderId],
  }

  const metaPart      = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`)
  const contentHeader = new TextEncoder().encode(`--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`)
  const contentBytes  = new TextEncoder().encode(content)
  const endPart       = new TextEncoder().encode(`\r\n--${boundary}--`)

  const total   = metaPart.length + contentHeader.length + contentBytes.length + endPart.length
  const fullBody = new Uint8Array(total)
  let offset = 0
  fullBody.set(metaPart,      offset); offset += metaPart.length
  fullBody.set(contentHeader, offset); offset += contentHeader.length
  fullBody.set(contentBytes,  offset); offset += contentBytes.length
  fullBody.set(endPart,       offset)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: fullBody,
    }
  )

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Drive upload failed: ${errBody}`)
  }

  const data = await res.json()
  if (!data.id) throw new Error(`Drive upload returned no file id: ${JSON.stringify(data)}`)
  return {
    fileId:      data.id,
    webViewLink: data.webViewLink ?? `https://docs.google.com/document/d/${data.id}/edit`,
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')   return json(405, { error: 'Method not allowed' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' })

    const supabase = adminClient()
    const token    = authHeader.substring(7)
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !userData?.user?.id) return json(401, { error: 'Invalid token' })

    const body   = await req.json()
    const userId = userData.user.id

    // Route connection management actions before the generation path
    if (body.action === 'connect')    return await actionConnect(body, userId)
    if (body.action === 'status')     return await actionStatus()
    if (body.action === 'disconnect') return await actionDisconnect()

    // ── Meeting doc generation ──────────────────────────────────────────────
    const {
      meetingId,
      title          = 'Untitled Meeting',
      date           = new Date().toISOString(),
      attendees      = '',
      decisions      = '',
      detailed_notes = '',
      minutes        = '',
      next_steps     = '',
      meetingType    = 'meeting',
      actionItems    = [],
    } = body

    if (!meetingId) return json(400, { error: 'meetingId is required' })

    let accessToken: string
    try {
      accessToken = await getValidMeetingDocToken()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'not_connected' || msg === 'reauth_required') {
        return json(401, { error: msg })
      }
      throw err
    }

    const cleanDate = extractIsoDate(date)
    const d     = new Date(cleanDate)
    const year  = d.getFullYear().toString()
    const month = d.toLocaleDateString('en-US', { month: 'long' })

    console.log(`[meeting-doc] Creating folder structure: BLW Canada Meeting Minutes/${year}/${month}`)
    let folderId = await getOrCreateFolder('BLW Canada Meeting Minutes', null, accessToken)
    folderId     = await getOrCreateFolder(year,  folderId, accessToken)
    folderId     = await getOrCreateFolder(month, folderId, accessToken)

    const content = formatDocContent({
      title, date, attendees,
      decisions, detailed_notes, minutes, next_steps,
      actionItems: actionItems as ActionItem[],
      meetingType,
    })

    const dateStr = new Date(cleanDate).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    const safeTitle = (title || 'Meeting').replace(/[/\\?*:|"<>]/g, '').trim().slice(0, 60)
    const docTitle = `${safeTitle} - ${dateStr}`

    console.log(`[meeting-doc] Uploading doc: ${docTitle}`)
    const { fileId, webViewLink } = await uploadAsGoogleDoc(content, docTitle, folderId, accessToken)

    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        doc_drive_url:   webViewLink,
        doc_title:       docTitle,
        doc_generated_at: new Date().toISOString(),
      })
      .eq('id', meetingId)

    if (updateError) {
      console.error('[meeting-doc] Failed to save doc URL:', updateError.message)
    }

    console.log(`[meeting-doc] Done. meetingId=${meetingId} url=${webViewLink}`)
    return json(200, { success: true, docUrl: webViewLink, docTitle, fileId })
  } catch (err) {
    console.error('[meeting-doc] Error:', err)
    return json(500, { error: err instanceof Error ? err.message : 'Failed to generate doc' })
  }
})
