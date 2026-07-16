// Register cron job in Supabase SQL Editor with:
// select cron.schedule(
//   'due-date-reminders-hourly',
//   '0 * * * *',  -- Every hour
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

  // Get today and upcoming dates
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const inThreeDays = new Date()
  inThreeDays.setDate(inThreeDays.getDate() + 3)
  const inThreeDaysStr = inThreeDays.toISOString().split('T')[0]

  // Query tasks that are:
  // 1. Overdue (due_date < today)
  // 2. Due today
  // 3. Due within next 3 days
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, title, assignee_id, due_date, status_definition!status_id(category)')
    .lte('due_date', inThreeDaysStr)
    .neq('status_definition.category', 'completed')

  if (tasksError) {
    return jsonResponse(500, { error: tasksError.message })
  }

  if (!tasks || tasks.length === 0) {
    return jsonResponse(200, { notified: 0, message: 'No overdue or upcoming tasks' })
  }

  // Filter for users with the preference enabled
  const assigneeIds = tasks
    .filter((t) => t.assignee_id)
    .map((t) => t.assignee_id)
  const uniqueAssigneeIds = [...new Set(assigneeIds)] as string[]

  const { data: prefs } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .in('user_id', uniqueAssigneeIds)
    .eq('notification_type', 'task_due_soon')
    .eq('in_app', true)

  const enabledUserIds = new Set((prefs || []).map((p) => p.user_id))

  // Check which tasks already have notifications to avoid duplicates
  const taskUserPairs = tasks
    .filter((t) => t.assignee_id && enabledUserIds.has(t.assignee_id))
    .map((t) => ({ taskId: t.id, userId: t.assignee_id }))

  if (taskUserPairs.length === 0) {
    return jsonResponse(200, { notified: 0, message: 'No users with preference enabled' })
  }

  // Check for existing notifications from the last 24 hours
  const oneDayAgo = new Date()
  oneDayAgo.setHours(oneDayAgo.getHours() - 24)

  const { data: existingNotifications } = await supabase
    .from('notifications')
    .select('id, user_id, payload->>task_id')
    .in('user_id', uniqueAssigneeIds)
    .eq('type', 'task_due_soon')
    .gte('created_at', oneDayAgo.toISOString())

  const existingPairs = new Set(
    (existingNotifications || []).map((n) => `${n['payload->>task_id']}:${n.user_id}`)
  )

  // Build notifications for tasks that don't already have one
  const notificationsToInsert = tasks
    .filter((t) => {
      if (!t.assignee_id || !enabledUserIds.has(t.assignee_id)) return false
      return !existingPairs.has(`${t.id}:${t.assignee_id}`)
    })
    .map((task) => ({
      user_id: task.assignee_id,
      type: 'task_due_soon',
      payload: {
        task_title: task.title,
        task_id: task.id,
        due_date: task.due_date,
        is_overdue: task.due_date < todayStr,
      },
    }))

  if (notificationsToInsert.length === 0) {
    return jsonResponse(200, { notified: 0, message: 'No new notifications needed' })
  }

  const { data: inserted, error: insertError } = await supabase
    .from('notifications')
    .insert(notificationsToInsert)
    .select()

  if (insertError) {
    return jsonResponse(500, { error: insertError.message })
  }

  // Fire push notifications for each inserted notification (best-effort)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const pushResults = await Promise.allSettled(
    (inserted ?? notificationsToInsert).map((n) => {
      const taskTitle = n.payload?.task_title ?? 'A task'
      const isOverdue = n.payload?.is_overdue
      return fetch(`${supabaseUrl}/functions/v1/send-task-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          userId: n.user_id,
          taskId: n.payload?.task_id,
          title: isOverdue ? 'Task Overdue' : 'Task Due Soon',
          message: `"${taskTitle}" is ${isOverdue ? 'overdue' : 'due soon'}`,
          url: n.payload?.task_id ? `/tasks/${n.payload.task_id}` : '/inbox',
          type: 'task_due_soon',
        }),
      })
    })
  )
  const pushSent = pushResults.filter((r) => r.status === 'fulfilled').length

  return jsonResponse(200, {
    notified: notificationsToInsert.length,
    push_sent: pushSent,
    message: `Created ${notificationsToInsert.length} task due notifications, pushed ${pushSent}`,
  })
})
