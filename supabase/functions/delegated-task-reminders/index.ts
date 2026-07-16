// Cron: runs hourly via pg_cron (see 20261210000000_task_overdue_trigger_cron.sql pattern)
// Notifies task CREATORS when a task they delegated is due within 1, 3, or 7 days.
// Notifications go directly into the notifications table — no automation config required.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

async function verifyServiceRole(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  return token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })
  if (!(await verifyServiceRole(req))) return jsonResponse(401, { error: 'Unauthorized' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Look ahead 7 days — covers 1-day, 3-day, and 7-day reminder milestones
  const maxLookahead = new Date()
  maxLookahead.setDate(maxLookahead.getDate() + 7)
  const maxLookaheadStr = maxLookahead.toISOString().split('T')[0]

  // Fetch delegated tasks (assignee ≠ creator) that are upcoming and incomplete
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      due_date,
      assignee_id,
      created_by,
      department_id,
      assignee:users!assignee_id(id, name),
      status_def:task_status_definitions!status_id(category)
    `)
    .not('assignee_id', 'is', null)
    .not('created_by', 'is', null)
    .gte('due_date', todayStr)
    .lte('due_date', maxLookaheadStr)
    .is('deleted_at', null)

  if (tasksError) {
    console.error('[delegated-task-reminders] Error fetching tasks:', tasksError)
    return jsonResponse(500, { error: tasksError.message })
  }

  const msPerDay = 24 * 60 * 60 * 1000

  // Only truly delegated tasks, not completed/cancelled
  const delegated = (tasks ?? []).filter((t) => {
    if (t.assignee_id === t.created_by) return false
    const cat = (t.status_def as any)?.category
    if (cat === 'completed' || cat === 'cancelled') return false
    return true
  })

  if (delegated.length === 0) {
    return jsonResponse(200, { notified: 0, message: 'No delegated tasks due soon' })
  }

  // Dedup: skip any task that already got a delegated-reminder notification in last 24h
  const oneDayAgo = new Date()
  oneDayAgo.setHours(oneDayAgo.getHours() - 24)

  const taskIds = delegated.map((t) => t.id)

  const { data: existingNotifs } = await supabase
    .from('notifications')
    .select('payload')
    .eq('type', 'delegated_task_due_soon')
    .gte('created_at', oneDayAgo.toISOString())

  const alreadyNotifiedTaskIds = new Set(
    (existingNotifs ?? [])
      .map((n) => (n.payload as any)?.task_id)
      .filter(Boolean)
  )

  const toNotify = delegated.filter((t) => !alreadyNotifiedTaskIds.has(t.id))

  if (toNotify.length === 0) {
    return jsonResponse(200, { notified: 0, message: 'All delegated tasks already notified in last 24h' })
  }

  const notifications = toNotify.map((task) => {
    const daysUntilDue = Math.round(
      (new Date(task.due_date as string).getTime() - new Date(todayStr).getTime()) / msPerDay
    )
    const assigneeName = (task.assignee as any)?.name ?? 'Someone'
    const dueSoonLabel = daysUntilDue === 0
      ? 'due today'
      : daysUntilDue === 1
        ? 'due tomorrow'
        : `due in ${daysUntilDue} days`

    return {
      user_id: task.created_by,
      type: 'delegated_task_due_soon',
      payload: {
        task_id: task.id,
        task_title: task.title,
        due_date: task.due_date,
        days_until_due: daysUntilDue,
        assignee_name: assigneeName,
        message: `"${task.title}" assigned to ${assigneeName} is ${dueSoonLabel}.`,
      },
    }
  })

  const { error: insertError } = await supabase
    .from('notifications')
    .insert(notifications)

  if (insertError) {
    console.error('[delegated-task-reminders] Insert error:', insertError)
    return jsonResponse(500, { error: insertError.message })
  }

  return jsonResponse(200, {
    notified: notifications.length,
    message: `Created ${notifications.length} delegated task due-soon notifications`,
  })
})
