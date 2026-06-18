import { supabase } from './supabase'

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
  task_assigned: { label: 'Task assigned to me', icon: '📋' },
  task_comment: { label: 'Comment on my task', icon: '💬' },
  task_due_soon: { label: 'Task due date approaching', icon: '⏰' },
  sprint_added: { label: 'Added to a sprint', icon: '⚡' },
  sprint_status: { label: 'Sprint status changed', icon: '🔄' },
  invitation_accepted: { label: 'Invitation accepted', icon: '✅' },
  meeting_created: { label: 'Meeting created in my dept', icon: '🎙' },
  comment_added: { label: 'Comment on my task', icon: '💬' },
  mention: { label: "I'm @mentioned", icon: '@' },
  event_approved: { label: 'Calendar event approved', icon: '✅' },
  event_rejected: { label: 'Calendar event rejected', icon: '❌' },
  system: { label: 'System notification', icon: '🔔' },
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
      return `${payload.author_name ?? 'Someone'} mentioned you`
    case 'task_due_soon':
      return `"${payload.task_title ?? 'A task'}" is due soon`
    case 'event_approved':
      return `Your event "${payload.event_title ?? 'Untitled'}" was approved`
    case 'event_rejected':
      return `Your event "${payload.event_title ?? 'Untitled'}" was rejected`
    case 'system':
      return payload.message ?? def.label
    default:
      return def.label
  }
}
