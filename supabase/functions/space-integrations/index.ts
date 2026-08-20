import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? ''
const ZOOM_CLIENT_ID = Deno.env.get('ZOOM_CLIENT_ID') ?? ''
const ZOOM_CLIENT_SECRET = Deno.env.get('ZOOM_CLIENT_SECRET') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

// ── Zoom token helpers ────────────────────────────────────────────────────────

interface ZoomTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

async function exchangeZoomCode(code: string, redirectUri: string): Promise<ZoomTokenResponse> {
  const credentials = btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)
  const res = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Zoom token exchange failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function getZoomUserInfo(accessToken: string) {
  const res = await fetch('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch Zoom user info (${res.status})`)
  return res.json()
}

async function storeZoomSecrets(
  supabase: ReturnType<typeof adminClient>,
  integrationId: string,
  tokens: ZoomTokenResponse,
) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const upserts = [
    { integration_id: integrationId, secret_key: 'access_token', secret_value: tokens.access_token, expires_at: expiresAt },
    { integration_id: integrationId, secret_key: 'refresh_token', secret_value: tokens.refresh_token, expires_at: null },
    { integration_id: integrationId, secret_key: 'scope', secret_value: tokens.scope, expires_at: null },
  ]
  for (const row of upserts) {
    const { error } = await supabase
      .from('space_integration_secrets')
      .upsert(row, { onConflict: 'integration_id,secret_key' })
    if (error) throw new Error(`Failed to store secret ${row.secret_key}: ${error.message}`)
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

async function getDriveFiles(integrationId: string) {
  const supabase = adminClient()

  const { data: integration } = await supabase
    .from('space_integrations')
    .select('config')
    .eq('id', integrationId)
    .eq('integration_type', 'google_drive')
    .eq('is_active', true)
    .single()

  if (!integration) return json(404, { error: 'Integration not found' })

  const { data: secretRow } = await supabase
    .from('space_integration_secrets')
    .select('secret_value, expires_at')
    .eq('integration_id', integrationId)
    .eq('secret_key', 'access_token')
    .maybeSingle()

  if (!secretRow?.secret_value) {
    // No Drive token stored — return empty list gracefully
    return json(200, { files: [] })
  }

  const folderId = (integration.config as Record<string, string>).folder_id
  if (!folderId) return json(200, { files: [] })

  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: 'modifiedTime desc',
    pageSize: '5',
    fields: 'files(id,name,modifiedTime,webViewLink,mimeType)',
  })

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${secretRow.secret_value}` } },
  )

  if (!res.ok) return json(200, { files: [] })

  const data = await res.json()
  return json(200, { files: data.files ?? [] })
}

async function connectZoom(req: Request) {
  const url = new URL(req.url)
  const integrationId = url.searchParams.get('integration_id')
  const code = url.searchParams.get('code')
  const redirectUri = url.searchParams.get('redirect_uri')

  if (!integrationId || !code || !redirectUri) {
    return json(400, { error: 'Missing integration_id, code, or redirect_uri' })
  }
  if (!ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    return json(500, { error: 'Zoom credentials not configured — set ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET' })
  }

  const supabase = adminClient()

  // Verify integration exists and is for zoom
  const { data: integration, error: intErr } = await supabase
    .from('space_integrations')
    .select('id, department_id')
    .eq('id', integrationId)
    .eq('integration_type', 'zoom')
    .single()
  if (intErr || !integration) return json(404, { error: 'Zoom integration not found' })

  // Verify calling user is authorized (must be super_admin or dept_lead for this dept)
  const authHeader = req.headers.get('authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, authHeader.replace('Bearer ', ''))
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json(401, { error: 'Not authenticated' })

  const { data: userRow } = await supabase
    .from('users')
    .select('role, department_id')
    .eq('id', user.id)
    .single()
  const isSuperAdmin = userRow?.role === 'super_admin'
  const isDeptLead = userRow?.role === 'dept_lead' && userRow?.department_id === integration.department_id
  if (!isSuperAdmin && !isDeptLead) {
    return json(403, { error: 'Only super_admin or dept_lead can connect Zoom' })
  }

  // Exchange code for tokens
  let tokens: ZoomTokenResponse
  try {
    tokens = await exchangeZoomCode(code, redirectUri)
  } catch (err) {
    console.error('[connectZoom] token exchange error:', err)
    return json(400, { error: String(err) })
  }

  // Fetch Zoom user info to store in config
  let zoomUser: Record<string, string> = {}
  try {
    zoomUser = await getZoomUserInfo(tokens.access_token)
  } catch (err) {
    console.warn('[connectZoom] could not fetch Zoom user info:', err)
  }

  // Store tokens in space_integration_secrets (plaintext; upgrade to Vault when enabled)
  await storeZoomSecrets(supabase, integrationId, tokens)

  // Update integration metadata
  const { error: updateErr } = await supabase
    .from('space_integrations')
    .update({
      is_active: true,
      connected_by: user.id,
      last_synced_at: new Date().toISOString(),
      config: {
        zoom_user_id: zoomUser.id ?? null,
        zoom_email: zoomUser.email ?? null,
        zoom_account_id: zoomUser.account_id ?? null,
        scopes: tokens.scope,
      },
    })
    .eq('id', integrationId)
  if (updateErr) return json(500, { error: updateErr.message })

  return json(200, {
    success: true,
    zoom_email: zoomUser.email ?? null,
    scopes: tokens.scope,
  })
}

async function disconnect(integrationId: string) {
  const supabase = adminClient()

  await supabase
    .from('space_integration_secrets')
    .delete()
    .eq('integration_id', integrationId)

  const { error } = await supabase
    .from('space_integrations')
    .update({ is_active: false })
    .eq('id', integrationId)

  if (error) return json(500, { error: error.message })
  return json(200, { success: true })
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    if (req.method === 'GET' && action === 'drive-files') {
      const integrationId = url.searchParams.get('integration_id') ?? ''
      return await getDriveFiles(integrationId)
    }

    if (req.method === 'POST' && action === 'connect-zoom') {
      return await connectZoom(req)
    }

    if (req.method === 'POST' && action === 'disconnect') {
      const integrationId = url.searchParams.get('integration_id') ?? ''
      return await disconnect(integrationId)
    }

    return json(404, { error: `Unknown action: ${action}` })
  } catch (err) {
    console.error('[space-integrations]', err)
    return json(500, { error: String(err) })
  }
})
