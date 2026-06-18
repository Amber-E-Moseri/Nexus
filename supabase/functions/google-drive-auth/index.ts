import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const FRONTEND_URL = Deno.env.get('VITE_FRONTEND_URL') ?? 'http://localhost:5173'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

function encodeBase64(str: string): string {
  return btoa(str)
}

function decodeBase64(str: string): string {
  return atob(str)
}

async function handleAuthorize(userId: string) {
  if (!GOOGLE_CLIENT_ID) {
    return json(500, { error: 'GOOGLE_CLIENT_ID not configured' })
  }

  const redirectUri = `${FRONTEND_URL}/auth/google-drive/callback`
  const state = encodeBase64(userId)

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  return json(200, { url: authUrl })
}

async function handleCallback(code: string, state: string) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return json(500, { error: 'Google OAuth credentials not configured' })
  }

  let userId: string
  try {
    userId = decodeBase64(state)
  } catch {
    return json(400, { error: 'Invalid state parameter' })
  }

  const redirectUri = `${FRONTEND_URL}/auth/google-drive/callback`

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
  })

  if (!tokenRes.ok) {
    const error = await tokenRes.json()
    return json(400, { error: `Token exchange failed: ${error.error_description}` })
  }

  const tokens = await tokenRes.json()
  const accessToken = tokens.access_token
  const refreshToken = tokens.refresh_token

  if (!accessToken) {
    return json(500, { error: 'No access token received' })
  }

  const supabase = adminClient()

  // Get the user's department to find/create integration
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single()

  if (userError || !userData) {
    return json(404, { error: 'User not found' })
  }

  // Store tokens in vault
  let accessTokenVaultId: string
  let refreshTokenVaultId: string

  try {
    const { data: accessRes, error: accessError } = await supabase
      .rpc('vault_create_secret', {
        secret_name: `google_drive_access_token_${userId}`,
        secret_value: accessToken,
      })

    if (accessError) {
      return json(500, { error: `Failed to store access token: ${accessError.message}` })
    }
    accessTokenVaultId = accessRes
  } catch (err) {
    return json(500, { error: `Failed to store access token in vault: ${String(err)}` })
  }

  if (refreshToken) {
    try {
      const { data: refreshRes, error: refreshError } = await supabase
        .rpc('vault_create_secret', {
          secret_name: `google_drive_refresh_token_${userId}`,
          secret_value: refreshToken,
        })

      if (refreshError) {
        return json(500, { error: `Failed to store refresh token: ${refreshError.message}` })
      }
      refreshTokenVaultId = refreshRes
    } catch (err) {
      return json(500, { error: `Failed to store refresh token in vault: ${String(err)}` })
    }
  }

  // Store tokens in space_integration_secrets
  // Assuming user has access to a department/space
  const { data: firstIntegration } = await supabase
    .from('space_integrations')
    .select('id, department_id')
    .eq('integration_type', 'google_drive')
    .limit(1)
    .single()

  if (firstIntegration?.id) {
    await supabase.from('space_integration_secrets').upsert([
      {
        integration_id: firstIntegration.id,
        secret_key: 'google_drive_access_token',
        vault_secret_id: accessTokenVaultId,
        secret_type: 'vault',
        secret_value: '',
      },
      ...(refreshToken
        ? [
            {
              integration_id: firstIntegration.id,
              secret_key: 'google_drive_refresh_token',
              vault_secret_id: refreshTokenVaultId,
              secret_type: 'vault',
              secret_value: '',
            },
          ]
        : []),
    ], { onConflict: 'integration_id,secret_key' })
  }

  return json(200, {
    success: true,
    redirect_url: `${FRONTEND_URL}/settings/integrations?connected=google_drive`,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    if (action === 'authorize') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return json(401, { error: 'Unauthorized' })
      }

      // Extract user_id from JWT (simplified — assumes standard JWT structure)
      const token = authHeader.substring(7)
      const parts = token.split('.')
      if (parts.length !== 3) {
        return json(401, { error: 'Invalid JWT' })
      }

      try {
        const payload = JSON.parse(atob(parts[1]))
        const userId = payload.sub

        if (!userId) {
          return json(401, { error: 'No user ID in token' })
        }

        return await handleAuthorize(userId)
      } catch {
        return json(401, { error: 'Failed to parse JWT' })
      }
    }

    if (action === 'callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (!code || !state) {
        return json(400, { error: 'Missing code or state' })
      }

      return await handleCallback(code, state)
    }

    return json(404, { error: `Unknown action: ${action}` })
  } catch (err) {
    console.error('[google-drive-auth]', err)
    return json(500, { error: String(err) })
  }
})
