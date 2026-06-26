// Register cron job in Supabase SQL Editor with:
// select cron.schedule(
//   'due-date-reminders',
//   '0 12 * * *',  -- 12:00 UTC = 8am ET
//   $$
//   select net.http_post(
//     url := '[SUPABASE_PROJECT_URL]/functions/v1/due-date-reminders',
//     headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
//   );
//   $$
// );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

async function verifyServiceRole(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return false

  const token = authHeader.replace('Bearer ', '')
  const expectedToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  return token === expectedToken
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  if (!(await verifyServiceRole(req))) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Query tasks due tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, title, assigned_to')
    .neq('status', 'done')
    .like('due_date', `${tomorrowStr}%`)

  if (tasksError) {
    return jsonResponse(500, { error: tasksError.message })
  }

  if (!tasks || tasks.length === 0) {
    return jsonResponse(200, { notified: 0, message: 'No tasks due tomorrow' })
  }

  // Filter for users with the preference enabled
  const assigneeIds = tasks
    .filter((t) => t.assigned_to)
    .map((t) => t.assigned_to)
  const uniqueAssigneeIds = [...new Set(assigneeIds)] as string[]

  const { data: prefs } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .in('user_id', uniqueAssigneeIds)
    .eq('notification_type', 'task_due_soon')
    .eq('in_app', true)

  const enabledUserIds = new Set((prefs || []).map((p) => p.user_id))

  // Insert notifications
  const notificationsToInsert = tasks
    .filter((t) => t.assigned_to && enabledUserIds.has(t.assigned_to))
    .map((task) => ({
      user_id: task.assigned_to,
      type: 'task_due_soon',
      payload: {
        task_title: task.title,
        task_id: task.id,
      },
    }))

  if (notificationsToInsert.length === 0) {
    return jsonResponse(200, { notified: 0, message: 'No users with preference enabled' })
  }

  const { error: insertError } = await supabase
    .from('notifications')
    .insert(notificationsToInsert)

  if (insertError) {
    return jsonResponse(500, { error: insertError.message })
  }

  return jsonResponse(200, { notified: notificationsToInsert.length })
})
