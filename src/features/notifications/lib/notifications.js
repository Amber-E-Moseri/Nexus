import { supabase } from '../../../lib/supabase'

export async function getNotifications(userId, limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, payload, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function getUnreadCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)

  if (error) throw error
  return count ?? 0
}

export async function markAsRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)

  if (error) throw error
}

export async function markAllAsRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)

  if (error) throw error
}

export async function createNotification(userId, type, payload) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, type, payload })
    .select()
    .single()

  if (error) throw error
  dispatchPush(userId, data)
  return data
}

export async function createMentionNotifications(commenterId, commenterName, mentionedUserIds, taskId, taskTitle) {
  if (!mentionedUserIds || mentionedUserIds.length === 0) return []

  // Check preferences for each mentioned user
  const { data: userPrefs } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .in('user_id', mentionedUserIds)
    .eq('notification_type', 'mention')
    .eq('in_app', false)

  const disabledUserIds = new Set((userPrefs || []).map((p) => p.user_id))

  // Insert notifications for enabled mentions (excluding self-mentions)
  const notificationsToInsert = mentionedUserIds
    .filter((userId) => userId !== commenterId && !disabledUserIds.has(userId))
    .map((userId) => ({
      user_id: userId,
      type: 'mention',
      payload: {
        actor_name: commenterName,
        task_title: taskTitle,
        task_id: taskId,
      },
    }))

  if (notificationsToInsert.length === 0) return []

  const { data: inserted, error } = await supabase
    .from('notifications')
    .insert(notificationsToInsert)
    .select()

  if (error) {
    console.error('Failed to insert mention notifications:', error)
  } else {
    for (const notification of inserted ?? []) {
      dispatchPush(notification.user_id, notification)
    }
  }
  return inserted || []
}

export async function getNotificationPrefs(userId) {
  const { data, error } = await supabase
    .from('user_notification_prefs')
    .select('notification_type, in_app, email')
    .eq('user_id', userId)

  if (error) throw error

  const prefs = {}
  for (const row of data ?? []) {
    prefs[row.notification_type] = { in_app: row.in_app, email: row.email }
  }
  return prefs
}

export async function setNotificationPref(userId, type, inApp, email) {
  const { error } = await supabase
    .from('user_notification_prefs')
    .upsert(
      {
        user_id: userId,
        notification_type: type,
        in_app: inApp,
        email,
      },
      { onConflict: 'user_id,notification_type' },
    )

  if (error) throw error
}

export const NOTIFICATION_TYPES = {
  task_assigned: { label: 'Task assigned to me', icon: '📋', description: 'When someone assigns a task to you' },
  task_comment: { label: 'Comment on my task', icon: '💬', description: 'When someone comments on your task' },
  task_due_soon: { label: 'Task due date approaching', icon: '⏰', description: 'When a task is due soon' },
  sprint_added: { label: 'Added to a sprint', icon: '⚡', description: 'When you are added to a sprint' },
  sprint_status: { label: 'Sprint status changed', icon: '🔄', description: 'When sprint status changes' },
  sprint_access_requested: { label: 'Sprint access requested', icon: '🔐', description: 'When someone requests access to a sprint you manage' },
  sprint_access_approved: { label: 'Sprint access approved', icon: '✅', description: 'When your sprint access request is approved' },
  sprint_access_rejected: { label: 'Sprint access rejected', icon: '❌', description: 'When your sprint access request is rejected' },
  mention: { label: "I'm @mentioned", icon: '@', description: 'When someone mentions you in a comment' },
  invitation_accepted: { label: 'Invitation accepted', icon: '✅', description: 'When a user accepts their invitation' },
  meeting_created: { label: 'Meeting created', icon: '🎙', description: 'When a meeting is created in your department' },
  absent_from_meeting: { label: 'Follow-up when I miss a meeting', icon: '📧', description: 'Follow-up email after missing a meeting' },
  event_approval_pending: { label: 'Calendar event awaiting approval', icon: '📅', description: 'When a calendar event needs your approval' },
  event_approved: { label: 'Calendar event approved', icon: '✅', description: 'When your calendar event is approved' },
  event_rejected: { label: 'Calendar event rejected', icon: '❌', description: 'When your calendar event is rejected' },
  campus_edit_approved: { label: 'Map edit approved', icon: '✅', description: 'When your campus map edit is approved' },
  campus_edit_rejected: { label: 'Map edit rejected', icon: '❌', description: 'When your campus map edit is rejected' },
  meeting_reminder: { label: 'Meeting reminder', icon: '🔔', description: 'Reminder 1 hour before a meeting' },
  system: { label: 'System notification', icon: '🔔', description: 'Important system-wide announcements' },
  calendar_sync_failure: { label: 'Calendar sync failed', icon: '⚠️', description: 'When the Google Calendar sync fails for a space you manage' },
  support_ticket_submitted: { label: 'New support ticket', icon: '🎫', description: 'When a team member submits a support request' },
  support_ticket_reply: { label: 'Reply on your support ticket', icon: '💬', description: 'When admin replies to your support request' },
}

export async function sendBrowserPushNotification(title, options = {}) {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    return false
  }

  if (Notification.permission !== 'granted') {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(title, {
      icon: '/logo.png',
      badge: '/logo.png',
      ...options,
    })
    return true
  } catch (err) {
    console.error('Failed to send browser push notification:', err)
    return false
  }
}

export async function testPushNotifications(userId) {
  try {
    const { data: session } = await supabase.auth.getSession()
    const token = session?.session?.access_token
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-push-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ user_id: userId }),
      },
    )
    return await response.json()
  } catch (err) {
    console.error('Failed to send test notification:', err)
    return { error: err.message }
  }
}

export async function sendTaskPushNotification(userId, data) {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-task-push-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId,
          taskId: data.taskId,
          title: data.title,
          message: data.message,
          url: data.url,
          type: data.type || 'task',
        }),
      }
    )

    const result = await response.json()
    if (result.sent) {
      console.log('Push notification sent:', result)
    }
    return result
  } catch (err) {
    console.error('Failed to send push notification:', err)
    return { error: err.message }
  }
}

// Fire-and-forget: mobile push is best-effort and must never block or fail
// in-app notification creation. sendTaskPushNotification already no-ops
// server-side when the user has no active push subscription.
function dispatchPush(userId, notification) {
  if (typeof userId !== 'string' || !notification) return
  const def = NOTIFICATION_TYPES[notification.type]
  sendTaskPushNotification(userId, {
    taskId: notification.payload?.task_id,
    title: def?.label ?? 'BLW CAN NEXUS',
    message: formatNotificationMessage(notification),
    url: '/inbox',
    type: notification.type,
  }).catch(() => {})
}

export function formatNotificationMessage(notification) {
  const { type, payload } = notification
  const def = NOTIFICATION_TYPES[type] ?? { label: type, icon: '🔔' }

  switch (type) {
    case 'task_assigned':
      return `${payload.assigner_name ?? 'Someone'} assigned you "${payload.task_title ?? 'a task'}"`
    case 'task_comment':
    case 'comment_added':
      return `${payload.author_name ?? 'Someone'} commented on "${payload.task_title ?? 'your task'}"`
    case 'sprint_added':
      return `You were added to sprint "${payload.sprint_name ?? 'a sprint'}"`
    case 'sprint_status':
      return `Sprint "${payload.sprint_name}" moved to ${payload.new_status}`
    case 'sprint_access_requested':
      return `${payload.requester_name ?? 'Someone'} requested access to "${payload.sprint_name ?? 'a sprint'}"`
    case 'sprint_access_approved':
      return `Your request to join "${payload.sprint_name ?? 'a sprint'}" was approved`
    case 'sprint_access_rejected':
      return `Your request to join "${payload.sprint_name ?? 'a sprint'}" was rejected${payload.message ? `: ${payload.message}` : ''}`
    case 'invitation_accepted':
      return `${payload.user_name ?? 'A user'} accepted their invitation`
    case 'meeting_created':
      return `New meeting: "${payload.meeting_title ?? 'Untitled'}"`
    case 'mention':
      return `${payload.actor_name ?? 'Someone'} mentioned you`
    case 'task_due_soon':
      return `"${payload.task_title ?? 'A task'}" is due soon`
    case 'event_approved':
      return `Your event "${payload.event_title ?? 'Untitled'}" was approved`
    case 'event_rejected':
      return `Your event "${payload.event_title ?? 'Untitled'}" was rejected`
    case 'campus_edit_approved':
      return `Your edit to "${payload.campus_name ?? 'a campus'}" (${payload.field_name ?? 'field'}) was approved`
    case 'campus_edit_rejected':
      return `Your edit to "${payload.campus_name ?? 'a campus'}" was rejected${payload.notes ? `: ${payload.notes}` : ''}`
    case 'calendar_sync_failure':
      return `Google Calendar sync failed: ${payload.error_message ?? 'unknown error'}`
    case 'support_ticket_submitted':
      return `${payload.submitter_name ?? 'Someone'} submitted a ${payload.category?.replace('_', ' ') ?? 'support'} request: "${payload.title ?? 'Untitled'}"`
    case 'support_ticket_reply':
      return `Admin replied to your request: "${payload.title ?? 'Untitled'}"`
    case 'system':
      return payload.message ?? def.label
    default:
      return def.label
  }
}
