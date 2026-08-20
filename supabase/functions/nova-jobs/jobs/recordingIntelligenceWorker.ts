// recordingIntelligenceWorker — routes completed Zoom recording transcripts through
// extract-meeting-data, the same extraction pipeline used for manually-uploaded
// and live-transcribed meetings. Called by nova-jobs dispatcher every 30 minutes
// via pg_cron. Picks up meetings with recording_sync_status='complete' whose
// extraction hasn't succeeded yet (extraction_status is 'idle' or 'failed').

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const BATCH_SIZE = 3  // limit AI calls per cron run; each recording = 1 Claude call

const ZOOM_TRANSCRIPT_CONTEXT =
  "This transcript was auto-generated from a Zoom cloud recording (Zoom's built-in " +
  'transcription or Deepgram fallback). Speaker labels may be missing, generic ' +
  "(e.g. 'Speaker 1'), or occasionally misattributed — don't treat speaker attribution " +
  "as authoritative if it looks inconsistent with what's being said."

export async function recordingIntelligenceWorker(serviceClient: ReturnType<typeof createClient>) {
  // Find meetings with a completed recording sync + transcript that haven't
  // been successfully extracted yet (idle = never tried, failed = eligible for retry).
  const { data: meetings, error } = await serviceClient
    .from('meetings')
    .select('id, transcript, date')
    .eq('recording_sync_status', 'complete')
    .not('transcript', 'is', null)
    .in('extraction_status', ['idle', 'failed'])
    .order('recording_transcription_available_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) throw new Error(`Query failed: ${error.message}`)
  if (!meetings || meetings.length === 0) {
    return { eligible: 0, processed: 0, failed: 0 }
  }

  let processed = 0
  let failed = 0

  for (const meeting of meetings) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/extract-meeting-data`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcript: meeting.transcript,
            context: ZOOM_TRANSCRIPT_CONTEXT,
            meetingId: meeting.id,
            meeting_date: meeting.date,  // stable date preserves the extraction cache across retries
          }),
        },
      )

      if (!res.ok) {
        const err = await res.text()
        console.error(`[recordingIntelligenceWorker] Extraction failed for ${meeting.id}: ${err}`)
        failed++
      } else {
        processed++
      }
    } catch (err) {
      console.error(`[recordingIntelligenceWorker] Error for ${meeting.id}:`, err)
      failed++
    }
  }

  return { eligible: meetings.length, processed, failed }
}
