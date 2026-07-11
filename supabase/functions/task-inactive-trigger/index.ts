// Register cron job in Supabase SQL Editor with (already done for this
// project by 20261227000000_automation_engine_expansion.sql):
// select cron.schedule(
//   'task-inactive-trigger-daily',
//   '30 6 * * *',
//   $$
//   select net.http_post(
//     url := '[SUPABASE_PROJECT_URL]/functions/v1/task-inactive-trigger',
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
): Promise<Response> {
  const payload = {
    trigger_type: 'task_inactive',
    record: taskData,
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

    return await processInactiveTasks(supabase)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[task-inactive-trigger] FATAL ERROR:', errorMsg)
    return jsonResponse(500, { error: 'Internal server error', details: errorMsg })
  }
})

async function processInactiveTasks(supabase: ReturnType<typeof createClient>): Promise<Response> {
  const { data: automations, error: automationsError } = await supabase
    .from('automations')
    .select('id, department_id, trigger_config')
    .eq('trigger_type', 'task_inactive')
    .eq('enabled', true)

  if (automationsError) {
    console.error('Error fetching automations:', automationsError)
    return jsonResponse(500, { error: automationsError.message })
  }

  if (!automations?.length) {
    return jsonResponse(200, { triggered: 0, message: 'No active task_inactive automations' })
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

  const triggeredTasks: Array<{ task_id: string; automation_id: string }> = []
  const errors: Array<{ task_id: string; error: string }> = []

  for (const automation of automations) {
    if (!automation.department_id) continue

    const triggerConfig = (automation.trigger_config ?? {}) as { days_inactive?: number }
    const daysInactive = typeof triggerConfig.days_inactive === 'number' ? triggerConfig.days_inactive : 7

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysInactive)

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
        updated_at,
        status_id,
        task_status_definitions!inner!status_id(category)
        `
      )
      .eq('department_id', automation.department_id)
      .lt('updated_at', cutoff.toISOString())
      .in('task_status_definitions.category', ['open', 'in_progress'])

    if (tasksError) {
      console.error('Error fetching inactive tasks:', tasksError)
      continue
    }

    if (!tasks?.length) continue

    // One reminder per task per calendar day, not per cron tick.
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data: existingRuns } = await supabase
      .from('automation_run_log')
      .select('trigger_payload->>task_id')
      .eq('automation_id', automation.id)
      .eq('trigger_type', 'task_inactive')
      .gte('ran_at', todayStart.toISOString())

    const alreadyTriggeredTaskIds = new Set(
      (existingRuns || []).map((r) => r['trigger_payload->>task_id']).filter((id) => id)
    )

    for (const task of tasks) {
      if (alreadyTriggeredTaskIds.has(task.id)) continue

      try {
        const response = await triggerAutomationEngine(supabaseUrl, serviceRoleKey, task)
        if (!response.ok) {
          const errorBody = await response.text()
          errors.push({ task_id: task.id, error: `HTTP ${response.status}: ${errorBody}` })
        } else {
          triggeredTasks.push({ task_id: task.id, automation_id: automation.id })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        errors.push({ task_id: task.id, error: errMsg })
      }
    }
  }

  return jsonResponse(200, {
    triggered: triggeredTasks.length,
    tasks: triggeredTasks,
    errors: errors.length > 0 ? errors : undefined,
  })
}
