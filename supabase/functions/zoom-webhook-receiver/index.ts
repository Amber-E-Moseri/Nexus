// zoom-webhook-receiver — receives Zoom recording.completed webhooks
// Validates signature, finds the matching Nexus meeting, and queues recording sync.
// Returns 200 immediately; heavy processing happens in background cron jobs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ZOOM_WEBHOOK_SECRET = Deno.env.get('ZOOM_WEBHOOK_SECRET') ?? ''

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Signature validation ──────────────────────────────────────────────────────
// Zoom sends: x-zm-signature = "v0={HMAC-SHA256(secret, "v0:{timestamp}:{body}")}"
//             x-zm-request-timestamp = unix ms timestamp

async function validateZoomSignature(req: Request, body: string): Promise<boolean> {
  const signature = req.headers.get('x-zm-signature')
  const timestamp = req.headers.get('x-zm-request-timestamp')
  if (!signature || !timestamp || !ZOOM_WEBHOOK_SECRET) return false

  // Reject requests older than 5 minutes (replay protection)
  const ageSecs = (Date.now() - Number(timestamp)) / 1000
  if (ageSecs > 300) {
    console.warn('[zoom-webhook] rejected stale request, age:', ageSecs)
    return false
  }

  const message = `v0:${timestamp}:${body}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(ZOOM_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
  const expected = `v0=${hex}`
  return expected === signature
}

// ── Meeting lookup by Zoom meeting ID ─────────────────────────────────────────
// Zoom meeting IDs appear in join URLs as: https://zoom.us/j/{meetingId}
// We store zoom_join_url on meetings and extract the numeric ID to match.

function extractZoomMeetingId(joinUrl: string): string | null {
  try {
    const m = new URL(joinUrl).pathname.match(/\/j\/(\d+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

interface RecordingFile {
  id: string
  meeting_id: string
  recording_start: string
  recording_end: string
  file_type: string
  file_size: number
  download_url: string
  status: string
  recording_type: string
}

interface ZoomRecordingPayload {
  event: string
  event_ts: number
  payload: {
    account_id: string
    object: {
      uuid: string
      id: number       // Zoom meeting ID (numeric)
      topic: string
      start_time: string
      duration: number
      recording_files: RecordingFile[]
    }
  }
}

// ── Webhook handler ───────────────────────────────────────────────────────────

async function handleRecordingCompleted(payload: ZoomRecordingPayload) {
  const supabase = adminClient()
  const meetingObj = payload.payload.object
  const zoomMeetingId = String(meetingObj.id)

  // Find video/audio recording files (skip transcripts, chat logs, etc.)
  const videoFiles = (meetingObj.recording_files ?? []).filter(
    f => f.status === 'completed' && ['MP4', 'M4A', 'AUDIO_ONLY'].includes(f.file_type),
  )

  if (videoFiles.length === 0) {
    console.log(`[zoom-webhook] No video/audio files for meeting ${zoomMeetingId}`)
    return json(200, { message: 'No recordable files' })
  }

  // Find Nexus meetings with a matching Zoom join URL
  const { data: meetings, error: meetingErr } = await supabase
    .from('meetings')
    .select('id, zoom_join_url, zoom_recording_id')
    .not('zoom_join_url', 'is', null)

  if (meetingErr) {
    console.error('[zoom-webhook] DB error fetching meetings:', meetingErr)
    return json(500, { error: meetingErr.message })
  }

  const matched = (meetings ?? []).filter(m => {
    const id = extractZoomMeetingId(m.zoom_join_url ?? '')
    return id === zoomMeetingId
  })

  if (matched.length === 0) {
    console.log(`[zoom-webhook] No Nexus meeting found for Zoom meeting ${zoomMeetingId}`)
    return json(200, { message: 'No matching Nexus meeting' })
  }

  // Use the first (most-recently-created video) recording file as the primary
  const primaryFile = videoFiles[0]
  const updated: string[] = []
  const skipped: string[] = []

  for (const meeting of matched) {
    // Idempotency: skip if this recording is already tracked
    if (meeting.zoom_recording_id === primaryFile.id) {
      skipped.push(meeting.id)
      continue
    }

    const { error: updateErr } = await supabase
      .from('meetings')
      .update({
        zoom_recording_id: primaryFile.id,
        recording_url: primaryFile.download_url,   // temporary; downloaded by sync job
        recording_size_bytes: primaryFile.file_size,
        recording_available_at: new Date(payload.event_ts).toISOString(),
        recording_sync_status: 'pending',
        recording_sync_error: null,
      })
      .eq('id', meeting.id)

    if (updateErr) {
      console.error(`[zoom-webhook] Failed to update meeting ${meeting.id}:`, updateErr.message)
    } else {
      updated.push(meeting.id)
    }
  }

  console.log(`[zoom-webhook] Zoom meeting ${zoomMeetingId}: updated=${updated.length}, skipped=${skipped.length}`)
  return json(200, { updated, skipped })
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: string
  try {
    body = await req.text()
  } catch {
    return json(400, { error: 'Could not read request body' })
  }

  // Validate Zoom webhook signature before processing anything
  const isValid = await validateZoomSignature(req, body)
  if (!isValid) {
    console.warn('[zoom-webhook] Invalid or missing signature')
    return json(401, { error: 'Invalid webhook signature' })
  }

  let payload: ZoomRecordingPayload
  try {
    payload = JSON.parse(body)
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  // Only handle recording.completed for now; silently ack others
  if (payload.event === 'recording.completed') {
    return await handleRecordingCompleted(payload)
  }

  return json(200, { message: `Event ${payload.event} acknowledged` })
})
