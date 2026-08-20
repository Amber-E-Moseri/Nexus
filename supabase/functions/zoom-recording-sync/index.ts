// zoom-recording-sync — downloads a Zoom recording and stores it in Supabase Storage.
// Called by the nova-jobs dispatcher on a 15-min cron schedule.
// Also accepts a direct call with { meeting_id } to force-sync a specific meeting.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getValidZoomToken } from '../_shared/zoomTokens.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const NOVA_JOBS_SECRET = Deno.env.get('NOVA_JOBS_SECRET') ?? ''

const RECORDING_BUCKET = 'meeting-recordings'
const BATCH_SIZE = 10
const MAX_ATTEMPTS = 5

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface MeetingRow {
  id: string
  department_id: string
  zoom_recording_id: string
  recording_url: string
  recording_size_bytes: number | null
  recording_sync_status: string
  // joined from space_integrations:
  integration_id: string | null
}

// ── Core sync logic ───────────────────────────────────────────────────────────

async function syncMeeting(supabase: ReturnType<typeof adminClient>, meeting: MeetingRow): Promise<{ success: boolean; error?: string }> {
  const { id: meetingId, department_id, zoom_recording_id, recording_url, integration_id } = meeting

  if (!integration_id) {
    return { success: false, error: 'No active Zoom integration for this department' }
  }

  // Mark as downloading
  await supabase
    .from('meetings')
    .update({ recording_sync_status: 'downloading', recording_sync_error: null })
    .eq('id', meetingId)

  // Get a valid access token (auto-refreshes if needed)
  const accessToken = await getValidZoomToken(supabase, integration_id)
  if (!accessToken) {
    return { success: false, error: 'Zoom token unavailable or integration revoked' }
  }

  // Download recording from Zoom (recording_url is the temporary download URL)
  // Zoom download requires Authorization header with the access token
  const recordingRes = await fetch(recording_url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!recordingRes.ok) {
    if (recordingRes.status === 404) {
      // Recording deleted from Zoom — treat as complete (nothing to download)
      await supabase
        .from('meetings')
        .update({
          recording_sync_status: 'complete',
          recording_url: null,
          recording_sync_error: 'Recording no longer available on Zoom',
        })
        .eq('id', meetingId)
      return { success: true }
    }
    return { success: false, error: `Zoom download failed: ${recordingRes.status} ${recordingRes.statusText}` }
  }

  // Determine file extension from content-type or URL
  const contentType = recordingRes.headers.get('content-type') ?? 'video/mp4'
  const ext = contentType.includes('audio') ? 'm4a' : 'mp4'
  const storagePath = `${department_id}/${meetingId}/recording.${ext}`

  // Stream body to Supabase Storage
  const arrayBuffer = await recordingRes.arrayBuffer()
  const { error: uploadError } = await supabase
    .storage
    .from(RECORDING_BUCKET)
    .upload(storagePath, arrayBuffer, { contentType, upsert: true })

  if (uploadError) {
    return { success: false, error: `Storage upload failed: ${uploadError.message}` }
  }

  // Update meeting with storage path and clear temporary URL
  await supabase
    .from('meetings')
    .update({
      recording_sync_status: 'downloaded',
      recording_download_url: storagePath,
      recording_url: null,       // clear temporary Zoom URL (expires in 24h anyway)
      recording_size_bytes: arrayBuffer.byteLength,
    })
    .eq('id', meetingId)

  // Now attempt to fetch Zoom auto-transcript
  await fetchZoomTranscript(supabase, meetingId, zoom_recording_id, storagePath, accessToken)

  return { success: true }
}

// ── Zoom auto-transcript retrieval ────────────────────────────────────────────
// Attempts to fetch Zoom's auto-generated transcript (VTT format).
// On success: stores plain text in meetings.transcript, marks sync complete.
// On failure: delegates to Deepgram using the already-downloaded recording.

async function fetchZoomTranscript(
  supabase: ReturnType<typeof adminClient>,
  meetingId: string,
  zoomRecordingId: string,
  recordingStoragePath: string,
  accessToken: string,
) {
  const transcriptRes = await fetch(
    `https://api.zoom.us/v2/meetings/${zoomRecordingId}/recordings`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!transcriptRes.ok) {
    console.warn(`[zoom-recording-sync] Could not fetch recording list for ${zoomRecordingId}: ${transcriptRes.status}`)
    await queueDeepgramTranscription(supabase, meetingId, recordingStoragePath)
    return
  }

  const data = await transcriptRes.json()
  const transcriptFile = (data.recording_files ?? []).find(
    (f: { file_type: string; status: string }) => f.file_type === 'TRANSCRIPT' && f.status === 'completed',
  )

  if (!transcriptFile) {
    console.log(`[zoom-recording-sync] No Zoom auto-transcript for meeting ${meetingId} — queuing Deepgram`)
    await queueDeepgramTranscription(supabase, meetingId, recordingStoragePath)
    return
  }

  // Download the VTT transcript
  const vttRes = await fetch(transcriptFile.download_url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!vttRes.ok) {
    console.warn(`[zoom-recording-sync] Failed to download transcript VTT: ${vttRes.status}`)
    await queueDeepgramTranscription(supabase, meetingId, recordingStoragePath)
    return
  }

  const vttText = await vttRes.text()
  const plainText = vttToPlainText(vttText)

  // Store plain transcript directly in meetings.transcript — this is the same field
  // that extract-meeting-data reads from in the regular meeting workflow.
  const { error: updateErr } = await supabase
    .from('meetings')
    .update({
      transcript: plainText,
      recording_sync_status: 'complete',
      recording_transcription_available_at: new Date().toISOString(),
    })
    .eq('id', meetingId)

  if (updateErr) {
    console.error(`[zoom-recording-sync] Failed to store transcript in meetings:`, updateErr.message)
    return
  }

  console.log(`[zoom-recording-sync] Zoom auto-transcript stored for meeting ${meetingId}`)
}

// ── Fallback: queue Deepgram transcription ────────────────────────────────────
// Invokes the existing transcribe-audio-async edge function with the storage path.

async function queueDeepgramTranscription(
  supabase: ReturnType<typeof adminClient>,
  meetingId: string,
  storagePath: string,
) {
  // Update sync status to 'transcribing' so UI shows correct state
  await supabase
    .from('meetings')
    .update({ recording_sync_status: 'transcribing' })
    .eq('id', meetingId)

  // Invoke transcribe-audio-async with the recording bucket path
  // It will generate a signed URL, submit to Deepgram, and update meetings.transcript via webhook
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/transcribe-audio-async`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioPath: storagePath,
        meetingId,
        bucket: 'meeting-recordings',
      }),
    })
    console.log(`[zoom-recording-sync] Queued for Deepgram transcription: meeting ${meetingId}`)
  } catch (err) {
    console.error(`[zoom-recording-sync] Failed to queue Deepgram job:`, err)
  }
}

// ── VTT → plain text ──────────────────────────────────────────────────────────

function vttToPlainText(vtt: string): string {
  return vtt
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return (
        trimmed.length > 0 &&
        !trimmed.startsWith('WEBVTT') &&
        !trimmed.match(/^\d+$/) &&
        !trimmed.match(/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*/)
      )
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Batch processor ───────────────────────────────────────────────────────────

async function processPendingRecordings(supabase: ReturnType<typeof adminClient>) {
  // Find pending meetings that have a recording to download
  // Join with space_integrations to get the active Zoom integration for each dept
  const { data: meetings, error } = await supabase
    .from('meetings')
    .select(`
      id,
      department_id,
      zoom_recording_id,
      recording_url,
      recording_size_bytes,
      recording_sync_status,
      departments!meetings_department_id_fkey!inner(
        space_integrations!inner(id, is_active, integration_type)
      )
    `)
    .eq('recording_sync_status', 'pending')
    .not('zoom_recording_id', 'is', null)
    .not('recording_url', 'is', null)
    .order('recording_available_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) throw new Error(`Query failed: ${error.message}`)
  if (!meetings || meetings.length === 0) return { processed: 0, failed: 0 }

  let processed = 0
  let failed = 0

  for (const raw of meetings) {
    // Extract active zoom integration ID from the join
    const depts = (raw as Record<string, unknown>).departments as { space_integrations: Array<{ id: string; is_active: boolean; integration_type: string }> }
    const activeZoomIntegration = depts?.space_integrations?.find(
      si => si.integration_type === 'zoom' && si.is_active,
    )

    const meeting: MeetingRow = {
      id: raw.id as string,
      department_id: raw.department_id as string,
      zoom_recording_id: raw.zoom_recording_id as string,
      recording_url: raw.recording_url as string,
      recording_size_bytes: raw.recording_size_bytes as number | null,
      recording_sync_status: raw.recording_sync_status as string,
      integration_id: activeZoomIntegration?.id ?? null,
    }

    const result = await syncMeeting(supabase, meeting)

    if (result.success) {
      processed++
    } else {
      failed++
      console.error(`[zoom-recording-sync] Meeting ${meeting.id} failed:`, result.error)

      // Get current attempt count (stored in config or we use a simple update)
      // For now, count failures by looking at sync_error as sentinel
      // In a future iteration, add recording_sync_attempts column for tracking
      await supabase
        .from('meetings')
        .update({
          recording_sync_status: 'pending',   // retry next cron run
          recording_sync_error: result.error ?? 'Unknown error',
        })
        .eq('id', meeting.id)
    }
  }

  return { processed, failed }
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Authenticate as internal job call
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.includes(NOVA_JOBS_SECRET) && !auth.includes(SUPABASE_SERVICE_ROLE_KEY)) {
    return json(401, { error: 'Unauthorized' })
  }

  const supabase = adminClient()

  try {
    let body: { meeting_id?: string } = {}
    try { body = await req.json() } catch { /* no body = batch mode */ }

    if (body.meeting_id) {
      // Targeted sync: called from UI or another function for a specific meeting
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id, department_id, zoom_recording_id, recording_url, recording_size_bytes, recording_sync_status')
        .eq('id', body.meeting_id)
        .single()

      if (!meeting) return json(404, { error: 'Meeting not found' })

      // Fetch active zoom integration for dept
      const { data: si } = await supabase
        .from('space_integrations')
        .select('id')
        .eq('department_id', meeting.department_id)
        .eq('integration_type', 'zoom')
        .eq('is_active', true)
        .maybeSingle()

      const result = await syncMeeting(supabase, { ...meeting, integration_id: si?.id ?? null } as MeetingRow)
      return json(result.success ? 200 : 500, result)
    }

    // Batch mode: process all pending recordings
    const result = await processPendingRecordings(supabase)
    return json(200, { ...result, mode: 'batch' })

  } catch (err) {
    console.error('[zoom-recording-sync] Unhandled error:', err)
    return json(500, { error: String(err) })
  }
})
