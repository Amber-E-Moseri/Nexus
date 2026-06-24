import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

const corsHeaders = ALLOWED_ORIGIN
  ? {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    }
  : {}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing environment variables' })
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header' })
  }

  let requestBody: { notification_ids?: string[] } | null = null
  try {
    requestBody = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  if (!Array.isArray(requestBody?.notification_ids) || requestBody.notification_ids.length === 0) {
    return jsonResponse(400, { error: 'notification_ids is required and must be a non-empty array' })
  }

  // Validate user authentication
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return jsonResponse(401, { error: 'Unable to validate caller' })
  }

  try {
    const userId = authData.user.id
    const notificationIds = requestBody.notification_ids

    // Update all notifications to mark as read
    const { error: updateError } = await supabase
      .from('app_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_user_id', userId)
      .in('id', notificationIds)
      .is('read_at', null) // Only update unread notifications

    if (updateError) {
      return jsonResponse(500, { error: `Failed to mark notifications as read: ${updateError.message}` })
    }

    // Get updated unread count
    const { data: readState, error: countError } = await supabase
      .from('notification_read_state')
      .select('unread_count')
      .eq('user_id', userId)
      .single()

    if (countError) {
      return jsonResponse(500, { error: `Failed to fetch unread count: ${countError.message}` })
    }

    return jsonResponse(200, {
      success: true,
      marked_count: notificationIds.length,
      unread_count: readState?.unread_count ?? 0,
    })
  } catch (error) {
    console.error('Error in mark-notification-read:', error)
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})
