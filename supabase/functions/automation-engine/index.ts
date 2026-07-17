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
  to_list_id?: string
  days_inactive?: number
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
  'task.list_id': 'list_id',
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

  if (triggerType === 'task_created') {
    if (conditions.department_id) {
      return newRecord.department_id === conditions.department_id
    }
    return true
  }

  if (triggerType === 'task_moved_list') {
    if (!oldRecord || oldRecord.list_id === newRecord.list_id) return false
    if (conditions.to_list_id) return newRecord.list_id === conditions.to_list_id
    return true
  }

  if (triggerType === 'date_changed') {
    if (!oldRecord) return false
    return oldRecord.due_date !== newRecord.due_date || oldRecord.start_date !== newRecord.start_date
  }

  if (triggerType === 'assignee_removed') {
    if (!oldRecord) return false
    return oldRecord.assignee_id != null && newRecord.assignee_id == null
  }

  if (triggerType === 'comment_added') {
    if (conditions.department_id) {
      return newRecord.department_id === conditions.department_id
    }
    return true
  }

  if (triggerType === 'task_inactive') {
    // Candidate tasks are already filtered by trigger_config.days_inactive
    // in the task-inactive-trigger cron function before this engine sees them.
    return true
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

        // Look up the target user to check their automation email preferences
        const { data: targetUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', to)
          .maybeSingle()

        if (targetUser?.id) {
          // Email actions require explicit opt-in per user
          const { data: pref } = await supabase
            .from('user_automation_preferences')
            .select('enabled, email_opted_in, max_emails_per_day')
            .eq('user_id', targetUser.id)
            .eq('automation_id', automation.id)
            .maybeSingle()

          const opted = pref?.email_opted_in ?? false
          if (!opted) {
            return { action_type: 'send_email', result: { skipped: true, reason: 'not_opted_in' } }
          }

          // Enforce daily per-user email limit
          const maxPerDay = pref?.max_emails_per_day ?? 3
          if (maxPerDay > 0) {
            const { data: limitReached } = await supabase
              .rpc('user_email_limit_reached', {
                p_user_id: targetUser.id,
                p_automation_id: automation.id,
              })
            if (limitReached) {
              return { action_type: 'send_email', result: { skipped: true, reason: 'daily_limit_reached' } }
            }
          }
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

        // Log the send for daily-limit tracking
        if (targetUser?.id) {
          await supabase.from('automation_email_log').insert({
            user_id: targetUser.id,
            automation_id: automation.id,
            subject,
            recipient: to,
          })
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

      case 'update_task_status': {
        const statusId = typeof config.status === 'string' ? config.status : null
        const taskId = typeof context.task_id === 'string' ? context.task_id : (typeof context.id === 'string' ? context.id : null)

        if (!statusId || !taskId) {
          return { action_type: 'update_task_status', result: { skipped: true, reason: 'missing_status_or_task' } }
        }

        const { data: statusDef, error: statusError } = await supabase
          .from('task_status_definitions')
          .select('id, legacy_key, category')
          .eq('id', statusId)
          .single()

        if (statusError || !statusDef) {
          return { action_type: 'update_task_status', result: { skipped: true, reason: 'status_not_found' } }
        }

        const { error } = await supabase
          .from('tasks')
          .update({
            status_id: statusDef.id,
            status: statusDef.legacy_key ?? undefined,
            completed_at: statusDef.category === 'completed' ? new Date().toISOString() : null,
          })
          .eq('id', taskId)

        if (error) throw error
        return { action_type: 'update_task_status', result: { updated_task_id: taskId, status_id: statusDef.id } }
      }

      case 'assign_task': {
        const taskId = typeof context.task_id === 'string' ? context.task_id : (typeof context.id === 'string' ? context.id : null)
        if (!taskId) {
          return { action_type: 'assign_task', result: { skipped: true, reason: 'missing_task' } }
        }

        let assigneeId: string | null = null
        if (config.assignee_id === '__creator__') {
          assigneeId = typeof context.created_by === 'string' ? context.created_by : null
        } else if (typeof config.assignee_id === 'string' && config.assignee_id) {
          assigneeId = config.assignee_id
        }

        if (!assigneeId) {
          return { action_type: 'assign_task', result: { skipped: true, reason: 'no_assignee_resolved' } }
        }

        const { error } = await supabase.from('tasks').update({ assignee_id: assigneeId }).eq('id', taskId)
        if (error) throw error
        return { action_type: 'assign_task', result: { updated_task_id: taskId, assignee_id: assigneeId } }
      }

      case 'set_field': {
        const taskId = typeof context.task_id === 'string' ? context.task_id : (typeof context.id === 'string' ? context.id : null)
        const field = typeof config.field === 'string' ? config.field : null

        if (!taskId || !field || !['due_date', 'start_date'].includes(field)) {
          return { action_type: 'set_field', result: { skipped: true, reason: 'invalid_field_or_task' } }
        }

        let value: string
        if (typeof config.relative_days === 'number') {
          const target = new Date()
          target.setDate(target.getDate() + config.relative_days)
          value = target.toISOString().split('T')[0]
        } else if (typeof config.value === 'string' && config.value) {
          value = config.value
        } else {
          value = new Date().toISOString().split('T')[0]
        }

        const { error } = await supabase.from('tasks').update({ [field]: value }).eq('id', taskId)
        if (error) throw error
        return { action_type: 'set_field', result: { updated_task_id: taskId, field, value } }
      }

      case 'clear_field': {
        const taskId = typeof context.task_id === 'string' ? context.task_id : (typeof context.id === 'string' ? context.id : null)
        const field = typeof config.field === 'string' ? config.field : null

        if (!taskId || !field || !['due_date', 'start_date', 'assignee_id'].includes(field)) {
          return { action_type: 'clear_field', result: { skipped: true, reason: 'invalid_field_or_task' } }
        }

        const { error } = await supabase.from('tasks').update({ [field]: null }).eq('id', taskId)
        if (error) throw error
        return { action_type: 'clear_field', result: { updated_task_id: taskId, field } }
      }

      case 'move_to_list': {
        const taskId = typeof context.task_id === 'string' ? context.task_id : (typeof context.id === 'string' ? context.id : null)
        const listId = typeof config.list_id === 'string' ? config.list_id : null

        if (!taskId || !listId) {
          return { action_type: 'move_to_list', result: { skipped: true, reason: 'missing_list_or_task' } }
        }

        const { error } = await supabase.from('tasks').update({ list_id: listId }).eq('id', taskId)
        if (error) throw error
        return { action_type: 'move_to_list', result: { updated_task_id: taskId, list_id: listId } }
      }

      case 'shift_dependent_dates': {
        const taskId = typeof context.task_id === 'string' ? context.task_id : (typeof context.id === 'string' ? context.id : null)
        const dueDelta = typeof context.due_date_delta_days === 'number' ? context.due_date_delta_days : null
        const startDelta = typeof context.start_date_delta_days === 'number' ? context.start_date_delta_days : null

        if (!taskId || (!dueDelta && !startDelta)) {
          return { action_type: 'shift_dependent_dates', result: { skipped: true, reason: 'no_date_delta' } }
        }

        const { data: dependents, error: depsError } = await supabase
          .from('task_dependencies')
          .select('task_id, tasks!task_id(id, due_date, start_date)')
          .eq('depends_on_id', taskId)

        if (depsError) throw depsError
        if (!dependents?.length) {
          return { action_type: 'shift_dependent_dates', result: { shifted: 0 } }
        }

        const shiftDate = (value: unknown, days: number): string | null => {
          if (typeof value !== 'string') return null
          const d = new Date(value)
          d.setDate(d.getDate() + days)
          return d.toISOString().split('T')[0]
        }

        let shifted = 0
        for (const dep of dependents) {
          const dependentTask = (dep as { tasks?: { id: string; due_date: string | null; start_date: string | null } }).tasks
          if (!dependentTask) continue

          const update: Record<string, string | null> = {}
          if (dueDelta && dependentTask.due_date) update.due_date = shiftDate(dependentTask.due_date, dueDelta)
          if (startDelta && dependentTask.start_date) update.start_date = shiftDate(dependentTask.start_date, startDelta)

          if (Object.keys(update).length === 0) continue

          const { error: updateError } = await supabase.from('tasks').update(update).eq('id', dependentTask.id)
          if (!updateError) shifted += 1
        }

        return { action_type: 'shift_dependent_dates', result: { shifted } }
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

  // Native Supabase DB webhooks (Edge Function type) send the service_role key,
  // which is not a user JWT and will fail getUser(). Detect these by decoding the
  // role claim without signature verification — if role === 'service_role' we trust
  // it as a valid internal call. All other callers still go through full JWT verification.
  let isServiceRole = false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    isServiceRole = payload?.role === 'service_role'
  } catch { /* not a JWT at all — fall through to full verification */ }

  if (!isServiceRole) {
    const jwtData = await verifyJwt(supabase, token)
    if (!jwtData) {
      return jsonResponse(401, { error: 'Invalid JWT token' })
    }
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' })
  }

  // Native Supabase Edge Function webhooks send { type, table, schema, record, old_record }
  // instead of our custom { trigger_type, record/new_record/old_record } shape.
  // Normalise them here so the rest of the engine is unchanged.
  if (typeof body.type === 'string' && typeof body.table === 'string' && !body.trigger_type) {
    const eventType = (body.type as string).toUpperCase()
    const table = body.table as string

    if (eventType === 'INSERT' && table === 'tasks') {
      body = { trigger_type: 'task_created', record: body.record }
    } else if (eventType === 'UPDATE' && table === 'tasks') {
      // Detect which kind of change this UPDATE represents and fan out to the
      // appropriate trigger_type. The engine will be called once per detected
      // change type — if a single UPDATE changes both status and assignee, we
      // handle the first match only (most significant change wins).
      const rec = body.record as Record<string, unknown>
      const old = body.old_record as Record<string, unknown> | null
      let detectedTrigger = 'task_status_change' // default

      if (old) {
        if (old.assignee_id == null && rec.assignee_id != null) {
          detectedTrigger = 'task_assigned'
        } else if (old.assignee_id != null && rec.assignee_id == null) {
          detectedTrigger = 'assignee_removed'
        } else if (old.list_id !== rec.list_id) {
          detectedTrigger = 'task_moved_list'
        } else if (old.due_date !== rec.due_date || old.start_date !== rec.start_date) {
          detectedTrigger = 'date_changed'
        } else if (old.assignee_id !== rec.assignee_id) {
          detectedTrigger = 'task_assigned'
        }
        // status change is the default fallback
      }

      body = { trigger_type: detectedTrigger, new_record: body.record, old_record: body.old_record }
    } else if (eventType === 'INSERT' && table === 'meetings') {
      body = { trigger_type: 'meeting_created', record: body.record }
    } else if (eventType === 'INSERT' && table === 'task_comments') {
      body = { trigger_type: 'comment_added', record: body.record }
    }
  }

  const triggerType = typeof body.trigger_type === 'string' ? body.trigger_type : null
  if (!triggerType) {
    return jsonResponse(400, { error: 'trigger_type is required' })
  }

  let newRecord: Record<string, unknown> | null = null
  let oldRecord: Record<string, unknown> | null = null

  const NEW_OLD_RECORD_TRIGGERS = [
    'task_status_change',
    'task_assigned',
    'task_moved_list',
    'date_changed',
    'assignee_removed',
  ]
  const RECORD_ONLY_TRIGGERS = [
    'meeting_created',
    'task_overdue',
    'delegated_task_due_soon',
    'task_created',
    'task_inactive',
    'comment_added',
  ]

  if (NEW_OLD_RECORD_TRIGGERS.includes(triggerType)) {
    newRecord = typeof body.new_record === 'object' && body.new_record ? (body.new_record as Record<string, unknown>) : null
    oldRecord = typeof body.old_record === 'object' && body.old_record ? (body.old_record as Record<string, unknown>) : null
  } else if (RECORD_ONLY_TRIGGERS.includes(triggerType)) {
    newRecord = typeof body.record === 'object' && body.record ? (body.record as Record<string, unknown>) : null
  }

  if (!newRecord) {
    return jsonResponse(400, { error: 'record data is required' })
  }

  // task_comments rows carry no department_id/sprint_id of their own — resolve
  // the parent task so scoping and action context (assignee, status, etc.)
  // work the same way they do for task-shaped triggers.
  if (triggerType === 'comment_added') {
    const taskId = typeof newRecord.task_id === 'string' ? newRecord.task_id : null
    if (!taskId) {
      return jsonResponse(400, { error: 'comment record is missing task_id' })
    }

    const { data: parentTask, error: parentTaskError } = await supabase
      .from('tasks')
      .select('id, department_id, sprint_id, title, assignee_id, created_by, status, priority')
      .eq('id', taskId)
      .single()

    if (parentTaskError || !parentTask) {
      return jsonResponse(200, { matched: 0, message: 'Parent task not found for comment' })
    }

    newRecord = {
      ...newRecord,
      task_id: taskId,
      department_id: parentTask.department_id,
      sprint_id: parentTask.sprint_id,
      task_title: parentTask.title,
      assignee_id: parentTask.assignee_id,
      created_by: parentTask.created_by,
      status: parentTask.status,
      priority: parentTask.priority,
    }
  }

  // Task assigned condition: check if assignment actually changed
  if (triggerType === 'task_assigned' && oldRecord) {
    if (oldRecord.assignee_id === newRecord.assignee_id) {
      return jsonResponse(200, { matched: 0, message: 'No assignment change detected' })
    }
  }

  if (triggerType === 'task_moved_list' && (!oldRecord || oldRecord.list_id === newRecord.list_id)) {
    return jsonResponse(200, { matched: 0, message: 'No list change detected' })
  }

  if (triggerType === 'date_changed' && (!oldRecord || (oldRecord.due_date === newRecord.due_date && oldRecord.start_date === newRecord.start_date))) {
    return jsonResponse(200, { matched: 0, message: 'No date change detected' })
  }

  if (triggerType === 'assignee_removed' && (!oldRecord || oldRecord.assignee_id == null || newRecord.assignee_id != null)) {
    return jsonResponse(200, { matched: 0, message: 'No assignee removal detected' })
  }

  // date_changed carries the shift delta so shift_dependent_dates can move
  // dependent tasks by the same number of days rather than re-deriving it.
  let dueDateDeltaDays: number | null = null
  let startDateDeltaDays: number | null = null
  if (triggerType === 'date_changed' && oldRecord) {
    const diffDays = (a: unknown, b: unknown): number | null => {
      if (typeof a !== 'string' || typeof b !== 'string') return null
      const diffMs = new Date(a).getTime() - new Date(b).getTime()
      if (Number.isNaN(diffMs)) return null
      return Math.round(diffMs / (1000 * 60 * 60 * 24))
    }
    dueDateDeltaDays = diffDays(newRecord.due_date, oldRecord.due_date)
    startDateDeltaDays = diffDays(newRecord.start_date, oldRecord.start_date)
  }

  // Automations are scoped to a department or a sprint (see automations_select
  // RLS policy) — an automation must never fire for a record outside its own
  // scope, or a department's rule could act on another department's data.
  const recordDepartmentId = typeof newRecord.department_id === 'string' ? newRecord.department_id : null
  const recordSprintId = typeof newRecord.sprint_id === 'string' ? newRecord.sprint_id : null

  const scopeClauses: string[] = ['department_id.is.null'] // always include org-wide automations
  if (recordDepartmentId) scopeClauses.push(`department_id.eq.${recordDepartmentId}`)
  if (recordSprintId) scopeClauses.push(`sprint_id.eq.${recordSprintId}`)

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
  const recordId = typeof newRecord.id === 'string' ? newRecord.id : null

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

      // Loop guard: actions like move_to_list/update_task_status can trigger
      // another DB webhook that re-invokes this same automation for the same
      // record (e.g. two rules that move a task back and forth between
      // lists). Skip if this automation already fired for this exact record
      // moments ago, bounding any accidental cycle instead of letting it run
      // away.
      if (recordId) {
        const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString()
        const { data: recentRuns } = await supabase
          .from('automation_run_log')
          .select('id')
          .eq('automation_id', automation.id)
          .eq('trigger_payload->new_record->>id', recordId)
          .gte('ran_at', fiveSecondsAgo)
          .limit(1)

        if (recentRuns?.length) {
          actionsExecuted.push({ result: { skipped: true, reason: 'loop_guard' } })
          await supabase.from('automation_run_log').insert({
            automation_id: automation.id,
            trigger_type: triggerType,
            trigger_payload: { ...body, new_record: newRecord, old_record: oldRecord },
            actions_executed: actionsExecuted,
            success: true,
            error_message: null,
            triggered_by_user_id: jwtData.sub,
          })
          continue
        }
      }

      const actionContext = {
        ...newRecord,
        old_status: oldRecord?.status,
        due_date_delta_days: dueDateDeltaDays,
        start_date_delta_days: startDateDeltaDays,
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
