// Register cron job in Supabase SQL Editor with:
// select cron.schedule(
//   'task-overdue-trigger-hourly',
//   '0 * * * *',  -- Every hour
//   $$
//   select net.http_post(
//     url := '[SUPABASE_PROJECT_URL]/functions/v1/task-overdue-trigger',
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
): Promise<Response> {
  const payload = {
    trigger_type: 'task_overdue',
    record: {
      ...taskData,
      space: spaceData,
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

    return await processOverdueTasks(supabase)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : ''
    console.error('[task-overdue-trigger] FATAL ERROR:', errorMsg)
    console.error('[task-overdue-trigger] Stack:', stack)
    return jsonResponse(500, {
      error: 'Internal server error',
      details: errorMsg,
      type: err?.constructor?.name
    })
  }
})

async function processOverdueTasks(supabase: ReturnType<typeof createClient>): Promise<Response> {
  const todayStr = new Date().toISOString().split('T')[0]

  // Overdue tasks: due_date < today, status category is not completed/cancelled,
  // in departments with active automations for this trigger
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select(
      `
      id,
      title,
      description,
      priority,
      assignee_id,
      department_id,
      due_date,
      status_id,
      task_status_definitions!inner!status_id(category),
      department:departments(id, name)
      `
    )
    .lt('due_date', todayStr)
    .in('task_status_definitions.category', ['open', 'in_progress'])

  if (tasksError) {
    console.error('Error fetching overdue tasks:', tasksError)
    return jsonResponse(500, { error: tasksError.message })
  }

  if (!tasks || tasks.length === 0) {
    return jsonResponse(200, { triggered: 0, message: 'No overdue tasks found' })
  }

  // Fetch departments to check if they have automation rules
  const departmentIds = [...new Set(tasks.map((t) => t.department_id))]

  const { data: automations, error: automationsError } = await supabase
    .from('automations')
    .select('id, department_id')
    .eq('trigger_type', 'task_overdue')
    .eq('enabled', true)
    .in('department_id', departmentIds)

  if (automationsError) {
    console.error('Error fetching automations:', automationsError)
    return jsonResponse(500, { error: automationsError.message })
  }

  const departmentsWithAutomations = new Set((automations || []).map((a) => a.department_id))

  // Filter tasks to only those in departments with active overdue automations
  const tasksToProcess = tasks.filter((t) => departmentsWithAutomations.has(t.department_id))

  if (tasksToProcess.length === 0) {
    return jsonResponse(200, {
      triggered: 0,
      message: 'No overdue tasks in departments with active automations',
    })
  }

  // Check for existing runs in the last 24 hours to avoid duplicate triggers
  const oneDayAgo = new Date()
  oneDayAgo.setHours(oneDayAgo.getHours() - 24)

  const { data: existingRuns, error: runsError } = await supabase
    .from('automation_run_log')
    .select('id, trigger_payload->>task_id')
    .eq('trigger_type', 'task_overdue')
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

  // Process each overdue task
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

  const triggeredTasks: Array<{ task_id: string; task_title: string }> = []
  const errors: Array<{ task_id: string; error: string }> = []

  for (const task of tasksToProcess) {
    if (alreadyTriggeredTaskIds.has(task.id)) continue

    try {
      const response = await triggerAutomationEngine(supabaseUrl, serviceRoleKey, task, task.department)

      if (!response.ok) {
        const errorBody = await response.text()
        console.error('[task-overdue-trigger] Automation engine error:', response.status, errorBody)
        errors.push({
          task_id: task.id,
          error: `HTTP ${response.status}: ${errorBody}`,
        })
      } else {
        triggeredTasks.push({
          task_id: task.id,
          task_title: task.title as string,
        })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[task-overdue-trigger] Error triggering task:', task.id, errMsg)
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
    message: `Triggered ${triggeredTasks.length} overdue task automations`,
  })
}
