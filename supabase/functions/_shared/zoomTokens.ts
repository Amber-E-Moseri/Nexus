// Shared Zoom token management for edge functions.
// Handles retrieving, refreshing, and storing tokens from space_integration_secrets.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZOOM_CLIENT_ID = Deno.env.get('ZOOM_CLIENT_ID') ?? ''
const ZOOM_CLIENT_SECRET = Deno.env.get('ZOOM_CLIENT_SECRET') ?? ''

interface ZoomTokens {
  access_token: string
  refresh_token: string
  expires_at: string | null
}

// Fetch current tokens from space_integration_secrets for a given integration row
export async function getZoomTokens(
  supabase: ReturnType<typeof createClient>,
  integrationId: string,
): Promise<ZoomTokens | null> {
  const { data: secrets } = await supabase
    .from('space_integration_secrets')
    .select('secret_key, secret_value, expires_at')
    .eq('integration_id', integrationId)
    .in('secret_key', ['access_token', 'refresh_token'])

  if (!secrets || secrets.length < 2) return null

  const access = secrets.find(s => s.secret_key === 'access_token')
  const refresh = secrets.find(s => s.secret_key === 'refresh_token')
  if (!access?.secret_value || !refresh?.secret_value) return null

  return {
    access_token: access.secret_value,
    refresh_token: refresh.secret_value,
    expires_at: access.expires_at,
  }
}

// Exchange refresh token for new access token and persist it
export async function refreshZoomToken(
  supabase: ReturnType<typeof createClient>,
  integrationId: string,
  refreshToken: string,
): Promise<string | null> {
  const credentials = btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)
  const res = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[zoomTokens] refresh failed (${res.status}):`, text)

    if (res.status === 401 || res.status === 400) {
      // Token revoked — mark integration as inactive
      await supabase
        .from('space_integrations')
        .update({ is_active: false })
        .eq('id', integrationId)
    }
    return null
  }

  const data = await res.json()
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

  // Persist new tokens
  await supabase
    .from('space_integration_secrets')
    .upsert({ integration_id: integrationId, secret_key: 'access_token', secret_value: data.access_token, expires_at: expiresAt }, { onConflict: 'integration_id,secret_key' })

  if (data.refresh_token) {
    await supabase
      .from('space_integration_secrets')
      .upsert({ integration_id: integrationId, secret_key: 'refresh_token', secret_value: data.refresh_token, expires_at: null }, { onConflict: 'integration_id,secret_key' })
  }

  return data.access_token
}

// Get a valid access token, refreshing automatically if expired or close to expiry
export async function getValidZoomToken(
  supabase: ReturnType<typeof createClient>,
  integrationId: string,
): Promise<string | null> {
  const tokens = await getZoomTokens(supabase, integrationId)
  if (!tokens) return null

  // Refresh if token expires within 5 minutes
  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0
  const needsRefresh = !expiresAt || expiresAt - Date.now() < 5 * 60 * 1000

  if (needsRefresh) {
    return await refreshZoomToken(supabase, integrationId, tokens.refresh_token)
  }

  return tokens.access_token
}
