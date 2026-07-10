import { supabase } from '../../../lib/supabase'
import { createNotification } from '../../notifications/lib/notifications'

export async function getCalendarEvents(startDate, endDate) {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(`
      id, title, description, event_type, start_date, end_date,
      all_day, location, zoom_join_url, space_id, sprint_id, created_by, created_at,
      status, department_id, approved_by, approved_at, rejection_note, is_org_wide,
      source_id
    `)
    .gte('start_date', startDate.toISOString())
    .lte('start_date', endDate.toISOString())
    .eq('status', 'approved')
    .is('deleted_at', null)
    .order('start_date', { ascending: true })

  if (error) throw error
  return data ?? []
}

// Returns a Set of source IDs hidden from the given department.
// Empty Set = no restrictions (all sources visible).
// Super admins should skip this call entirely (pass null departmentId).
export async function getHiddenSourceIdsForDept(departmentId) {
  if (!departmentId) return new Set()

  const { data } = await supabase
    .from('ministry_calendar_source_dept_visibility')
    .select('source_id, department_id')

  if (!data || data.length === 0) return new Set()

  // Build source → allowed dept set
  const sourceMap = {}
  for (const row of data) {
    if (!sourceMap[row.source_id]) sourceMap[row.source_id] = new Set()
    sourceMap[row.source_id].add(row.department_id)
  }

  // A source is hidden if it has restrictions and this dept isn't listed
  const hidden = new Set()
  for (const [sourceId, allowed] of Object.entries(sourceMap)) {
    if (!allowed.has(departmentId)) hidden.add(sourceId)
  }
  return hidden
}

export async function getUpcomingEvents(limit = 5) {
  const now = new Date()
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, title, event_type, start_date, end_date, all_day, location, zoom_join_url, sprint_id, space_id, status, department_id, source_id')
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
    await createNotification(event.created_by, 'event_approved', {
      event_id: eventId,
      event_title: event.title,
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
    await createNotification(event.created_by, 'event_rejected', {
      event_id: eventId,
      event_title: event.title,
      rejection_note: rejectionNote,
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

async function getOrgWideCalendarPermission(userId) {
  const { data, error } = await supabase
    .from('calendar_permissions')
    .select('id')
    .eq('user_id', userId)
    .is('space_id', null)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function grantCalendarPermission(userId) {
  const grantorId = (await supabase.auth.getUser()).data.user.id
  const existing = await getOrgWideCalendarPermission(userId)

  if (existing) {
    const { error } = await supabase
      .from('calendar_permissions')
      .update({ can_manage: true, granted_by: grantorId, granted_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('calendar_permissions')
    .insert({ user_id: userId, can_manage: true, granted_by: grantorId })

  if (error) throw error
}

export async function revokeCalendarPermission(userId) {
  const { data: targetUser, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (userError) throw userError
  if (targetUser?.role === 'super_admin') {
    throw new Error('Super admins have calendar manager access by role and cannot be revoked here.')
  }

  const existing = await getOrgWideCalendarPermission(userId)

  if (existing) {
    const { error } = await supabase
      .from('calendar_permissions')
      .update({ can_manage: false })
      .eq('id', existing.id)

    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('calendar_permissions')
    .insert({ user_id: userId, can_manage: false })

  if (error) throw error
}

export async function getCalendarPermissions() {
  const { data: permissionRows, error } = await supabase
    .from('calendar_permissions')
    .select('id, user_id, can_manage, granted_at, users!calendar_permissions_user_id_fkey(id, name, email)')
    .order('granted_at', { ascending: false })

  if (error) throw error

  const { data: superAdmins, error: adminError } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('role', 'super_admin')

  if (adminError) throw adminError

  const rows = permissionRows ?? []
  const explicitRowsByUser = new Map(rows.map((row) => [row.user_id, row]))
  const superAdminIds = new Set((superAdmins ?? []).map((user) => user.id))

  const inheritedRows = (superAdmins ?? []).map((user) => {
    const explicitRow = explicitRowsByUser.get(user.id)

    return {
      ...(explicitRow ?? {}),
      id: explicitRow?.id ?? `super-admin:${user.id}`,
      user_id: user.id,
      can_manage: true,
      granted_at: explicitRow?.granted_at ?? null,
      users: user,
      source: 'role',
      inherited: true,
    }
  })

  return [
    ...inheritedRows,
    ...rows.filter((row) => !superAdminIds.has(row.user_id)),
  ]
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
  if (error) {
    // Supabase wraps non-2xx responses in FunctionsHttpError with a generic message.
    // Try to read the actual JSON body from the response for a real error message.
    let message = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.error) message = body.error
    } catch { /* ignore — use generic message */ }
    throw new Error(message)
  }
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

export async function disconnectMinistryCalendar() {
  // Delete the connection record and all associated sources
  const { error: connErr } = await supabase
    .from('ministry_calendar_connection')
    .delete()
    .not('id', 'is', null)  // delete all rows for this org/user

  if (connErr) throw connErr
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

export async function getMyGoogleCalendarConnection(userId) {
  const { data, error } = await supabase
    .from('google_calendar_tokens')
    .select('user_id, sync_tasks_enabled, last_synced_at, tasks_synced, needs_reauth')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function setSyncTasksEnabled(userId, enabled) {
  const { error } = await supabase
    .from('google_calendar_tokens')
    .update({ sync_tasks_enabled: enabled })
    .eq('user_id', userId)

  if (error) throw error
}

export async function syncMyTasksToGoogleCalendar(userId) {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'sync_my_tasks', payload: { user_id: userId } },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}
