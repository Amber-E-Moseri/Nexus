import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, Authorization',
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

function isSafeWebhookUrl(value: string) {
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    return false
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return false
  }

  const hostname = parsed.hostname.toLowerCase()

  if (hostname === 'localhost' || hostname === '::1') {
    return false
  }

  if (hostname === '169.254.169.254') {
    return false
  }

  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return false
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return false
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return false
  }

  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return false
  }

  const octets = hostname.split('.').map((part) => Number(part))
  if (
    octets.length === 4 &&
    octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    octets[0] === 172 &&
    octets[1] >= 16 &&
    octets[1] <= 31
  ) {
    return false
  }

  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing Authorization header' })
  }

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await callerClient.auth.getUser()
  if (authError || !user) {
    return jsonResponse(401, { error: 'Invalid or expired token' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: caller } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (caller?.role !== 'super_admin' && caller?.role !== 'dept_lead') {
    return jsonResponse(403, { error: 'Forbidden: insufficient role' })
  }

  const body = await req.json().catch(() => null) as
    | { trigger_type?: string; trigger_payload?: Record<string, unknown> }
    | null

  const triggerType = body?.trigger_type
  const triggerPayload = body?.trigger_payload ?? {}

  if (!triggerType) {
    return jsonResponse(400, { error: 'trigger_type is required' })
  }

  const { data: automations, error } = await supabase
    .from('automations')
    .select('*')
    .eq('trigger_type', triggerType)
    .eq('enabled', true)

  if (error) {
    return jsonResponse(500, { error: error.message })
  }

  if (!automations?.length) {
    return jsonResponse(200, { matched: 0, message: 'No matching automations' })
  }

  const results: Array<Record<string, unknown>> = []

  for (const automation of automations) {
    const runStart = Date.now()
    const actionsTaken: Array<Record<string, unknown>> = []
    let runStatus: 'success' | 'failed' | 'partial' = 'success'
    let runError: string | null = null

    try {
      const conditionsMet = evaluateConditions(automation.conditions, triggerPayload)
      if (!conditionsMet) {
        results.push({ automation_id: automation.id, skipped: true, reason: 'conditions_not_met' })
        continue
      }

      for (const action of automation.actions ?? []) {
        const result = await executeAction(supabase, action, triggerPayload, automation)
        actionsTaken.push({ action_type: action.type, result })
      }

      await supabase
        .from('automations')
        .update({
          last_fired_at: new Date().toISOString(),
          fire_count: (automation.fire_count ?? 0) + 1,
        })
        .eq('id', automation.id)
    } catch (err) {
      runStatus = 'failed'
      runError = err instanceof Error ? err.message : String(err)
    }

    await supabase.from('automation_runs').insert({
      automation_id: automation.id,
      trigger_payload: triggerPayload,
      actions_taken: actionsTaken,
      status: runStatus,
      error: runError,
      duration_ms: Date.now() - runStart,
    })

    results.push({ automation_id: automation.id, status: runStatus, actions: actionsTaken.length })
  }

  return jsonResponse(200, { matched: automations.length, results })
})

function evaluateConditions(
  conditions: Array<{ field?: string; operator?: string; value?: unknown }> | null,
  payload: Record<string, unknown>,
) {
  if (!conditions?.length) return true

  return conditions.every((condition) => {
    const value = condition.field ? payload[condition.field] : undefined

    switch (condition.operator) {
      case 'equals':
        return value === condition.value
      case 'not_equals':
        return value !== condition.value
      case 'is_empty':
        return !value
      case 'not_empty':
        return !!value
      default:
        return true
    }
  })
}

async function executeAction(
  supabase: ReturnType<typeof createClient>,
  action: { type?: string; config?: Record<string, unknown> },
  payload: Record<string, unknown>,
  automation: Record<string, unknown>,
) {
  const config = action.config ?? {}

  switch (action.type) {
    case 'notify_user': {
      const userId = typeof config.user_id === 'string' ? config.user_id : null
      if (!userId) return { skipped: true, reason: 'missing user_id' }

      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'automation',
        payload: {
          message: config.message,
          automation_name: automation.name,
          ...payload,
        },
      })

      return { notified: userId }
    }

    case 'update_task_status': {
      const taskId = typeof payload.task_id === 'string' ? payload.task_id : null
      const status = typeof config.status === 'string' ? config.status : null
      if (!taskId || !status) return { skipped: true }

      await supabase.from('tasks').update({ status }).eq('id', taskId)
      return { updated_status: status }
    }

    case 'create_task': {
      const taskTitle =
        typeof config.title_template === 'string'
          ? config.title_template.replace('{{trigger}}', String(payload.title ?? ''))
          : String(config.title ?? 'Automation task')

      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          title: taskTitle,
          department_id:
            typeof config.department_id === 'string'
              ? config.department_id
              : (automation.department_id as string | null) ?? null,
          assignee_id: typeof config.assignee_id === 'string' ? config.assignee_id : null,
          status: 'backlog',
          priority: typeof config.priority === 'string' ? config.priority : 'medium',
          source: 'automation',
          source_name: String(automation.name ?? 'Automation'),
          task_type: 'space',
          is_personal: false,
        })
        .select()
        .single()

      if (error) throw error
      return { created_task_id: task?.id }
    }

    case 'post_webhook': {
      const url = typeof config.url === 'string' ? config.url : null
      if (!url) return { skipped: true, reason: 'missing url' }
      if (!isSafeWebhookUrl(url)) return { skipped: true, reason: 'unsafe_url' }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, automation_name: automation.name }),
      })

      return { webhook_status: response.status }
    }

    default:
      return { skipped: true, reason: `unknown action type: ${action.type}` }
  }
}
