import { supabase } from './supabase'
import { hasPermission } from './permissions'
import { createNotification } from './notifications'

export async function getCalendarEvents(startDate, endDate) {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(`
      id, title, description, event_type, start_date, end_date,
      all_day, location, zoom_join_url, space_id, sprint_id, created_by, created_at,
      status, department_id, approved_by, approved_at, rejection_note, is_org_wide
    `)
    .gte('start_date', startDate.toISOString())
    .lte('start_date', endDate.toISOString())
    .eq('status', 'approved')
    .order('start_date', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getUpcomingEvents(limit = 5) {
  const now = new Date()
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, title, event_type, start_date, end_date, all_day, location, zoom_join_url, sprint_id, space_id, status, department_id')
    .gte('start_date', now.toISOString())
    .lte('start_date', future.toISOString())
    .order('start_date', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function getMonthEvents(year, month) {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0, 23, 59, 59)
  return getCalendarEvents(start, end)
}

export async function createCalendarEvent(eventData, createdBy) {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({ ...eventData, created_by: createdBy })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateCalendarEvent(eventId, updates) {
  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', eventId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteCalendarEvent(eventId) {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', eventId)

  if (error) throw error
}

// ---- Approval workflow ----

export async function submitEvent(eventData, userId) {
  const eventToInsert = {
    ...eventData,
    status: 'pending',
    created_by: userId,
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(eventToInsert)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getPendingEvents() {
  const { data, error } = await supabase
    .rpc('get_pending_calendar_events')

  if (error) throw error
  return data ?? []
}

export async function approveEvent(eventId) {
  const { error } = await supabase
    .rpc('approve_calendar_event', { event_id: eventId })

  if (error) throw error

  const { data: event } = await supabase
    .from('calendar_events')
    .select('id, title, created_by')
    .eq('id', eventId)
    .single()

  if (event?.created_by) {
    await createNotification({
      recipient_id: event.created_by,
      type: 'calendar_event_approved',
      related_resource_type: 'calendar_event',
      related_resource_id: eventId,
      title: `Event approved: ${event.title}`,
      description: `Your calendar event "${event.title}" has been approved.`,
    }).catch(() => {})
  }

  return event
}

export async function rejectEvent(eventId, rejectionNote) {
  const { error } = await supabase
    .rpc('reject_calendar_event', { event_id: eventId, note: rejectionNote })

  if (error) throw error

  const { data: event } = await supabase
    .from('calendar_events')
    .select('id, title, created_by')
    .eq('id', eventId)
    .single()

  if (event?.created_by) {
    await createNotification({
      recipient_id: event.created_by,
      type: 'calendar_event_rejected',
      related_resource_type: 'calendar_event',
      related_resource_id: eventId,
      title: `Event not approved: ${event.title}`,
      description: `Your calendar event was declined. Reason: ${rejectionNote}`,
    }).catch(() => {})
  }

  return event
}

export async function getPendingApprovals() {
  const { data, error } = await supabase.rpc('list_pending_approvals')

  if (error) throw error
  return data ?? []
}

// ---- iCal subscriptions ----

export async function getOrCreateSubscription(userId, scope = 'all', departmentId = null) {
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .upsert(
      { user_id: userId, scope, dept_id: departmentId },
      { onConflict: 'user_id,scope,dept_id' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getSubscriptions(userId) {
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .select('id, token, scope, dept_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function deleteSubscription(subscriptionId) {
  const { error } = await supabase
    .from('calendar_subscriptions')
    .delete()
    .eq('id', subscriptionId)

  if (error) throw error
}

export async function getEventsBySubscriptionToken(token) {
  const { data: subscription, error: subError } = await supabase
    .from('calendar_subscriptions')
    .select('user_id, scope, dept_id')
    .eq('token', token)
    .single()

  if (subError) throw new Error('Invalid subscription token')

  let query = supabase
    .from('calendar_events')
    .select('id, title, description, start_date, end_date, all_day, location, status')
    .eq('status', 'approved')
    .gte('start_date', new Date().toISOString())

  if (subscription.scope === 'department' && subscription.dept_id) {
    query = query.or(`department_id.eq.${subscription.dept_id},department_id.is.null`)
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

// ---- Permissions Management ----

export async function grantCalendarPermission(userId) {
  const { error } = await supabase
    .from('calendar_permissions')
    .upsert(
      { user_id: userId, can_manage: true, granted_by: (await supabase.auth.getUser()).data.user.id },
      { onConflict: 'user_id' }
    )

  if (error) throw error
}

export async function revokeCalendarPermission(userId) {
  const { error } = await supabase
    .from('calendar_permissions')
    .upsert(
      { user_id: userId, can_manage: false },
      { onConflict: 'user_id' }
    )

  if (error) throw error
}

export async function getCalendarPermissions() {
  const { data, error } = await supabase
    .from('calendar_permissions')
    .select('id, user_id, can_manage, granted_at, users!calendar_permissions_user_id_fkey(id, name, email)')
    .order('granted_at', { ascending: false })

  if (error) throw error
  return data ?? []
}
