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

// Verifies the JWT's signature against Supabase Auth (unlike jwt-decode,
// which only base64-decodes the payload and would accept any well-formed
// but unsigned/forged token). A service-role client is required here since
// this function has no anon key context of its own.
async function verifyJwt(
  supabase: ReturnType<typeof createClient>,
  token: string,
): Promise<{ sub: string } | null> {
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) {
    return null
  }
  return { sub: data.user.id }
}

function isSafeWebhookUrl(value: string): boolean {
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

function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = context[key]
    return value != null ? String(value) : `{{${key}}}`
  })
}

type TriggerConditions = {
  from_status?: string
  to_status?: string
  any_status_change?: boolean
  department_id?: string
  days_before?: number
}

// The "IF conditions" step in AutomationBuilder — up to 3 field/operator/value
// filters, ANDed together, stored in automations.conditions.
type BuilderCondition = {
  field: string
  operator: string
  value?: string
}

const CONDITION_FIELD_MAP: Record<string, string> = {
  'task.status': 'status',
  'task.priority': 'priority',
  'task.department': 'department_id',
  'task.assignee': 'assignee_id',
}

function evaluateBuilderConditions(
  conditions: BuilderCondition[] | null,
  record: Record<string, unknown>,
): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true

  return conditions.every((condition) => {
    const recordKey = CONDITION_FIELD_MAP[condition.field]
    if (!recordKey) return true

    const actual = record[recordKey]

    switch (condition.operator) {
      case 'equals':
        return String(actual ?? '') === String(condition.value ?? '')
      case 'not equals':
        return String(actual ?? '') !== String(condition.value ?? '')
      case 'is empty':
        return actual == null || actual === ''
      case 'is not empty':
        return actual != null && actual !== ''
      default:
        return true
    }
  })
}

function evaluateTriggerConditions(
  triggerType: string,
  conditions: TriggerConditions | null,
  newRecord: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null,
): boolean {
  if (!conditions) return true

  if (triggerType === 'task_status_change') {
    if (oldRecord?.status === newRecord.status) return false

    if (conditions.from_status && conditions.to_status) {
      return oldRecord?.status === conditions.from_status && newRecord.status === conditions.to_status
    }

    if (conditions.any_status_change) return true

    if (conditions.from_status && oldRecord?.status !== conditions.from_status) return false
    if (conditions.to_status && newRecord.status !== conditions.to_status) return false

    return true
  }

  if (triggerType === 'task_assigned') {
    if (conditions.department_id) {
      return newRecord.department_id === conditions.department_id
    }
    return true
  }

  if (triggerType === 'meeting_created') {
    if (conditions.department_id) {
      return newRecord.department_id === conditions.department_id
    }
    return true
  }

  if (triggerType === 'task_overdue') {
    // task_overdue doesn't need special trigger conditions,
    // just basic department scoping (handled elsewhere)
    return true
  }

  if (triggerType === 'delegated_task_due_soon') {
    const daysBefore = typeof conditions.days_before === 'number' ? conditions.days_before : 1
    return newRecord.days_until_due === daysBefore
  }

  return true
}

async function executeAction(
  supabase: ReturnType<typeof createClient>,
  action: { type?: string; config?: Record<string, unknown> },
  context: Record<string, unknown>,
  automation: Record<string, unknown>,
): Promise<{ action_type?: string; result?: unknown; error?: string }> {
  const config = action.config ?? {}

  try {
    switch (action.type) {
      case 'send_notification': {
        let userId: string | null = null

        if (config.user_id === 'assigned_to') {
          userId = typeof context.assignee_id === 'string' ? context.assignee_id : null
        } else if (config.user_id === 'created_by') {
          userId = typeof context.created_by === 'string' ? context.created_by : null
        } else if (typeof config.user_id === 'string') {
          userId = config.user_id
        }

        if (!userId) {
          return { action_type: 'send_notification', result: { skipped: true, reason: 'no_user_id' } }
        }

        const message = typeof config.message === 'string' ? renderTemplate(config.message, context) : ''

        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'automation',
          payload: {
            message,
            automation_name: automation.name,
          },
        })

        return { action_type: 'send_notification', result: { notified: userId } }
      }

      case 'send_email': {
        const to = typeof config.to === 'string' ? renderTemplate(config.to, context) : null
        const subject = typeof config.subject === 'string' ? renderTemplate(config.subject, context) : 'Notification'
        const body = typeof config.body === 'string' ? renderTemplate(config.body, context) : ''

        if (!to) {
          return { action_type: 'send_email', result: { skipped: true, reason: 'no_email' } }
        }

        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        if (!resendApiKey) {
          return { action_type: 'send_email', result: { skipped: true, reason: 'no_api_key' } }
        }

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'noreply@blwcannexus.org',
            to,
            subject,
            html: body,
          }),
        })

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json()
          throw new Error(`Resend API error: ${JSON.stringify(errorData)}`)
        }

        return { action_type: 'send_email', result: { sent: true } }
      }

      case 'create_task': {
        const title = typeof config.title === 'string' ? renderTemplate(config.title, context) : 'Automated task'

        let dueDate: string | null = null
        if (typeof config.due_offset_days === 'number') {
          const future = new Date()
          future.setDate(future.getDate() + config.due_offset_days)
          dueDate = future.toISOString().split('T')[0]
        }

        let assigneeId: string | null = null
        if (config.assignee_id === 'task_assigned_to') {
          assigneeId = typeof context.assignee_id === 'string' ? context.assignee_id : null
        } else if (typeof config.assignee_id === 'string' && config.assignee_id) {
          assigneeId = config.assignee_id
        }

        // department_id is always the automation's own department, never a
        // client-supplied value from action config — otherwise a department's
        // automation could be configured to create tasks inside another
        // department's space.
        const { data: task, error } = await supabase
          .from('tasks')
          .insert({
            title,
            department_id: typeof automation.department_id === 'string' ? automation.department_id : null,
            assignee_id: assigneeId,
            status: 'backlog',
            priority: typeof config.priority === 'string' ? config.priority : 'medium',
            source: 'automation',
            source_name: String(automation.name ?? 'Automation'),
            task_type: 'space',
            is_personal: false,
            due_date: dueDate,
          })
          .select()
          .single()

        if (error) throw error
        return { action_type: 'create_task', result: { created_task_id: task?.id } }
      }

      case 'post_webhook': {
        const url = typeof config.url === 'string' ? config.url : null
        if (!url) {
          return { action_type: 'post_webhook', result: { skipped: true, reason: 'missing_url' } }
        }

        if (!isSafeWebhookUrl(url)) {
          return { action_type: 'post_webhook', result: { skipped: true, reason: 'unsafe_url' } }
        }

        let bodyTemplate = config.body_template
        if (!bodyTemplate) {
          bodyTemplate = JSON.stringify(context)
        } else if (typeof bodyTemplate === 'string') {
          bodyTemplate = renderTemplate(bodyTemplate, context)
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: typeof bodyTemplate === 'string' ? bodyTemplate : JSON.stringify(bodyTemplate),
        })

        const responseBody = await response.text()

        await supabase.from('webhook_delivery_log').insert({
          automation_id: automation.id,
          webhook_url: url,
          payload: context,
          response_status: response.status,
          response_body: responseBody.slice(0, 500),
        })

        return { action_type: 'post_webhook', result: { status: response.status } }
      }

      default:
        return { action_type: action.type, result: { skipped: true, reason: 'unknown_action_type' } }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return { action_type: action.type, error: errorMsg }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  // ✅ JWT VALIDATION: Verify authorization header
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Missing or invalid Authorization header' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const token = authHeader.substring(7)
  const jwtData = await verifyJwt(supabase, token)
  if (!jwtData) {
    return jsonResponse(401, { error: 'Invalid JWT token' })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' })
  }

  const triggerType = typeof body.trigger_type === 'string' ? body.trigger_type : null
  if (!triggerType) {
    return jsonResponse(400, { error: 'trigger_type is required' })
  }

  let newRecord: Record<string, unknown> | null = null
  let oldRecord: Record<string, unknown> | null = null

  if (triggerType === 'task_status_change' || triggerType === 'task_assigned') {
    newRecord = typeof body.new_record === 'object' && body.new_record ? (body.new_record as Record<string, unknown>) : null
    oldRecord = typeof body.old_record === 'object' && body.old_record ? (body.old_record as Record<string, unknown>) : null
  } else if (triggerType === 'meeting_created' || triggerType === 'task_overdue' || triggerType === 'delegated_task_due_soon') {
    newRecord = typeof body.record === 'object' && body.record ? (body.record as Record<string, unknown>) : null
  }

  if (!newRecord) {
    return jsonResponse(400, { error: 'record data is required' })
  }

  // Task assigned condition: check if assignment actually changed
  if (triggerType === 'task_assigned' && oldRecord) {
    if (oldRecord.assignee_id === newRecord.assignee_id) {
      return jsonResponse(200, { matched: 0, message: 'No assignment change detected' })
    }
  }

  // Automations are scoped to a department or a sprint (see automations_select
  // RLS policy) — an automation must never fire for a record outside its own
  // scope, or a department's rule could act on another department's data.
  const recordDepartmentId = typeof newRecord.department_id === 'string' ? newRecord.department_id : null
  const recordSprintId = typeof newRecord.sprint_id === 'string' ? newRecord.sprint_id : null

  const scopeClauses: string[] = []
  if (recordDepartmentId) scopeClauses.push(`department_id.eq.${recordDepartmentId}`)
  if (recordSprintId) scopeClauses.push(`sprint_id.eq.${recordSprintId}`)

  if (scopeClauses.length === 0) {
    return jsonResponse(200, { matched: 0, message: 'Record has no department or sprint scope' })
  }

  const { data: automations, error } = await supabase
    .from('automations')
    .select('*')
    .eq('trigger_type', triggerType)
    .eq('enabled', true)
    .or(scopeClauses.join(','))

  if (error) {
    console.error('Error fetching automations:', error.message)
    return jsonResponse(500, { error: error.message })
  }

  if (!automations?.length) {
    return jsonResponse(200, { matched: 0, message: 'No matching automations' })
  }

  const results: Array<Record<string, unknown>> = []

  for (const automation of automations) {
    const runStart = Date.now()
    const actionsExecuted: Array<Record<string, unknown>> = []
    let runSuccess = true
    let runError: string | null = null

    try {
      const triggerConditions = automation.trigger_config as TriggerConditions | null

      const conditionsMet =
        evaluateTriggerConditions(triggerType, triggerConditions, newRecord, oldRecord)
        && evaluateBuilderConditions(automation.conditions as BuilderCondition[] | null, newRecord)

      if (!conditionsMet) {
        continue
      }

      const actionContext = {
        ...newRecord,
        old_status: oldRecord?.status,
      }

      for (const action of automation.actions ?? []) {
        const actionResult = await executeAction(supabase, action, actionContext, automation)
        actionsExecuted.push(actionResult)

        if (actionResult.error) {
          runSuccess = false
        }
      }

      await supabase
        .from('automations')
        .update({
          last_fired_at: new Date().toISOString(),
          fire_count: (automation.fire_count ?? 0) + 1,
        })
        .eq('id', automation.id)
    } catch (err) {
      runSuccess = false
      runError = err instanceof Error ? err.message : String(err)
    }

    await supabase.from('automation_run_log').insert({
      automation_id: automation.id,
      trigger_type: triggerType,
      trigger_payload: { ...body, new_record: newRecord, old_record: oldRecord },
      actions_executed: actionsExecuted,
      success: runSuccess,
      error_message: runError,
      triggered_by_user_id: jwtData.sub,
    })

    results.push({ automation_id: automation.id, success: runSuccess, actions: actionsExecuted.length })
  }

  return jsonResponse(200, { matched: automations.length, results })
})
