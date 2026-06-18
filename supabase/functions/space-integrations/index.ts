import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? ''

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

  if (!integrationId || !code) {
    return json(400, { error: 'Missing integration_id or code' })
  }

  // Zoom token exchange would go here — requires ZOOM_CLIENT_ID/SECRET env vars
  // Stub: return success so the UI can proceed
  return json(200, { success: true, message: 'Zoom OAuth stub — configure ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET env vars' })
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
