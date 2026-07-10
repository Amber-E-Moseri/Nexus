// Register cron job in Supabase SQL Editor with:
// select cron.schedule(
//   'delegated-task-reminders-hourly',
//   '0 * * * *',  -- Every hour
//   $$
//   select net.http_post(
//     url := '[SUPABASE_PROJECT_URL]/functions/v1/delegated-task-reminders',
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

async function triggerAutomationEngine(
  automationEngineUrl: string,
  serviceRoleKey: string,
  taskData: Record<string, unknown>,
  spaceData: Record<string, unknown>,
  daysUntilDue: number,
): Promise<Response> {
  const payload = {
    trigger_type: 'delegated_task_due_soon',
    record: {
      ...taskData,
      space: spaceData,
      days_until_due: daysUntilDue,
    },
  }

  return fetch(`${automationEngineUrl}/functions/v1/automation-engine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(payload),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const isAuthorized = await verifyServiceRole(req)
  if (!isAuthorized) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    return await processDelegatedTasksDueSoon(supabase)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : ''
    console.error('[delegated-task-reminders] FATAL ERROR:', errorMsg)
    console.error('[delegated-task-reminders] Stack:', stack)
    return jsonResponse(500, {
      error: 'Internal server error',
      details: errorMsg,
      type: err?.constructor?.name
    })
  }
})

async function processDelegatedTasksDueSoon(supabase: ReturnType<typeof createClient>): Promise<Response> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Widest lookahead any automation's days_before config might request —
  // the automation engine narrows per-automation with an exact-day match.
  const maxLookahead = new Date()
  maxLookahead.setDate(maxLookahead.getDate() + 7)
  const maxLookaheadStr = maxLookahead.toISOString().split('T')[0]

  // Delegated tasks due soon: someone else's task, created by the current
  // user, not yet overdue, not completed/cancelled, in a department with an
  // active automation for this trigger.
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select(
      `
      id,
      title,
      description,
      priority,
      assignee_id,
      created_by,
      department_id,
      due_date,
      status_id,
      task_status_definitions!inner!status_id(category),
      department:departments(id, name)
      `
    )
    .not('assignee_id', 'is', null)
    .not('created_by', 'is', null)
    .gte('due_date', todayStr)
    .lte('due_date', maxLookaheadStr)
    .in('task_status_definitions.category', ['open', 'in_progress'])

  if (tasksError) {
    console.error('Error fetching delegated tasks:', tasksError)
    return jsonResponse(500, { error: tasksError.message })
  }

  // PostgREST can't compare two columns in a filter, so finish the
  // assignee_id !== created_by check in JS.
  const delegatedTasks = (tasks || []).filter((t) => t.assignee_id !== t.created_by)

  if (delegatedTasks.length === 0) {
    return jsonResponse(200, { triggered: 0, message: 'No delegated tasks due soon' })
  }

  const departmentIds = [...new Set(delegatedTasks.map((t) => t.department_id))]

  const { data: automations, error: automationsError } = await supabase
    .from('automations')
    .select('id, department_id')
    .eq('trigger_type', 'delegated_task_due_soon')
    .eq('enabled', true)
    .in('department_id', departmentIds)

  if (automationsError) {
    console.error('Error fetching automations:', automationsError)
    return jsonResponse(500, { error: automationsError.message })
  }

  const departmentsWithAutomations = new Set((automations || []).map((a) => a.department_id))

  const tasksToProcess = delegatedTasks.filter((t) => departmentsWithAutomations.has(t.department_id))

  if (tasksToProcess.length === 0) {
    return jsonResponse(200, {
      triggered: 0,
      message: 'No delegated tasks due soon in departments with active automations',
    })
  }

  // Dedup: skip tasks already triggered for this rule in the last 24 hours.
  const oneDayAgo = new Date()
  oneDayAgo.setHours(oneDayAgo.getHours() - 24)

  const { data: existingRuns, error: runsError } = await supabase
    .from('automation_run_log')
    .select('id, trigger_payload->>task_id')
    .eq('trigger_type', 'delegated_task_due_soon')
    .gte('ran_at', oneDayAgo.toISOString())

  if (runsError) {
    console.error('Error checking existing runs:', runsError)
    return jsonResponse(500, { error: runsError.message })
  }

  const alreadyTriggeredTaskIds = new Set(
    (existingRuns || [])
      .map((r) => r['trigger_payload->>task_id'])
      .filter((id) => id)
  )

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

  const triggeredTasks: Array<{ task_id: string; task_title: string; days_until_due: number }> = []
  const errors: Array<{ task_id: string; error: string }> = []

  const msPerDay = 24 * 60 * 60 * 1000

  for (const task of tasksToProcess) {
    if (alreadyTriggeredTaskIds.has(task.id)) continue

    const daysUntilDue = Math.round(
      (new Date(task.due_date as string).getTime() - new Date(todayStr).getTime()) / msPerDay
    )

    try {
      const response = await triggerAutomationEngine(supabaseUrl, serviceRoleKey, task, task.department, daysUntilDue)

      if (!response.ok) {
        const errorBody = await response.text()
        console.error('[delegated-task-reminders] Automation engine error:', response.status, errorBody)
        errors.push({
          task_id: task.id,
          error: `HTTP ${response.status}: ${errorBody}`,
        })
      } else {
        triggeredTasks.push({
          task_id: task.id,
          task_title: task.title as string,
          days_until_due: daysUntilDue,
        })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[delegated-task-reminders] Error triggering task:', task.id, errMsg)
      errors.push({
        task_id: task.id,
        error: errMsg,
      })
    }
  }

  return jsonResponse(200, {
    triggered: triggeredTasks.length,
    tasks: triggeredTasks,
    errors: errors.length > 0 ? errors : undefined,
    message: `Triggered ${triggeredTasks.length} delegated task due-soon automations`,
  })
}
