import { supabase } from '../../../lib/supabase'
import { hasPermission } from '../../../lib/permissions'
import { createNotification } from '../../notifications/lib/notifications'

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
    .is('deleted_at', null)
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
    .eq('status', 'approved')
    .is('deleted_at', null)
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
    .update({ deleted_at: new Date().toISOString(), synced_to_google: false })
    .eq('id', eventId)

  if (error) throw error
}

// ---- Approval workflow ----

// Returns 'approved' for users who bypass the approval queue per the architecture:
// super_admin, regional_secretary, Programs dept_lead, any Programs space member.
async function getAutoApproveStatus(userId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('role, department_id')
    .eq('id', userId)
    .single()

  if (error || !user) return 'pending'

  if (['super_admin', 'regional_secretary'].includes(user.role)) return 'approved'

  // Programs auto-approval is keyed off a durable department flag, not the display name.
  const { data: programsDept } = await supabase
    .from('departments')
    .select('id')
    .eq('is_programs', true)
    .maybeSingle()

  if (!programsDept) return 'pending'
  if (programsDept && user.department_id === programsDept.id) return 'approved'

  return 'pending'
}

export async function submitEvent(eventData, userId) {
  const status = await getAutoApproveStatus(userId)

  const eventToInsert = {
    ...eventData,
    status,
    created_by: userId,
    ...(status === 'approved'
      ? { approved_by: userId, approved_at: new Date().toISOString(), is_admin_created: true }
      : {}),
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
  // Deliberately avoid .upsert(onConflict:...) here: calendar_subscriptions only has
  // partial unique indexes (see 20261202000000_dedupe_and_index_subscriptions.sql),
  // which Postgres can't match against a plain ON CONFLICT (col list) target — that
  // upsert always fails with "no unique or exclusion constraint matching" (42P10).
  let existingQuery = supabase
    .from('calendar_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('scope', scope)

  existingQuery = departmentId ? existingQuery.eq('department_id', departmentId) : existingQuery.is('department_id', null)

  const { data: existing, error: selectError } = await existingQuery.maybeSingle()
  if (selectError) throw selectError
  if (existing) return existing

  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .insert({ user_id: userId, scope, department_id: departmentId })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getSubscriptions(userId) {
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .select('id, token, scope, department_id, created_at')
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
    .select('user_id, scope, department_id')
    .eq('token', token)
    .single()

  if (subError) throw new Error('Invalid subscription token')

  let query = supabase
    .from('calendar_events')
    .select('id, title, description, start_date, end_date, all_day, location, status')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .gte('start_date', new Date().toISOString())

  if (subscription.scope === 'department' && subscription.department_id) {
    query = query.or(`department_id.eq.${subscription.department_id},department_id.is.null`)
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

// ---- Space Task Feed Subscriptions ----

// Returns the iCal token for a user's task feed in a space (creates one if missing).
// feed_type: 'my_tasks' | 'followed_tasks'
export async function getOrCreateTaskFeedToken(userId, spaceId, feedType) {
  const { data, error } = await supabase.rpc('get_or_create_task_feed_token', {
    p_user_id: userId,
    p_space_id: spaceId,
    p_feed_type: feedType,
  })
  if (error) throw error
  return data // token string
}

export function getTaskFeedUrl(token) {
  const base = import.meta.env.VITE_SUPABASE_URL
  return `${base}/functions/v1/calendar-task-feed/${token}`
}

// ---- Event Types ----

export async function getEventTypes() {
  const { data, error } = await supabase
    .from('calendar_event_types')
    .select('id, name, color')
    .eq('active', true)
    .order('sort_order')

  if (error) {
    console.error('Failed to fetch event types:', error)
    return []
  }

  return data ?? []
}

export async function createEventType(eventType) {
  const { data, error } = await supabase
    .from('calendar_event_types')
    .insert({
      name: eventType.name,
      color: eventType.color,
      active: true,
      sort_order: 0,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateEventType(id, updates) {
  const { data, error } = await supabase
    .from('calendar_event_types')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteEventType(id) {
  const { error } = await supabase
    .from('calendar_event_types')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ---- Admin/Programs Direct Creation (Bypass Approval) ----

// Uses the same auto-approve logic as submitEvent — the userRole param is kept
// for backwards compatibility but the real check is server-side via getAutoApproveStatus.
export async function createEventDirectly(eventData, createdBy) {
  const status = await getAutoApproveStatus(createdBy)

  const payload = {
    ...eventData,
    created_by: createdBy,
    status,
    ...(status === 'approved'
      ? { approved_by: createdBy, approved_at: new Date().toISOString(), is_admin_created: true }
      : {}),
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}

// ---- Ministry Calendar Sources (multi-source Google sync) ----
// One shared OAuth connection covers all sources (Birthdays/Holidays/main
// org calendar/etc are all visible via that account's calendarList).

export function getMinistryCalendarConnectOAuthUrl() {
  const redirectUri = `${window.location.origin}/auth/ministry-calendar-callback`
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    state: 'ministry_calendar_connection',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeMinistryCalendarConnectionCode({ code, userId }) {
  const redirectUri = `${window.location.origin}/auth/ministry-calendar-callback`
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: {
      action: 'exchange_code_connection',
      payload: { code, redirect_uri: redirectUri, user_id: userId },
    },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

export async function getMinistryCalendarConnectionStatus() {
  const { data, error } = await supabase
    .from('ministry_calendar_connection')
    .select('id, connected_at, updated_at, needs_reauth')
    .maybeSingle()

  if (error) throw error
  return data
}

export async function listAvailableCalendarSources() {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'list_available_calendars', payload: {} },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data.calendars ?? []
}

export async function getMinistryCalendarSources() {
  const { data, error } = await supabase
    .from('ministry_calendar_sources')
    .select('*')
    .order('display_name')

  if (error) throw error
  return data ?? []
}

export async function addCalendarSource({ googleCalendarId, displayName, color, pushEnabled, createdBy }) {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: {
      action: 'add_source',
      payload: {
        google_calendar_id: googleCalendarId,
        display_name: displayName,
        color: color ?? null,
        push_enabled: pushEnabled ?? false,
        created_by: createdBy ?? null,
      },
    },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data.source
}

export async function updateCalendarSource(sourceId, updates) {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'update_source', payload: { source_id: sourceId, ...updates } },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data.source
}

export async function removeCalendarSource(sourceId) {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'remove_source', payload: { source_id: sourceId } },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

export async function syncCalendarSource(sourceId) {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'sync_one_source', payload: { source_id: sourceId } },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}
