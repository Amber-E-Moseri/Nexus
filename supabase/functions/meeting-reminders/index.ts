// Bug 7c: No meeting_reminder notifications were being sent.
// This function runs hourly and notifies meeting attendees 1 hour before their meeting starts.
//
// Register cron job in Supabase SQL Editor:
// select cron.schedule(
//   'meeting-reminders-hourly',
//   '0 * * * *',
//   $$
//   select net.http_post(
//     url := '[SUPABASE_PROJECT_URL]/functions/v1/meeting-reminders',
//     headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
//   );
//   $$
// );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)

  function jsonResponse(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authHeader || authHeader.replace('Bearer ', '') !== serviceRoleKey) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey ?? '',
  )

  const now = new Date()
  // Window: meetings starting between 55 min and 65 min from now
  const windowStart = new Date(now.getTime() + 55 * 60 * 1000).toISOString()
  const windowEnd   = new Date(now.getTime() + 65 * 60 * 1000).toISOString()

  // Fetch meetings in the window
  const { data: meetings, error: meetingsError } = await supabase
    .from('meetings')
    .select('id, title, scheduled_at, space_id')
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd)

  if (meetingsError) {
    console.error('Failed to fetch meetings:', meetingsError)
    return jsonResponse(500, { error: meetingsError.message })
  }

  if (!meetings || meetings.length === 0) {
    return jsonResponse(200, { notified: 0, reason: 'No meetings in window' })
  }

  let notified = 0
  const errors: string[] = []

  for (const meeting of meetings) {
    const formattedDate = new Date(meeting.scheduled_at).toLocaleTimeString('en-CA', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Toronto',
    })

    const payload = {
      meeting_id:    meeting.id,
      meeting_title: meeting.title,
      title:         meeting.title,
      date:          formattedDate,
      scheduled_at:  meeting.scheduled_at,
    }

    // Get all attendees for this meeting
    const { data: attendees, error: attendeesError } = await supabase
      .from('meeting_attendees')
      .select('user_id')
      .eq('meeting_id', meeting.id)

    if (attendeesError) {
      errors.push(`meeting ${meeting.id}: ${attendeesError.message}`)
      continue
    }

    for (const attendee of attendees ?? []) {
      const { error: insertError } = await supabase
        .from('notifications')
        .insert({ user_id: attendee.user_id, type: 'meeting_reminder', payload })

      if (insertError) {
        errors.push(`user ${attendee.user_id}: ${insertError.message}`)
      } else {
        notified++
      }
    }
  }

  console.log(`meeting-reminders: notified ${notified} attendees, ${errors.length} errors`)
  return jsonResponse(200, { notified, errors: errors.length > 0 ? errors : undefined })
})
