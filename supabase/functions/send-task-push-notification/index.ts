import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { getCorsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)

  function jsonResponse(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@blwcanada.org'

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys not configured')
    return jsonResponse(500, { error: 'Push notifications not configured (missing VAPID keys)' })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const body = await req.json().catch(() => null) as {
    userId?: string
    taskId?: string
    title?: string
    message?: string
    url?: string
    type?: string
    // New: trigger-based callers pass these instead of pre-formatted title/message
    notificationType?: string
    payload?: Record<string, unknown>
  } | null

  const { userId, taskId, url = '/inbox', type } = body || {}

  if (!userId) {
    return jsonResponse(400, { error: 'Missing required field: userId' })
  }

  // Resolve title + message — prefer pre-formatted values, fall back to type+payload
  let resolvedTitle = body?.title
  let resolvedMessage = body?.message

  if (!resolvedTitle || !resolvedMessage) {
    const notifType = body?.notificationType ?? type ?? 'system'
    const payload = body?.payload ?? {}
    resolvedTitle = getNotificationLabel(notifType)
    resolvedMessage = formatMessage(notifType, payload)
  }

  if (!resolvedTitle || !resolvedMessage) {
    return jsonResponse(400, { error: 'Could not resolve notification title/message' })
  }

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('push_subscription, push_enabled')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return jsonResponse(200, { sent: 0, reason: 'User not found' })
    }

    if (!user.push_enabled || !user.push_subscription) {
      return jsonResponse(200, { sent: 0, reason: 'Push not enabled or no subscription' })
    }

    const subscription = user.push_subscription as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    const notifType = body?.notificationType ?? type ?? 'system'

    const pushPayload = JSON.stringify({
      title: resolvedTitle,
      body: resolvedMessage,
      icon: '/logo-purple-192.png',
      badge: '/logo-purple-192.png',
      tag: notifType,
      requireInteraction: false,
      data: { url, taskId, timestamp: Date.now() },
    })

    await webpush.sendNotification(subscription, pushPayload, { TTL: 86400 })

    console.log(`Push sent to user ${userId} for type ${notifType}`)
    return jsonResponse(200, { sent: 1, userId })
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 410 || status === 404) {
      await supabase
        .from('users')
        .update({ push_subscription: null, push_enabled: false })
        .eq('id', userId)
      return jsonResponse(200, { sent: 0, reason: 'Subscription expired, cleaned up' })
    }
    console.error('Push error:', err)
    return jsonResponse(200, { sent: 0, error: String(err) })
  }
})

function getNotificationLabel(type: string): string {
  const labels: Record<string, string> = {
    task_assigned:             'Task Assigned',
    task_comment:              'New Comment',
    task_due_soon:             'Task Due Soon',
    sprint_added:              'Added to Sprint',
    sprint_status:             'Sprint Update',
    sprint_access_requested:   'Sprint Access Requested',
    sprint_access_approved:    'Sprint Access Approved',
    sprint_access_rejected:    'Sprint Access Rejected',
    mention:                   'You were mentioned',
    invitation_accepted:       'Invitation Accepted',
    meeting_created:           'New Meeting',
    meeting_scheduled:         'Meeting Scheduled',
    meeting_reminder:          'Meeting Reminder',
    subtask_completed:         'Subtask Completed',
    dependency_cleared:        'Blocker Cleared',
    event_approval_pending:    'Event Awaiting Approval',
    event_approved:            'Event Approved',
    event_rejected:            'Event Rejected',
    calendar_event_reminder:   'Upcoming Event',
    calendar_sprint_prompt:    'Sprint Needed?',
    campus_edit_approved:      'Map Edit Approved',
    campus_edit_rejected:      'Map Edit Rejected',
    calendar_sync_failure:     'Calendar Sync Failed',
    support_ticket_submitted:  'New Support Ticket',
    support_ticket_reply:      'Support Ticket Reply',
    task_completed:            'Task Completed',
    system:                    'BLW CAN NEXUS',
  }
  return labels[type] ?? 'BLW CAN NEXUS'
}

function formatMessage(type: string, payload: Record<string, unknown>): string {
  const s = (key: string, fallback = 'Someone') => String(payload[key] ?? fallback)
  switch (type) {
    case 'task_assigned':
      return `${s('actor_name')} assigned you "${s('task_title', 'a task')}"`
    case 'task_comment':
    case 'comment_added':
      return `${s('author_name')} commented on "${s('task_title', 'your task')}"`
    case 'task_status_changed':
      return `"${s('task_title', 'A task')}" was moved to ${s('new_status_name', 'a new status')}`
    case 'task_due_soon':
      return `"${s('task_title', 'A task')}" is ${payload.is_overdue ? 'overdue' : 'due soon'}`
    case 'sprint_added':
      return `You were added to sprint "${s('sprint_name', 'a sprint')}"`
    case 'sprint_status':
      return `Sprint "${s('sprint_name', 'a sprint')}" moved to ${s('new_status', 'a new status')}`
    case 'sprint_access_requested':
      return `${s('requester_name')} requested access to "${s('sprint_name', 'a sprint')}"`
    case 'sprint_access_approved':
      return `Your request to join "${s('sprint_name', 'a sprint')}" was approved`
    case 'sprint_access_rejected':
      return `Your request to join "${s('sprint_name', 'a sprint')}" was rejected`
    case 'mention':
      if (payload.is_new_assignment) {
        return `${s('actor_name')} assigned you to "${s('task_title', 'a task')}"`
      }
      return `${s('actor_name')} mentioned you in "${s('task_title', 'a task')}"`
    case 'invitation_accepted':
      return `${s('user_name', 'A user')} accepted their invitation`
    case 'meeting_created':
      return `New meeting: "${s('meeting_title', 'Untitled')}"`
    case 'meeting_scheduled':
      return `You have been added to "${s('title', 'a meeting')}" on ${s('date', '')}`
    case 'meeting_reminder':
      return `"${s('title', 'A meeting')}" starts in 1 hour`
    case 'subtask_completed':
      return `"${s('title', 'A subtask')}" was completed on "${s('parentTitle', 'your task')}"`
    case 'dependency_cleared':
      return `"${s('blockerTaskTitle', 'A blocker')}" is now complete — "${s('blockedTaskTitle', 'your task')}" can proceed`
    case 'event_approved':
      return `Your event "${s('event_title', 'Untitled')}" was approved`
    case 'event_rejected':
      return `Your event "${s('event_title', 'Untitled')}" was rejected`
    case 'calendar_event_reminder':
      return `"${s('event_title', 'Untitled')}" is in ${s('days_before', '?')} days`
    case 'calendar_sprint_prompt':
      return `"${s('event_title', 'Untitled')}" is in ${s('days_before', '?')} days — time to start a sprint?`
    case 'campus_edit_approved':
      return `Your edit to "${s('campus_name', 'a campus')}" was approved`
    case 'campus_edit_rejected':
      return `Your edit to "${s('campus_name', 'a campus')}" was rejected`
    case 'calendar_sync_failure':
      return `Google Calendar sync failed: ${s('error_message', 'unknown error')}`
    case 'support_ticket_submitted':
      return `${s('submitter_name')} submitted a support request: "${s('title', 'Untitled')}"`
    case 'support_ticket_reply':
      return `Admin replied to your request: "${s('title', 'Untitled')}"`
    case 'task_completed':
      return `"${s('task_title', 'A task')}" you were watching has been completed`
    case 'system':
      return String(payload.message ?? 'System notification')
    default:
      return getNotificationLabel(type)
  }
}
