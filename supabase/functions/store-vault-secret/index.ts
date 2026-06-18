import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jwtDecode } from 'https://esm.sh/jwt-decode'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

async function storeVaultSecret(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'Unauthorized: Missing or invalid JWT' })
  }

  const token = authHeader.substring(7)
  let decoded: any
  try {
    decoded = jwtDecode(token)
  } catch {
    return json(401, { error: 'Unauthorized: Invalid JWT' })
  }

  if (decoded.role !== 'super_admin') {
    return json(403, { error: 'Forbidden: Only super_admin can store secrets' })
  }

  const { integration_type, space_id, client_id, client_secret } = await req.json()

  if (!integration_type || !space_id || !client_id || !client_secret) {
    return json(400, { error: 'Missing required fields: integration_type, space_id, client_id, client_secret' })
  }

  if (integration_type !== 'zoom') {
    return json(400, { error: 'Unsupported integration_type' })
  }

  const supabase = adminClient()

  // Get the integration record
  const { data: integration, error: integrationError } = await supabase
    .from('space_integrations')
    .select('id')
    .eq('department_id', space_id)
    .eq('integration_type', 'zoom')
    .eq('is_active', true)
    .maybeSingle()

  if (integrationError) {
    return json(500, { error: `Failed to find integration: ${integrationError.message}` })
  }

  if (!integration) {
    return json(404, { error: 'Zoom integration not found for this space' })
  }

  // Store secrets in Vault via SQL function
  let clientIdVaultId: string
  let clientSecretVaultId: string

  try {
    // Call vault.create_secret via SQL query (vault must be enabled in migration)
    const { data: idResult, error: idError } = await supabase
      .rpc('vault_create_secret', {
        secret_name: `zoom_client_id_${space_id}`,
        secret_value: client_id,
      })

    if (idError) {
      // Fallback: store in plaintext if vault not available (migration not run)
      return json(500, { error: `Vault not available: ${idError.message}. Run migration: 20260731000001_vault_zoom_credentials.sql` })
    }

    clientIdVaultId = idResult
  } catch (err) {
    return json(500, { error: `Failed to store client_id in vault: ${String(err)}` })
  }

  try {
    const { data: secretResult, error: secretError } = await supabase
      .rpc('vault_create_secret', {
        secret_name: `zoom_client_secret_${space_id}`,
        secret_value: client_secret,
      })

    if (secretError) {
      return json(500, { error: `Failed to store client_secret in vault: ${secretError.message}` })
    }

    clientSecretVaultId = secretResult
  } catch (err) {
    return json(500, { error: `Failed to store client_secret in vault: ${String(err)}` })
  }

  // Upsert space_integration_secrets records
  const { error: upsertError } = await supabase.from('space_integration_secrets').upsert([
    {
      integration_id: integration.id,
      secret_key: 'zoom_client_id',
      vault_secret_id: clientIdVaultId,
      secret_type: 'vault',
      secret_value: '', // empty for vault secrets
    },
    {
      integration_id: integration.id,
      secret_key: 'zoom_client_secret',
      vault_secret_id: clientSecretVaultId,
      secret_type: 'vault',
      secret_value: '', // empty for vault secrets
    },
  ], { onConflict: 'integration_id,secret_key' })

  if (upsertError) {
    return json(500, { error: `Failed to store secrets: ${upsertError.message}` })
  }

  return json(200, {
    success: true,
    client_id_vault_id: clientIdVaultId,
    client_secret_vault_id: clientSecretVaultId,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method === 'POST') {
      return await storeVaultSecret(req)
    }

    return json(404, { error: 'Method not allowed' })
  } catch (err) {
    console.error('[store-vault-secret]', err)
    return json(500, { error: String(err) })
  }
})
