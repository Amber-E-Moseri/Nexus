import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors })
  }

  function jsonResponse(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // SELF-ONLY: the recipient is always the authenticated caller. A body-supplied
  // user_id is ignored, so no caller can target another user. The anon key is a
  // valid JWT but has no user, so it is rejected here.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return jsonResponse(401, { error: 'Unauthorized' })
  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  const userId = authData?.user?.id
  if (authError || !userId) return jsonResponse(401, { error: 'Unauthorized' })

  // Create a test in-app notification for the authenticated caller. The DB triggers dispatch push and
  // email from this stored row (id-only, trusted-caller contract) — this function no longer calls the
  // email dispatcher with caller-shaped content.
  const { data: inserted, error: notifError } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'system',
      payload: {
        message: 'Test notification! Browser and email notifications are now enabled.',
      },
    })
    .select('id')
    .single()

  if (notifError || !inserted) {
    return jsonResponse(500, { error: 'Could not create test notification' })
  }

  // Report whether the pipeline emailed it (the email dispatcher stamps email_sent_at when it sends).
  let emailSent = false
  for (let i = 0; i < 6 && !emailSent; i++) {
    await new Promise((r) => setTimeout(r, 700))
    const { data: row } = await supabase.from('notifications').select('email_sent_at').eq('id', inserted.id).maybeSingle()
    emailSent = !!row?.email_sent_at
  }

  return jsonResponse(200, {
    success: true,
    in_app: true,
    email: emailSent,
    email_skip_reason: emailSent ? null : 'Email not sent (disabled for this type, no address, or still queued)',
  })
})
