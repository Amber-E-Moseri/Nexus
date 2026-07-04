import ICAL from 'ical.js'
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
    .is('deleted_at', null)
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

  if (status === 'approved' && eventData.space_id) {
    try {
      await triggerSpaceSync(eventData.space_id)
    } catch (e) {
      console.warn('Could not trigger sync:', e)
    }
  }

  return data
}

// ---- Regional Ministry Calendar Integration ----

export async function createRegionalCalendarSync(payload) {
  const {
    org_id,
    regional_calendar_name,
    regional_calendar_url,
    sync_direction = 'from_google', // Regional → BLW (read-only by default)
    color = '#FF6B6B',
    description = '',
  } = payload

  const { data, error } = await supabase
    .from('regional_calendar_syncs')
    .insert({
      org_id,
      regional_calendar_name,
      regional_calendar_url,
      sync_direction,
      color,
      description,
      is_active: true,
      connected_by: (await supabase.auth.getUser()).data.user.id,
      connected_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getRegionalCalendarSyncs(orgId) {
  const { data, error } = await supabase
    .from('regional_calendar_syncs')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('connected_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function syncRegionalCalendar(syncId) {
  // Fetch events from regional calendar URL (iCal format)
  // Parse and import into local calendar with regional tag
  const { data: sync, error: fetchError } = await supabase
    .from('regional_calendar_syncs')
    .select('*')
    .eq('id', syncId)
    .single()

  if (fetchError) throw fetchError

  try {
    // Fetch regional calendar (iCal format)
    const response = await fetch(sync.regional_calendar_url)
    const icalText = await response.text()

    // Parse iCal and create events (simplified - full parser would be more complex)
    const events = parseICalEvents(icalText)

    // Bulk insert with regional tag
    const { error: insertError } = await supabase
      .from('calendar_events')
      .insert(
        events.map((e) => ({
          ...e,
          status: 'approved', // Regional events auto-approved
          is_regional: true,
          regional_sync_id: syncId,
          color: sync.color,
        }))
      )

    if (insertError) throw insertError

    // Update last sync timestamp
    await supabase
      .from('regional_calendar_syncs')
      .update({ last_synced_at: new Date().toISOString(), synced_count: events.length })
      .eq('id', syncId)

    return { synced: events.length, events }
  } catch (err) {
    throw new Error(`Failed to sync regional calendar: ${err.message}`)
  }
}

export async function disconnectRegionalCalendar(syncId) {
  // Soft delete + remove associated events
  const { data: sync } = await supabase
    .from('regional_calendar_syncs')
    .select('id')
    .eq('id', syncId)
    .single()

  if (!sync) throw new Error('Sync not found')

  // Remove regional events from this sync
  await supabase
    .from('calendar_events')
    .delete()
    .eq('regional_sync_id', syncId)
    .eq('is_regional', true)

  // Deactivate sync
  const { error } = await supabase
    .from('regional_calendar_syncs')
    .update({ is_active: false, disconnected_at: new Date().toISOString() })
    .eq('id', syncId)

  if (error) throw error
}

// Parse iCal text using ical.js — handles line folding, VTIMEZONE, VALARM,
// recurring events, all-day events, and multi-line values correctly.
function parseICalEvents(icalText) {
  const events = []

  let jcal
  try {
    jcal = ICAL.parse(icalText)
  } catch (err) {
    console.error('Failed to parse iCal data:', err)
    return events
  }

  const comp = new ICAL.Component(jcal)
  const vevents = comp.getAllSubcomponents('vevent')

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent)

      const dtstart = event.startDate
      const dtend = event.endDate

      // ical.js represents all-day dates as ICAL.Time with isDate=true
      const allDay = dtstart?.isDate ?? false

      const startIso = allDay
        ? dtstart.toString() // e.g. "2026-07-15"
        : dtstart?.toJSDate()?.toISOString() ?? null

      const endIso = allDay
        ? dtend?.toString() ?? startIso
        : dtend?.toJSDate()?.toISOString() ?? startIso

      if (!event.summary || !startIso) continue

      events.push({
        title: event.summary,
        description: event.description || '',
        start_date: startIso,
        end_date: endIso,
        location: event.location || '',
        all_day: allDay,
        department_id: null,
        is_org_wide: true,
        created_at: new Date().toISOString(),
      })
    } catch (err) {
      console.warn('Skipped malformed VEVENT:', err)
    }
  }

  return events
}

async function triggerSpaceSync(spaceId) {
  try {
    await supabase.functions.invoke('calendar-google-sync', {
      body: { space_id: spaceId },
    })
  } catch (e) {
    console.warn('Sync trigger failed:', e)
  }
}
