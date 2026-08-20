// recordingSyncWorker — processes pending Zoom recording downloads.
// Called by nova-jobs dispatcher every 15 minutes via pg_cron.
// Delegates actual sync to zoom-recording-sync edge function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

export async function recordingSyncWorker(serviceClient: ReturnType<typeof createClient>) {
  // Check how many pending recordings need attention
  const { count } = await serviceClient
    .from('meetings')
    .select('id', { count: 'exact', head: true })
    .eq('recording_sync_status', 'pending')
    .not('zoom_recording_id', 'is', null)
    .not('recording_url', 'is', null)

  if (!count || count === 0) {
    return { pending: 0, triggered: 0 }
  }

  // Delegate to zoom-recording-sync (handles batching, token refresh, retries)
  const res = await fetch(`${SUPABASE_URL}/functions/v1/zoom-recording-sync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),  // empty body = batch mode
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`zoom-recording-sync failed (${res.status}): ${err}`)
  }

  const result = await res.json()
  return { pending: count, ...result }
}
