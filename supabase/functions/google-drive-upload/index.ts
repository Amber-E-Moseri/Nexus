import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jwtDecode } from 'https://esm.sh/jwt-decode'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

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

async function getVaultSecret(secretId: string): Promise<string | null> {
  const supabase = adminClient()
  try {
    const { data, error } = await supabase.rpc('vault_read_secret', {
      secret_id: secretId,
    })

    if (error) {
      console.error('Failed to read vault secret:', error)
      return null
    }

    return data as string
  } catch (err) {
    console.error('Error reading vault secret:', err)
    return null
  }
}

async function refreshAccessToken(
  refreshToken: string,
  userId: string,
  integrationId: string
): Promise<string | null> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  })

  if (!tokenRes.ok) {
    const error = await tokenRes.json()
    console.error('Token refresh failed:', error)
    return null
  }

  const tokens = await tokenRes.json()
  const newAccessToken = tokens.access_token

  if (!newAccessToken) {
    return null
  }

  // Store the new access token in vault using idempotent upsert
  const supabase = adminClient()
  try {
    await supabase.rpc('vault_upsert_secret', {
      name: `google_drive_access_token_${userId}`,
      value: newAccessToken,
    })
  } catch (err) {
    console.error('Failed to update access token in vault:', err)
  }

  return newAccessToken
}

async function uploadToGoogleDrive(
  accessToken: string,
  fileName: string,
  fileData: ArrayBuffer,
  folderId?: string
): Promise<{ fileId: string; webViewLink: string } | null> {
  const metadata = {
    name: fileName,
    ...(folderId && { parents: [folderId] }),
  }

  const multipartBody = new FormData()
  multipartBody.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  multipartBody.append('file', new Blob([fileData]), fileName)

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: multipartBody,
    }
  )

  if (!uploadRes.ok) {
    const error = await uploadRes.json()
    console.error('Google Drive upload failed:', error)
    return null
  }

  const result = await uploadRes.json()
  return {
    fileId: result.id,
    webViewLink: result.webViewLink,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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

  const userId = decoded.sub
  if (!userId) {
    return json(401, { error: 'Unauthorized: No user ID in token' })
  }

  try {
    if (req.method === 'POST') {
      // Parse multipart form data
      const formData = await req.formData()
      const file = formData.get('file') as File
      const fileName = formData.get('file_name') as string
      const taskId = formData.get('task_id') as string
      const meetingId = formData.get('meeting_id') as string
      const folderId = formData.get('folder_id') as string

      if (!file || !fileName) {
        return json(400, { error: 'Missing file or file_name' })
      }

      if (!taskId && !meetingId) {
        return json(400, { error: 'Must provide either task_id or meeting_id' })
      }

      // Get user's Google Drive tokens from vault
      const supabase = adminClient()

      const { data: integration } = await supabase
        .from('space_integrations')
        .select('id')
        .eq('integration_type', 'google_drive')
        .limit(1)
        .single()

      if (!integration) {
        return json(400, { error: 'Google Drive integration not found' })
      }

      const { data: secrets } = await supabase
        .from('space_integration_secrets')
        .select('secret_key, vault_secret_id')
        .eq('integration_id', integration.id)

      if (!secrets || secrets.length === 0) {
        return json(400, { error: 'Google Drive not connected' })
      }

      let accessToken: string | null = null
      let refreshToken: string | null = null

      for (const secret of secrets) {
        if (secret.secret_key === 'google_drive_access_token') {
          accessToken = await getVaultSecret(secret.vault_secret_id)
        } else if (secret.secret_key === 'google_drive_refresh_token') {
          refreshToken = await getVaultSecret(secret.vault_secret_id)
        }
      }

      if (!accessToken) {
        return json(400, { error: 'Google Drive access token not found' })
      }

      // Check if token is expired and refresh if needed
      if (refreshToken) {
        // Try to use the token first; if it fails, refresh
        const testRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (testRes.status === 401) {
          const newToken = await refreshAccessToken(refreshToken, userId, integration.id)
          if (!newToken) {
            return json(401, { error: 'Google Drive token expired and refresh failed' })
          }
          accessToken = newToken
        }
      }

      // Upload to Google Drive
      const fileBuffer = await file.arrayBuffer()
      const uploadResult = await uploadToGoogleDrive(accessToken, fileName, fileBuffer, folderId)

      if (!uploadResult) {
        return json(500, { error: 'Failed to upload file to Google Drive' })
      }

      // Record in space_drive_files table
      const { error: insertError } = await supabase.from('space_drive_files').insert({
        task_id: taskId || null,
        meeting_id: meetingId || null,
        file_id: uploadResult.fileId,
        file_name: fileName,
        web_view_link: uploadResult.webViewLink,
        uploaded_by: userId,
      })

      if (insertError) {
        console.error('Failed to record file upload:', insertError)
        // Still return success since the file was uploaded to Drive
      }

      return json(200, {
        success: true,
        file_id: uploadResult.fileId,
        web_view_link: uploadResult.webViewLink,
      })
    }

    return json(404, { error: 'Method not allowed' })
  } catch (err) {
    console.error('[google-drive-upload]', err)
    return json(500, { error: String(err) })
  }
})
