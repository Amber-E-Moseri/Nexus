import { supabase } from './supabase'
import { hasPermission } from './permissions'
import { createNotification } from './notifications'

export async function getCalendarEvents(startDate, endDate) {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(`
      id, title, description, event_type, start_date, end_date,
      all_day, location, zoom_join_url, space_id, sprint_id, created_by, created_at,
      status, department_id, approved_by, approved_at, rejection_note
    `)
    .gte('start_date', startDate.toISOString())
    .lte('start_date', endDate.toISOString())
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

export async function submitEvent(eventData, userId, userRole) {
  // Determine if user can auto-approve
  const canAutoApprove = userRole === 'super_admin' || await hasPermission(userId, 'calendar:write')

  const eventToInsert = {
    ...eventData,
    status: canAutoApprove ? 'approved' : 'pending',
    created_by: userId,
    submitted_by: userId
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(eventToInsert)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getPendingApprovals() {
  const { data, error } = await supabase
    .rpc('list_pending_approvals')

  if (error) throw error
  return data ?? []
}

export async function approveEvent(eventId, approverId) {
  const { data, error } = await supabase
    .rpc('approve_calendar_event', {
      p_event_id: eventId,
      p_approver_id: approverId
    })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  const event = data?.event
  if (event && event.created_by) {
    await createNotification({
      recipient_id: event.created_by,
      type: 'calendar_event_approved',
      related_resource_type: 'calendar_event',
      related_resource_id: eventId,
      title: `Event approved: ${event.title}`,
      description: `Your calendar event has been approved.`,
    }).catch(err => console.error('Failed to create approval notification:', err))
  }

  return event
}

export async function rejectEvent(eventId, approverId, rejectionNote) {
  const { data, error } = await supabase
    .rpc('reject_calendar_event', {
      p_event_id: eventId,
      p_approver_id: approverId,
      p_rejection_note: rejectionNote
    })

  if (error) throw error
  if (data?.error) throw new Error(data.error)

  const event = data?.event
  if (event && event.created_by) {
    await createNotification({
      recipient_id: event.created_by,
      type: 'calendar_event_rejected',
      related_resource_type: 'calendar_event',
      related_resource_id: eventId,
      title: `Event rejected: ${event.title}`,
      description: `Your calendar event was rejected. Reason: ${rejectionNote}`,
    }).catch(err => console.error('Failed to create rejection notification:', err))
  }

  return event
}

// ---- iCal subscriptions ----

export async function generateICalToken(userId, scope = 'all', departmentId = null) {
  const { data, error } = await supabase
    .rpc('generate_ical_token', {
      p_user_id: userId,
      p_scope: scope,
      p_department_id: departmentId
    })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function getICalSubscriptions(userId) {
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .select('id, token, scope, department_id, created_at, last_accessed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function deleteICalSubscription(subscriptionId) {
  const { error } = await supabase
    .from('calendar_subscriptions')
    .delete()
    .eq('id', subscriptionId)

  if (error) throw error
}

export async function getEventsBySubscriptionToken(token) {
  const { data: subscription, error: subError } = await supabase
    .from('calendar_subscriptions')
    .select('user_id, scope, department_id')
    .eq('token', token)
    .single()

  if (subError) throw new Error('Invalid token')

  // Update last_accessed_at
  await supabase
    .from('calendar_subscriptions')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('token', token)

  let query = supabase
    .from('calendar_events')
    .select('id, title, description, start_date, end_date, all_day, location, zoom_join_url, status, department_id')
    .eq('status', 'approved')

  if (subscription.scope === 'department' && subscription.department_id) {
    query = query.or(`department_id.eq.${subscription.department_id},and(department_id.is.null)`)
  }

  const { data, error } = await query.gte('start_date', new Date().toISOString())

  if (error) throw error
  return data ?? []
}
