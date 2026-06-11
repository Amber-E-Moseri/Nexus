import { supabase } from './supabase'

export async function getNotifications(limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, payload, read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function getUnreadCount() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
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

export async function markAllAsRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
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
  task_assigned: { label: 'Task assigned to you', icon: '📋' },
  task_due_soon: { label: 'Task due soon', icon: '⏰' },
  sprint_added: { label: 'Added to a sprint', icon: '⚡' },
  sprint_status: { label: 'Sprint status changed', icon: '🔄' },
  invitation_accepted: { label: 'Invitation accepted', icon: '✅' },
  meeting_created: { label: 'New meeting scheduled', icon: '🎙' },
  comment_added: { label: 'New comment on your task', icon: '💬' },
  mention: { label: 'You were mentioned', icon: '@' },
}

export function formatNotificationMessage(notification) {
  const { type, payload } = notification
  const def = NOTIFICATION_TYPES[type] ?? { label: type, icon: '🔔' }

  switch (type) {
    case 'task_assigned':
      return `${payload.assigner_name ?? 'Someone'} assigned you "${payload.task_title ?? 'a task'}"`
    case 'sprint_added':
      return `You were added to sprint "${payload.sprint_name ?? 'a sprint'}"`
    case 'sprint_status':
      return `Sprint "${payload.sprint_name}" moved to ${payload.new_status}`
    case 'invitation_accepted':
      return `${payload.user_name ?? 'A user'} accepted their invitation`
    case 'meeting_created':
      return `New meeting: "${payload.meeting_title ?? 'Untitled'}"`
    case 'comment_added':
      return `${payload.author_name ?? 'Someone'} commented on "${payload.task_title ?? 'your task'}"`
    default:
      return def.label
  }
}
