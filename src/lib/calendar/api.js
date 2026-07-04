// Calendar API Integration
// Handles all calendar event CRUD operations, Google sync, and subscriptions

import { supabase } from '../supabase.js';

// ─── Calendar Events CRUD ────────────────────────────────────────

/**
 * Fetch calendar events with filters
 */
export async function fetchCalendarEvents(filters = {}) {
  let query = supabase
    .from('calendar_events')
    .select('*')
    .is('deleted_at', null);

  if (filters.space_id) {
    query = query.eq('space_id', filters.space_id);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }
  if (filters.start_date) {
    query = query.gte('start_date', filters.start_date);
  }
  if (filters.end_date) {
    query = query.lte('start_date', filters.end_date);
  }
  if (filters.created_by) {
    query = query.eq('created_by', filters.created_by);
  }

  query = query.order('start_date', { ascending: false });

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Fetch a single calendar event
 */
export async function fetchCalendarEvent(id) {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(event) {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert([{
      ...event,
      created_by: (await supabase.auth.getUser()).data.user.id,
      status: 'pending', // Default to pending for approval workflow
      created_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(id, updates) {
  const { data, error } = await supabase
    .from('calendar_events')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Soft-delete a calendar event.
 * Sets deleted_at so the sync engine can propagate the deletion to Google
 * on the next cron run before the row is eventually purged.
 */
export async function deleteCalendarEvent(id) {
  const { error } = await supabase
    .from('calendar_events')
    .update({ deleted_at: new Date().toISOString(), synced_to_google: false })
    .eq('id', id);

  if (error) throw error;
}

// ─── Approval Workflow ───────────────────────────────────────────

/**
 * Get pending calendar events for approval
 */
export async function getPendingCalendarEvents() {
  const { data, error } = await supabase
    .rpc('get_pending_calendar_events');

  if (error) throw error;
  return data;
}

/**
 * Approve a calendar event
 */
export async function approveCalendarEvent(eventId) {
  const { error } = await supabase
    .rpc('approve_calendar_event', { event_id: eventId });

  if (error) throw error;
}

/**
 * Reject a calendar event
 */
export async function rejectCalendarEvent(eventId, note) {
  const { error } = await supabase
    .rpc('reject_calendar_event', {
      event_id: eventId,
      note: note,
    });

  if (error) throw error;
}

// ─── Google Calendar Integration ────────────────────────────────

/**
 * Get Google Calendar OAuth URL for Ministry Calendar (space-scoped)
 */
export async function getGoogleOAuthUrl(spaceId, orgId) {
  const redirectUri = `${window.location.origin}/auth/ministry-calendar-callback`;
  const state = btoa(JSON.stringify({ spaceId, orgId }));
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange OAuth code for space-scoped Ministry Calendar tokens
 */
export async function exchangeGoogleCodeForSpace({ code, orgId, spaceId, userId }) {
  const redirectUri = `${window.location.origin}/auth/ministry-calendar-callback`;
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: {
      action: 'exchange_code_space',
      payload: { code, redirect_uri: redirectUri, org_id: orgId, space_id: spaceId, user_id: userId },
    },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Get Google Calendar sync status for a space
 */
export async function getGoogleSyncStatus(orgId, spaceId) {
  if (!spaceId) return null;
  const { data, error } = await supabase
    .from('google_calendar_sync')
    .select('*')
    .eq('org_id', orgId)
    .eq('space_id', spaceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Trigger bidirectional sync with Google Calendar
 */
export async function triggerGoogleSync(orgId, spaceId) {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: { action: 'sync_space_calendar', payload: { org_id: orgId, space_id: spaceId } },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Disconnect Google Calendar
 */
export async function disconnectGoogleCalendar(orgId, spaceId) {
  const { error } = await supabase
    .from('google_calendar_sync')
    .delete()
    .eq('org_id', orgId)
    .eq('space_id', spaceId);

  if (error) throw error;
}

// ─── Calendar Subscriptions (iCal) ───────────────────────────────

/**
 * Create a calendar subscription (iCal feed)
 */
export async function createCalendarSubscription(subscription) {
  const user = (await supabase.auth.getUser()).data.user;

  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .insert([{
      ...subscription,
      user_id: user.id,
      created_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch user's calendar subscriptions
 */
export async function fetchCalendarSubscriptions() {
  const user = (await supabase.auth.getUser()).data.user;

  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Fetch a single subscription
 */
export async function fetchCalendarSubscription(id) {
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a calendar subscription
 */
export async function updateCalendarSubscription(id, updates) {
  const { data, error } = await supabase
    .from('calendar_subscriptions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a calendar subscription
 */
export async function deleteCalendarSubscription(id) {
  const { error } = await supabase
    .from('calendar_subscriptions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Get iCal feed URL for a subscription
 */
export function getICalFeedUrl(token) {
  return `${window.location.origin}/api/calendar/subscribe/${token}`;
}

// ─── Calendar Permissions ────────────────────────────────────────

/**
 * Get calendar permissions for user
 */
export async function getCalendarPermissions(userId) {
  const { data, error } = await supabase
    .from('calendar_permissions')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return data;
}

/**
 * Grant calendar permission to user
 */
export async function grantCalendarPermission(userId, spaceId, canManage) {
  const { error } = await supabase
    .rpc('grant_calendar_permission', {
      p_user_id: userId,
      p_space_id: spaceId,
      p_can_manage: canManage,
    });

  if (error) throw error;
}

/**
 * Revoke calendar permission from user
 */
export async function revokeCalendarPermission(userId, spaceId) {
  const { error } = await supabase
    .rpc('revoke_calendar_permission', {
      p_user_id: userId,
      p_space_id: spaceId,
    });

  if (error) throw error;
}

/**
 * Get user's calendar role for a space
 */
export async function getUserCalendarRole(userId, spaceId) {
  const { data, error } = await supabase
    .rpc('get_user_calendar_role', {
      p_user_id: userId,
      p_space_id: spaceId,
    });

  if (error) throw error;
  return data;
}

// ─── Calendar Views & Analytics ─────────────────────────────────

/**
 * Get permissions summary view
 */
export async function getPermissionsSummary() {
  const { data, error } = await supabase
    .from('calendar_permissions_summary')
    .select('*')
    .order('granted_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get active Google syncs
 */
export async function getActiveSyncs() {
  const { data, error } = await supabase
    .from('active_google_syncs')
    .select('*');

  if (error) throw error;
  return data;
}

/**
 * Get subscription analytics
 */
export async function getSubscriptionAnalytics() {
  const { data, error } = await supabase
    .from('subscription_analytics')
    .select('*')
    .order('access_count', { ascending: false });

  if (error) throw error;
  return data;
}

// ─── Calendar RSVPs ─────────────────────────────────────────────

/**
 * Create or update RSVP
 */
export async function submitRSVP(eventId, response) {
  const user = (await supabase.auth.getUser()).data.user;

  const { data, error } = await supabase
    .from('calendar_rsvps')
    .upsert([{
      event_id: eventId,
      user_id: user.id,
      response: response,
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get RSVPs for an event
 */
export async function getEventRSVPs(eventId) {
  const { data, error } = await supabase
    .from('calendar_rsvps')
    .select('*')
    .eq('event_id', eventId);

  if (error) throw error;
  return data;
}

/**
 * Get user's RSVP for an event
 */
export async function getUserEventRSVP(eventId) {
  const user = (await supabase.auth.getUser()).data.user;

  const { data, error } = await supabase
    .from('calendar_rsvps')
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

// ─── Utility Functions ───────────────────────────────────────────

/**
 * Convert event to iCal format
 */
export function formatEventAsICal(event) {
  const uid = `${event.id}@blwcanada.org`;
  const dtstart = event.start_date.replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dtend = event.end_date
    ? event.end_date.replace(/[-:]/g, '').split('.')[0] + 'Z'
    : dtstart;

  return `BEGIN:VEVENT
UID:${uid}
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:${event.title}
DESCRIPTION:${event.description || ''}
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
STATUS:${event.status === 'approved' ? 'CONFIRMED' : 'TENTATIVE'}
PRIORITY:${event.priority === 'high' ? 1 : event.priority === 'low' ? 9 : 5}
END:VEVENT`;
}

/**
 * Format event date range
 */
export function formatEventDateRange(event) {
  const start = new Date(event.start_date).toLocaleDateString();
  if (!event.end_date || event.end_date === event.start_date) {
    return start;
  }
  const end = new Date(event.end_date).toLocaleDateString();
  return `${start} - ${end}`;
}

/**
 * Get event status badge color
 */
export function getStatusColor(status) {
  const colors = {
    pending: 'yellow',
    approved: 'green',
    rejected: 'red',
    confirmed: 'green',
    cancelled: 'gray',
    draft: 'blue',
  };
  return colors[status] || 'gray';
}

/**
 * Get priority badge color
 */
export function getPriorityColor(priority) {
  const colors = {
    high: 'red',
    medium: 'yellow',
    low: 'blue',
  };
  return colors[priority] || 'gray';
}
