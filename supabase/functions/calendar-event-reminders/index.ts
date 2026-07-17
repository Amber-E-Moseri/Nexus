// Register cron in Supabase SQL Editor with:
// select cron.schedule(
//   'calendar-event-reminders-daily',
//   '0 8 * * *',
//   $$
//   select net.http_post(
//     url := '[SUPABASE_PROJECT_URL]/functions/v1/calendar-event-reminders',
//     headers := '{"Authorization":"Bearer [SERVICE_ROLE_KEY]"}'::jsonb
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

type ReminderConfig = {
  days_before: number
  sprint_prompt?: boolean
}

type CalendarEventType = {
  name: string
  reminder_configs: ReminderConfig[] | null
}

type CalendarEvent = {
  id: string
  title: string
  event_type: string | null
  start_date: string
  department_id: string | null
  sprint_id: string | null
  created_by: string | null
  reminder_overrides: ReminderConfig[] | null
}

function isValidReminderConfig(value: unknown): value is ReminderConfig {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return Number.isInteger(entry.days_before) && Number(entry.days_before) >= 0
}

function parseReminderConfigs(value: unknown): ReminderConfig[] | null {
  if (!Array.isArray(value)) return null
  const parsed = value.filter(isValidReminderConfig).map((entry) => ({
    days_before: Number(entry.days_before),
    sprint_prompt: entry.sprint_prompt === true,
  }))
  return parsed.length === value.length ? parsed : null
}

function toDateKey(value: Date) {
  return value.toISOString().split('T')[0]
}

function subtractDays(dateString: string, days: number) {
  const date = new Date(dateString)
  date.setUTCDate(date.getUTCDate() - days)
  return date
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: typeRows, error: typeError } = await supabase
    .from('calendar_event_types')
    .select('name, reminder_configs')
    .eq('active', true)

  if (typeError) {
    return jsonResponse(500, { error: typeError.message })
  }

  const typeConfigMap = new Map<string, ReminderConfig[]>()
  let maxDaysBefore = 0

  for (const row of (typeRows ?? []) as CalendarEventType[]) {
    const configs = parseReminderConfigs(row.reminder_configs)
    if (!configs || configs.length === 0) continue
    typeConfigMap.set(row.name, configs)
    for (const config of configs) {
      maxDaysBefore = Math.max(maxDaysBefore, config.days_before)
    }
  }

  if (!Number.isFinite(maxDaysBefore) || maxDaysBefore <= 0) {
    return jsonResponse(200, { notified: 0, message: 'No active types with reminder configs' })
  }

  const windowEnd = new Date()
  windowEnd.setUTCDate(windowEnd.getUTCDate() + maxDaysBefore)

  const { data: events, error: eventsError } = await supabase
    .from('calendar_events')
    .select('id, title, event_type, start_date, department_id, sprint_id, created_by, reminder_overrides')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .gte('start_date', new Date().toISOString())
    .lte('start_date', windowEnd.toISOString())

  if (eventsError) {
    return jsonResponse(500, { error: eventsError.message })
  }

  const todayKey = toDateKey(new Date())
  const results: Array<Record<string, unknown>> = []
  let notificationsCreated = 0
  let pushSent = 0

  // Cache dept→user-id lists to avoid N+1 queries when multiple events share a department
  const deptUsersCache = new Map<string, string[]>()
  async function getDeptUsers(deptId: string): Promise<string[]> {
    if (deptUsersCache.has(deptId)) return deptUsersCache.get(deptId)!
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .eq('department_id', deptId)
      .eq('status', 'active')
    if (usersError) throw usersError
    const ids = (users ?? []).map((u) => u.id as string).filter(Boolean)
    deptUsersCache.set(deptId, ids)
    return ids
  }

  for (const event of (events ?? []) as CalendarEvent[]) {
    const effectiveConfigs = event.reminder_overrides == null
      ? typeConfigMap.get(event.event_type ?? '') ?? []
      : parseReminderConfigs(event.reminder_overrides)

    if (event.reminder_overrides != null && !effectiveConfigs) {
      console.warn('[calendar-event-reminders] invalid reminder_overrides for event', event.id)
      continue
    }

    if (!effectiveConfigs || effectiveConfigs.length === 0) continue

    for (const config of effectiveConfigs) {
      const targetDate = subtractDays(event.start_date, config.days_before)
      if (toDateKey(targetDate) !== todayKey) continue

      const { data: logRows, error: logError } = await supabase
        .from('calendar_event_reminder_log')
        .upsert(
          { event_id: event.id, days_before: config.days_before },
          { onConflict: 'event_id,days_before', ignoreDuplicates: true },
        )
        .select('id')

      if (logError) {
        console.error('[calendar-event-reminders] failed to claim reminder slot', event.id, logError)
        results.push({ event_id: event.id, days_before: config.days_before, error: logError.message })
        continue
      }

      if (!logRows?.length) continue

      const recipientIds = new Set<string>()
      if (event.created_by) recipientIds.add(event.created_by)

      if (event.department_id) {
        try {
          const deptUserIds = await getDeptUsers(event.department_id)
          for (const uid of deptUserIds) recipientIds.add(uid)
        } catch (usersError: unknown) {
          const msg = usersError instanceof Error ? usersError.message : String(usersError)
          console.error('[calendar-event-reminders] failed to load department users', event.id, usersError)
          results.push({ event_id: event.id, days_before: config.days_before, error: msg })
          continue
        }
      }

      const sprintPrompt = config.sprint_prompt === true && !event.sprint_id
      const notificationType = sprintPrompt ? 'calendar_sprint_prompt' : 'calendar_event_reminder'
      const recipientList = [...recipientIds]

      if (recipientList.length === 0) {
        results.push({ event_id: event.id, days_before: config.days_before, recipients: 0 })
        continue
      }

      const { data: prefRows, error: prefError } = await supabase
        .from('user_notification_prefs')
        .select('user_id, in_app')
        .in('user_id', recipientList)
        .eq('notification_type', notificationType)

      if (prefError) {
        console.error('[calendar-event-reminders] failed to load prefs', event.id, prefError)
        results.push({ event_id: event.id, days_before: config.days_before, error: prefError.message })
        continue
      }

      const prefMap = new Map((prefRows ?? []).map((row) => [row.user_id, row.in_app]))
      const enabledRecipients = recipientList.filter((userId) => prefMap.get(userId) !== false)

      if (enabledRecipients.length === 0) {
        results.push({ event_id: event.id, days_before: config.days_before, recipients: 0 })
        continue
      }

      const notificationPayload = {
        event_id: event.id,
        event_title: event.title,
        department_id: event.department_id,
        days_before: config.days_before,
      }

      const { data: insertedNotifications, error: notificationError } = await supabase
        .from('notifications')
        .insert(
          enabledRecipients.map((userId) => ({
            user_id: userId,
            type: notificationType,
            payload: notificationPayload,
          })),
        )
        .select('user_id, type, payload')

      if (notificationError) {
        console.error('[calendar-event-reminders] failed to insert notifications', event.id, notificationError)
        results.push({ event_id: event.id, days_before: config.days_before, error: notificationError.message })
        continue
      }

      notificationsCreated += insertedNotifications?.length ?? enabledRecipients.length

      const pushUrl = sprintPrompt
        ? `/sprints?new=1&event_id=${encodeURIComponent(event.id)}&name=${encodeURIComponent(event.title)}&dept=${encodeURIComponent(event.department_id ?? '')}`
        : '/calendar'

      const pushTitle = sprintPrompt ? 'Upcoming Event Sprint Prompt' : 'Upcoming Calendar Event'
      const pushMessage = sprintPrompt
        ? `"${event.title}" is in ${config.days_before} days - time to start a sprint?`
        : `"${event.title}" is in ${config.days_before} days`

      const pushResults = await Promise.allSettled(
        enabledRecipients.map((userId) =>
          fetch(`${supabaseUrl}/functions/v1/send-task-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              userId,
              title: pushTitle,
              message: pushMessage,
              url: pushUrl,
              type: notificationType,
            }),
          })
        ),
      )

      pushSent += pushResults.filter((result) => result.status === 'fulfilled').length
      results.push({
        event_id: event.id,
        days_before: config.days_before,
        recipients: enabledRecipients.length,
        notification_type: notificationType,
      })
    }
  }

  return jsonResponse(200, {
    notified: notificationsCreated,
    push_sent: pushSent,
    results,
  })
})
