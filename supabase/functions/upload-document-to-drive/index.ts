import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

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

/**
 * Get access token from vault for Google Drive API
 */
async function getGoogleAccessToken(userId: string): Promise<string> {
  const supabase = adminClient()

  // Try to get token from integration secrets vault
  const { data: secrets, error } = await supabase
    .from('space_integration_secrets')
    .select('vault_secret_id')
    .eq('secret_key', 'google_drive_access_token')
    .limit(1)
    .single()

  if (error || !secrets?.vault_secret_id) {
    throw new Error('Google Drive token not found. User must authorize first.')
  }

  // Get secret value from vault
  const { data: secret, error: vaultError } = await supabase.rpc('vault_get_secret', {
    secret_id: secrets.vault_secret_id,
  })

  if (vaultError || !secret) {
    throw new Error('Failed to retrieve Google Drive token from vault')
  }

  return secret
}

/**
 * Upload file to Google Drive
 */
async function uploadFileToDrive(
  file: ArrayBuffer,
  fileName: string,
  mimeType: string,
  folderId: string
): Promise<{ fileId: string; webViewLink: string }> {
  const accessToken = Deno.env.get('GOOGLE_ACCESS_TOKEN') ?? ''

  if (!accessToken) {
    throw new Error('Google access token not configured')
  }

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType,
  }

  // Create multipart form
  const boundary = 'BLW_' + Math.random().toString(36).substring(2)
  let body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`

  // Combine body parts
  const bodyUint8 = new TextEncoder().encode(body)
  const fileUint8 = new Uint8Array(file)
  const endUint8 = new TextEncoder().encode(`\r\n--${boundary}--`)

  const fullBody = new Uint8Array(bodyUint8.length + fileUint8.length + endUint8.length)
  fullBody.set(bodyUint8)
  fullBody.set(fileUint8, bodyUint8.length)
  fullBody.set(endUint8, bodyUint8.length + fileUint8.length)

  try {
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: fullBody,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Drive upload failed: ${error.error.message}`)
    }

    const data = await response.json()
    return {
      fileId: data.id,
      webViewLink: data.webViewLink,
    }
  } catch (err) {
    throw new Error(`Failed to upload to Google Drive: ${err.message}`)
  }
}

/**
 * Create or get folder for meeting documents
 * Structure: BLW/YYYY/MM/YYYY-MM-DD/
 */
async function getOrCreateMeetingFolder(dateString: string, accessToken: string): Promise<string> {
  const date = new Date(dateString)
  const year = date.getFullYear().toString()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = dateString.split('T')[0] // YYYY-MM-DD

  let parentId = null

  // Create BLW folder
  parentId = await getOrCreateFolder('BLW', parentId, accessToken)

  // Create year folder
  parentId = await getOrCreateFolder(year, parentId, accessToken)

  // Create month folder
  parentId = await getOrCreateFolder(month, parentId, accessToken)

  // Create day folder
  parentId = await getOrCreateFolder(day, parentId, accessToken)

  return parentId
}

/**
 * Get or create a folder by name
 */
async function getOrCreateFolder(folderName: string, parentId: string | null, accessToken: string): Promise<string> {
  // Search for existing folder
  let query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  if (parentId) {
    query += ` and '${parentId}' in parents`
  }

  try {
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,name)&pageSize=1`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!searchResponse.ok) {
      throw new Error('Failed to search for folder')
    }

    const searchData = await searchResponse.json()
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id
    }

    // Create new folder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : [],
      }),
    })

    if (!createResponse.ok) {
      throw new Error('Failed to create folder')
    }

    const createData = await createResponse.json()
    return createData.id
  } catch (err) {
    throw new Error(`Folder operation failed: ${err.message}`)
  }
}

/**
 * Share file publicly (link sharing)
 */
async function shareFilePublicly(fileId: string, accessToken: string): Promise<void> {
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    })
  } catch (err) {
    console.error('Failed to share file publicly:', err)
    // Don't throw - file still uploaded, just not publicly shared
  }
}

/**
 * Main handler
 */
async function handleUpload(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json(401, { error: 'Unauthorized' })
    }

    const token = authHeader.substring(7)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    // Verify JWT and get user
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !userData?.user?.id) {
      return json(401, { error: 'Invalid token' })
    }

    // Parse request
    const formData = await req.formData()
    const file = formData.get('file') as File
    const meetingId = formData.get('meetingId') as string
    const documentType = formData.get('documentType') as string

    if (!file || !meetingId || !documentType) {
      return json(400, { error: 'Missing required fields: file, meetingId, documentType' })
    }

    if (!['minutes', 'supporting'].includes(documentType)) {
      return json(400, { error: 'Invalid documentType. Must be "minutes" or "supporting"' })
    }

    // Get meeting data
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, meeting_type, date')
      .eq('id', meetingId)
      .single()

    if (meetingError || !meeting) {
      return json(404, { error: 'Meeting not found' })
    }

    // Get Google access token from vault
    const accessToken = await getGoogleAccessToken(userData.user.id)

    // Create folder structure
    const folderId = await getOrCreateMeetingFolder(meeting.date, accessToken)

    // Determine file type
    const fileType = file.type.startsWith('image/')
      ? 'image'
      : file.type === 'application/pdf'
        ? 'pdf'
        : file.type.includes('word') || file.type.includes('sheet')
          ? 'office'
          : 'other'

    // Generate Drive-safe filename
    const shortType = (meeting.meeting_type || 'meeting').split(' ').map((w) => w[0]).join('').toUpperCase()
    const dateStr = meeting.date.split('T')[0]
    const typeLabel =
      documentType === 'supporting'
        ? `Supporting_${Date.now()}`
        : documentType.charAt(0).toUpperCase() + documentType.slice(1)
    const ext = file.name.split('.').pop() || 'bin'
    const driveFileName = `BLW_${shortType}_${dateStr}_${typeLabel}.${ext}`

    // Upload to Drive
    const arrayBuffer = await file.arrayBuffer()
    const { fileId, webViewLink } = await uploadFileToDrive(arrayBuffer, driveFileName, file.type, folderId)

    // Share publicly
    await shareFilePublicly(fileId, accessToken)

    // Save to Supabase
    const { data: docData, error: dbError } = await supabase
      .from('meeting_documents')
      .insert([
        {
          meeting_id: meetingId,
          file_name: file.name,
          file_size: file.size,
          file_type: fileType,
          mime_type: file.type,
          drive_file_id: fileId,
          drive_file_name: driveFileName,
          drive_folder_id: folderId,
          drive_share_link: webViewLink,
          document_type: documentType,
          uploaded_by: userData.user.id,
          is_public: true,
        },
      ])
      .select()
      .single()

    if (dbError) {
      return json(500, { error: `Database error: ${dbError.message}` })
    }

    return json(200, {
      success: true,
      document: docData,
    })
  } catch (err) {
    console.error('[upload-document-to-drive]', err)
    return json(500, { error: err.message || 'Upload failed' })
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method === 'POST') {
    return await handleUpload(req)
  }

  return json(405, { error: 'Method not allowed' })
})
