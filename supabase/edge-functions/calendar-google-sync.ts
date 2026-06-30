// Google Calendar Sync Scheduler
// Bidirectional sync between Nexus and Google Calendar
// Runs every 15 minutes via Supabase cron

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  all_day: boolean;
  location?: string;
  event_type?: string;
  priority?: string;
  recurrence_rule?: string;
  google_event_id?: string;
  last_sync_at?: string;
  created_at?: string;
}

interface GoogleEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  colorId?: string;
  updated: string;
  recurrence?: string[];
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
}

interface SyncResult {
  synced_events: number;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

// Maps Nexus event_type → Google Calendar colorId (1–11)
const EVENT_TYPE_TO_COLOR_ID: Record<string, string> = {
  conference: '11', // tomato
  program:    '9',  // blueberry
  training:   '5',  // banana
  prayer:     '3',  // sage
  graduation: '1',  // lavender
  deadline:   '6',  // tangerine
  event:      '7',  // peacock
};

// Reverse map for inbound sync (colorId → event_type)
const COLOR_ID_TO_EVENT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_TYPE_TO_COLOR_ID).map(([type, colorId]) => [colorId, type])
);

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: syncs, error: syncError } = await supabase
      .from('google_calendar_sync')
      .select('*')
      .eq('sync_enabled', true);

    if (syncError) {
      throw new Error(`Failed to fetch sync configs: ${syncError.message}`);
    }

    const results: Record<string, SyncResult> = {};

    for (const sync of syncs || []) {
      const syncKey = `${sync.org_id}-${sync.space_id}`;
      const result: SyncResult = { synced_events: 0, created: 0, updated: 0, deleted: 0, errors: [] };

      try {
        console.log(`Starting sync for ${syncKey}`);

        if (sync.sync_direction === 'to_google' || sync.sync_direction === 'both') {
          await syncToGoogle(supabase, sync, result);
        }

        if (sync.sync_direction === 'from_google' || sync.sync_direction === 'both') {
          await syncFromGoogle(supabase, sync, result);
        }

        await supabase
          .from('google_calendar_sync')
          .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', sync.id);

        results[syncKey] = result;
        console.log(`Sync completed for ${syncKey}:`, result);
      } catch (error) {
        console.error(`Error syncing ${sync.id}:`, error);

        // Notify calendar managers of the failure
        await supabase.rpc('notify_sync_failure', {
          p_space_id: sync.space_id,
          p_error_message: error.message,
        }).catch(() => {});

        results[syncKey] = { synced_events: 0, created: 0, updated: 0, deleted: 0, errors: [error.message] };
      }
    }

    return new Response(
      JSON.stringify({ success: true, timestamp: new Date().toISOString(), syncs_processed: Object.keys(results).length, results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: 'Sync failed', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function syncToGoogle(supabase: any, sync: any, result: SyncResult): Promise<void> {
  const { data: events, error: eventError } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('space_id', sync.space_id)
    .eq('status', 'approved')
    .or(`synced_to_google.eq.false,last_sync_at.lt.${sync.last_sync_at || new Date(0).toISOString()}`);

  if (eventError) {
    result.errors.push(`Failed to fetch events: ${eventError.message}`);
    return;
  }

  for (const event of events || []) {
    try {
      const googleEvent = formatEventForGoogle(event);
      let response;

      if (event.google_event_id) {
        response = await updateGoogleEvent(sync.google_access_token, sync.google_calendar_id, event.google_event_id, googleEvent);
        result.updated++;
      } else {
        response = await createGoogleEvent(sync.google_access_token, sync.google_calendar_id, googleEvent);
        result.created++;
      }

      // Always stamp the Nexus record after a successful push
      if (response?.id || event.google_event_id) {
        await supabase
          .from('calendar_events')
          .update({
            google_event_id: response?.id ?? event.google_event_id,
            synced_to_google: true,
            last_sync_at: new Date().toISOString(),
          })
          .eq('id', event.id);
      }

      result.synced_events++;
    } catch (error) {
      result.errors.push(`Failed to sync event ${event.id}: ${error.message}`);
    }
  }
}

async function syncFromGoogle(supabase: any, sync: any, result: SyncResult): Promise<void> {
  try {
    const googleEvents = await fetchGoogleCalendarEvents(sync.google_access_token, sync.google_calendar_id, sync.last_sync_at);

    for (const googleEvent of googleEvents) {
      try {
        const { data: existingEvent } = await supabase
          .from('calendar_events')
          .select('*')
          .eq('google_event_id', googleEvent.id)
          .maybeSingle();

        const nexusEvent = formatEventFromGoogle(googleEvent);

        if (existingEvent) {
          // Last-write-wins: only overwrite if Google's updated timestamp is newer
          if (new Date(googleEvent.updated) > new Date(existingEvent.last_sync_at || existingEvent.created_at)) {
            await supabase
              .from('calendar_events')
              .update({ ...nexusEvent, synced_from_google: true, last_sync_at: new Date().toISOString() })
              .eq('id', existingEvent.id);
            result.updated++;
          }
        } else {
          await supabase
            .from('calendar_events')
            .insert({
              ...nexusEvent,
              google_event_id: googleEvent.id,
              synced_from_google: true,
              last_sync_at: new Date().toISOString(),
              status: 'approved',
              space_id: sync.space_id,
            });
          result.created++;
        }

        result.synced_events++;
      } catch (error) {
        result.errors.push(`Failed to sync Google event ${googleEvent.id}: ${error.message}`);
      }
    }
  } catch (error) {
    result.errors.push(`Failed to fetch Google events: ${error.message}`);
  }
}

async function fetchGoogleCalendarEvents(accessToken: string, calendarId: string, syncToken?: string): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({ maxResults: '250', showDeleted: 'false' });

  if (syncToken) {
    params.append('syncToken', syncToken);
  } else {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    params.append('timeMin', thirtyDaysAgo.toISOString());
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) throw new Error(`Google API error: ${response.statusText}`);

  const data = await response.json();
  return data.items || [];
}

async function createGoogleEvent(accessToken: string, calendarId: string, event: any): Promise<{ id: string }> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }
  );
  if (!response.ok) throw new Error(`Google API error: ${response.statusText}`);
  return response.json();
}

async function updateGoogleEvent(accessToken: string, calendarId: string, eventId: string, event: any): Promise<{ id: string }> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }
  );
  if (!response.ok) throw new Error(`Google API error: ${response.statusText}`);
  return response.json();
}

/**
 * Format a Nexus event for the Google Calendar API.
 * Syncs ALL fields: title, description, location, dates, event_type (as colorId),
 * priority, recurrence_rule (as RRULE), and Nexus metadata via extendedProperties.
 */
function formatEventForGoogle(event: CalendarEvent): any {
  const startDateTime = new Date(event.start_date).toISOString();
  const endDateTime = event.end_date
    ? new Date(event.end_date).toISOString()
    : new Date(new Date(event.start_date).getTime() + 3600000).toISOString();

  const googleEvent: any = {
    summary: event.title,
    description: event.description ?? null,
    location: event.location ?? null,
    colorId: EVENT_TYPE_TO_COLOR_ID[event.event_type ?? ''] ?? '7',
    start: event.all_day
      ? { date: event.start_date.split('T')[0] }
      : { dateTime: startDateTime },
    end: event.all_day
      ? { date: new Date(new Date(event.start_date).getTime() + 86400000).toISOString().split('T')[0] }
      : { dateTime: endDateTime },
    extendedProperties: {
      private: {
        nexus_event_type: event.event_type ?? 'event',
        nexus_priority: event.priority ?? 'medium',
      },
    },
  };

  // RFC 5545 RRULE — Google expects it as "RRULE:<value>" inside a recurrence array
  if (event.recurrence_rule) {
    googleEvent.recurrence = [`RRULE:${event.recurrence_rule}`];
  }

  return googleEvent;
}

/**
 * Parse a Google Calendar event back into Nexus fields.
 * Prefers extendedProperties for Nexus-specific metadata; falls back to colorId mapping.
 */
function formatEventFromGoogle(googleEvent: GoogleEvent): Partial<CalendarEvent> {
  const start = googleEvent.start.dateTime ?? googleEvent.start.date ?? '';
  const end = googleEvent.end?.dateTime ?? googleEvent.end?.date ?? start;
  const allDay = !googleEvent.start.dateTime;

  const privateProps = googleEvent.extendedProperties?.private ?? {};

  const eventType =
    privateProps.nexus_event_type ??
    (googleEvent.colorId ? COLOR_ID_TO_EVENT_TYPE[googleEvent.colorId] : undefined) ??
    'event';

  const priority = privateProps.nexus_priority ?? 'medium';

  // Strip "RRULE:" prefix from the Google recurrence array entry
  let recurrenceRule: string | undefined;
  if (googleEvent.recurrence?.length) {
    const rruleLine = googleEvent.recurrence.find((r) => r.startsWith('RRULE:'));
    if (rruleLine) recurrenceRule = rruleLine.replace('RRULE:', '');
  }

  return {
    title: googleEvent.summary,
    description: googleEvent.description,
    location: googleEvent.location,
    start_date: start,
    end_date: end,
    all_day: allDay,
    event_type: eventType,
    priority,
    ...(recurrenceRule ? { recurrence_rule: recurrenceRule } : {}),
  };
}
