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
  return data
}

export async function createMentionNotifications(commenterId, commenterName, commentBody, taskId, taskTitle) {
  // Parse @mentions from comment body: /@([a-zA-Z0-9_\s]+)/g
  const mentionPattern = /@([a-zA-Z0-9_\s]+)/g
  const matches = commentBody.match(mentionPattern) || []

  if (matches.length === 0) return []

  const mentionedNames = matches.map((match) => match.slice(1).trim())
  const uniqueNames = [...new Set(mentionedNames)]

  // Look up users by full_name or username
  const { data: foundUsers } = await supabase
    .from('users')
    .select('id, name')
    .in('name', uniqueNames)

  if (!foundUsers || foundUsers.length === 0) return []

  // Check preferences for each mentioned user
  const { data: userPrefs } = await supabase
    .from('user_notification_prefs')
    .select('user_id')
    .in('user_id', foundUsers.map((u) => u.id))
    .eq('notification_type', 'mention')
    .eq('in_app', false)

  const disabledUserIds = new Set((userPrefs || []).map((p) => p.user_id))

  // Insert notifications for enabled mentions
  const notificationsToInsert = foundUsers
    .filter((u) => u.id !== commenterId && !disabledUserIds.has(u.id))
    .map((mentionedUser) => ({
      user_id: mentionedUser.id,
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

  if (error) console.error('Failed to insert mention notifications:', error)
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
  mention: { label: "I'm @mentioned", icon: '@', description: 'When someone mentions you in a comment' },
  invitation_accepted: { label: 'Invitation accepted', icon: '✅', description: 'When a user accepts their invitation' },
  meeting_created: { label: 'Meeting created', icon: '🎙', description: 'When a meeting is created in your department' },
  absent_from_meeting: { label: 'Follow-up when I miss a meeting', icon: '📧', description: 'Follow-up email after missing a meeting' },
  event_approval_pending: { label: 'Calendar event awaiting approval', icon: '📅', description: 'When a calendar event needs your approval' },
  event_approved: { label: 'Calendar event approved', icon: '✅', description: 'When your calendar event is approved' },
  event_rejected: { label: 'Calendar event rejected', icon: '❌', description: 'When your calendar event is rejected' },
  meeting_reminder: { label: 'Meeting reminder', icon: '🔔', description: 'Reminder 1 hour before a meeting' },
  system: { label: 'System notification', icon: '🔔', description: 'Important system-wide announcements' },
  calendar_sync_failure: { label: 'Calendar sync failed', icon: '⚠️', description: 'When the Google Calendar sync fails for a space you manage' },
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
    const response = await fetch('/functions/v1/test-push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    return await response.json()
  } catch (err) {
    console.error('Failed to send test notification:', err)
    return { error: err.message }
  }
}

export async function sendTaskPushNotification(userId, data) {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-task-push-notification`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    case 'calendar_sync_failure':
      return `Google Calendar sync failed: ${payload.error_message ?? 'unknown error'}`
    case 'system':
      return payload.message ?? def.label
    default:
      return def.label
  }
}
