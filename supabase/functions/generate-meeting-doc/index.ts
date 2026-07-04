import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_REFRESH_TOKEN') ?? ''

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

// Static GOOGLE_ACCESS_TOKEN secrets expire hourly. Exchange the long-lived
// GOOGLE_REFRESH_TOKEN for a fresh access token on every invocation instead.
async function getFreshAccessToken(): Promise<string> {
  if (!GOOGLE_REFRESH_TOKEN || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google Drive not configured. Set GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET secrets.')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Failed to refresh Google access token: ${errBody}`)
  }

  const tokens = await res.json()
  if (!tokens.access_token) {
    throw new Error(`Google token refresh returned no access_token: ${JSON.stringify(tokens)}`)
  }

  return tokens.access_token
}

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
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    }),
  })
  if (!createRes.ok) throw new Error(`Folder create failed: ${await createRes.text()}`)
  const createData = await createRes.json()
  return createData.id
}

interface ActionItem {
  action: string
  owner?: string
  due_date?: string
  priority?: string
}

function formatDocContent(params: {
  title: string
  date: string
  attendees: string
  transcript: string
  notes: string
  actionItems: ActionItem[]
  meetingType: string
}): string {
  const divider = '═'.repeat(64)
  const dateStr = new Date(params.date).toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const lines: string[] = [
    'MEETING MINUTES',
    `Meeting: ${params.title}`,
    `Date: ${dateStr}`,
    `Type: ${params.meetingType || 'Meeting'}`,
  ]
  if (params.attendees) lines.push(`Attendees: ${params.attendees}`)
  lines.push('')

  if (params.notes) {
    lines.push(divider)
    lines.push('SUMMARY')
    lines.push('')
    lines.push(params.notes)
    lines.push('')
  }

  if (params.transcript) {
    lines.push(divider)
    lines.push('TRANSCRIPT')
    lines.push('')
    lines.push(params.transcript)
    lines.push('')
  }

  if (params.actionItems?.length > 0) {
    lines.push(divider)
    lines.push('ACTION ITEMS')
    lines.push('')
    params.actionItems.forEach((item, i) => {
      let line = `${i + 1}. ${item.action}`
      if (item.owner) line += ` | Owner: ${item.owner}`
      if (item.due_date) {
        const due = new Date(item.due_date).toLocaleDateString('en-CA')
        line += ` | Due: ${due}`
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
    name: fileName,
    mimeType: 'application/vnd.google-apps.document',
    parents: [folderId],
  }

  const metaPart = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  )
  const contentHeader = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`
  )
  const contentBytes = new TextEncoder().encode(content)
  const endPart = new TextEncoder().encode(`\r\n--${boundary}--`)

  const total = metaPart.length + contentHeader.length + contentBytes.length + endPart.length
  const fullBody = new Uint8Array(total)
  let offset = 0
  fullBody.set(metaPart, offset); offset += metaPart.length
  fullBody.set(contentHeader, offset); offset += contentHeader.length
  fullBody.set(contentBytes, offset); offset += contentBytes.length
  fullBody.set(endPart, offset)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
  return { fileId: data.id, webViewLink: data.webViewLink ?? `https://docs.google.com/document/d/${data.id}/edit` }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const token = authHeader.substring(7)
    const { data: userData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !userData?.user?.id) return json(401, { error: 'Invalid token' })

    const body = await req.json()
    const {
      meetingId,
      title = 'Untitled Meeting',
      date = new Date().toISOString(),
      attendees = '',
      summary = '',
      meeting_notes = '',
      meetingType = 'meeting',
      actionItems = [],
    } = body

    if (!meetingId) return json(400, { error: 'meetingId is required' })

    const accessToken = await getFreshAccessToken()

    // Build folder hierarchy: BLW Canada Meeting Minutes / YEAR / Month
    const d = new Date(date)
    const year = d.getFullYear().toString()
    const month = d.toLocaleDateString('en-US', { month: 'long' })

    console.log(`[meeting-doc] Creating folder structure: BLW Canada Meeting Minutes/${year}/${month}`)
    let folderId = await getOrCreateFolder('BLW Canada Meeting Minutes', null, accessToken)
    folderId = await getOrCreateFolder(year, folderId, accessToken)
    folderId = await getOrCreateFolder(month, folderId, accessToken)

    // Format content
    const content = formatDocContent({
      title,
      date,
      attendees,
      transcript: summary,
      notes: meeting_notes,
      actionItems,
      meetingType,
    })

    // Build Drive-safe filename
    const dateStr = date.split('T')[0]
    const typeSlug = (meetingType || 'meeting').replace(/\s+/g, '-')
    const titleSlug = (title || 'Meeting')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40)
    const docTitle = `${dateStr}_${typeSlug}_${titleSlug}`

    console.log(`[meeting-doc] Uploading doc: ${docTitle}`)
    const { fileId, webViewLink } = await uploadAsGoogleDoc(content, docTitle, folderId, accessToken)

    // Persist URL back to meeting row
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        doc_drive_url: webViewLink,
        doc_title: docTitle,
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
