import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// notify-action-item-assignees
// ----------------------------------------------------------------------------
// Inserts `task_assigned` notifications for meeting action-item assignees.
//
// Why this exists: the client runs under the assigner's JWT, and the
// `notifications` INSERT RLS policy only permits user_id = auth.uid() (or
// super_admin). So a lead assigning an action item to a member could never
// create the member's notification from the browser — the insert was blocked
// and silently swallowed. This function uses the service-role key to bypass
// RLS and insert on the assignee's behalf, after honouring their opt-out
// preference.
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface ActionItemTask {
  task_id?: string
  assignee_id?: string
  task_title?: string
  assigner_name?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  // Always succeed from the caller's perspective — notifications are best-effort
  // and must never block or fail the task-creation flow.
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const body = (await req.json().catch(() => null)) as { tasks?: ActionItemTask[] } | null
    const tasks = (body?.tasks ?? []).filter((t) => t && t.assignee_id && t.task_id)

    if (tasks.length === 0) {
      return jsonResponse(200, { success: true, delivered: 0 })
    }

    // Look up explicit opt-outs for `task_assigned` in-app notifications.
    const assigneeIds = [...new Set(tasks.map((t) => t.assignee_id as string))]
    const { data: prefRows } = await supabase
      .from('user_notification_prefs')
      .select('user_id, in_app')
      .in('user_id', assigneeIds)
      .eq('notification_type', 'task_assigned')

    const optedOut = new Set(
      (prefRows ?? []).filter((p) => p.in_app === false).map((p) => p.user_id),
    )

    const rows = tasks
      .filter((t) => !optedOut.has(t.assignee_id as string))
      .map((t) => ({
        user_id: t.assignee_id,
        type: 'task_assigned',
        payload: {
          task_id: t.task_id,
          task_title: t.task_title ?? 'a task',
          assigner_name: t.assigner_name ?? 'Someone',
        },
      }))

    if (rows.length === 0) {
      return jsonResponse(200, { success: true, delivered: 0 })
    }

    const { data: inserted, error } = await supabase
      .from('notifications')
      .insert(rows)
      .select('id')

    if (error) {
      console.error('notify-action-item-assignees insert failed:', error)
      return jsonResponse(200, { success: false, delivered: 0, error: error.message })
    }

    return jsonResponse(200, { success: true, delivered: inserted?.length ?? 0 })
  } catch (err) {
    console.error('notify-action-item-assignees error:', err)
    return jsonResponse(200, { success: false, delivered: 0, error: String(err) })
  }
})
