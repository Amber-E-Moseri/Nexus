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
  google_event_id?: string;
  last_sync_at?: string;
}

interface GoogleEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  updated: string;
}

interface SyncResult {
  synced_events: number;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

serve(async (req: Request) => {
  // Only allow POST requests
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

    // Get all active sync configurations
    const { data: syncs, error: syncError } = await supabase
      .from('google_calendar_sync')
      .select('*')
      .eq('sync_enabled', true);

    if (syncError) {
      throw new Error(`Failed to fetch sync configs: ${syncError.message}`);
    }

    const results: Record<string, SyncResult> = {};

    // Process each sync configuration
    for (const sync of syncs || []) {
      try {
        const syncKey = `${sync.org_id}-${sync.space_id}`;
        console.log(`Starting sync for ${syncKey}`);

        const result: SyncResult = {
          synced_events: 0,
          created: 0,
          updated: 0,
          deleted: 0,
          errors: [],
        };

        // Sync TO Google (Nexus → Google)
        if (sync.sync_direction === 'to_google' || sync.sync_direction === 'both') {
          await syncToGoogle(
            supabase,
            sync,
            result
          );
        }

        // Sync FROM Google (Google → Nexus)
        if (sync.sync_direction === 'from_google' || sync.sync_direction === 'both') {
          await syncFromGoogle(
            supabase,
            sync,
            result
          );
        }

        // Update last_sync_at timestamp
        await supabase
          .from('google_calendar_sync')
          .update({
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', sync.id);

        results[syncKey] = result;
        console.log(`Sync completed for ${syncKey}:`, result);
      } catch (error) {
        console.error(`Error syncing ${sync.id}:`, error);
        results[`${sync.org_id}-${sync.space_id}`] = {
          synced_events: 0,
          created: 0,
          updated: 0,
          deleted: 0,
          errors: [error.message],
        };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        syncs_processed: Object.keys(results).length,
        results,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({
        error: 'Sync failed',
        message: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Sync events from Nexus to Google Calendar
 */
async function syncToGoogle(
  supabase: any,
  sync: any,
  result: SyncResult
): Promise<void> {
  // Get unsync'd or recently updated events from Nexus
  const { data: events, error: eventError } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('space_id', sync.space_id)
    .eq('status', 'approved')
    .or(
      `synced_to_google.eq.false,last_sync_at.lt.${sync.last_sync_at || new Date(0).toISOString()}`
    );

  if (eventError) {
    result.errors.push(`Failed to fetch events: ${eventError.message}`);
    return;
  }

  for (const event of events || []) {
    try {
      const googleEvent = formatEventForGoogle(event);

      let response;
      if (event.google_event_id) {
        // Update existing Google event
        response = await updateGoogleEvent(
          sync.google_access_token,
          sync.google_calendar_id,
          event.google_event_id,
          googleEvent
        );
        result.updated++;
      } else {
        // Create new Google event
        response = await createGoogleEvent(
          sync.google_access_token,
          sync.google_calendar_id,
          googleEvent
        );

        // Update Nexus event with Google ID
        if (response.id) {
          await supabase
            .from('calendar_events')
            .update({
              google_event_id: response.id,
              synced_to_google: true,
              last_sync_at: new Date().toISOString(),
            })
            .eq('id', event.id);

          result.created++;
        }
      }

      result.synced_events++;
    } catch (error) {
      result.errors.push(`Failed to sync event ${event.id}: ${error.message}`);
    }
  }
}

/**
 * Sync events from Google Calendar to Nexus
 */
async function syncFromGoogle(
  supabase: any,
  sync: any,
  result: SyncResult
): Promise<void> {
  try {
    const googleEvents = await fetchGoogleCalendarEvents(
      sync.google_access_token,
      sync.google_calendar_id,
      sync.last_sync_at
    );

    for (const googleEvent of googleEvents) {
      try {
        const { data: existingEvent } = await supabase
          .from('calendar_events')
          .select('*')
          .eq('google_event_id', googleEvent.id)
          .single();

        const nexusEvent = formatEventFromGoogle(googleEvent);

        if (existingEvent) {
          // Update existing event if Google version is newer (last-write-wins)
          if (
            new Date(googleEvent.updated) >
            new Date(existingEvent.last_sync_at || existingEvent.created_at)
          ) {
            await supabase
              .from('calendar_events')
              .update({
                ...nexusEvent,
                last_sync_at: new Date().toISOString(),
              })
              .eq('id', existingEvent.id);

            result.updated++;
          }
        } else {
          // Create new event
          await supabase
            .from('calendar_events')
            .insert({
              ...nexusEvent,
              google_event_id: googleEvent.id,
              synced_from_google: true,
              last_sync_at: new Date().toISOString(),
              status: 'approved', // Events from Google are considered approved
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

/**
 * Fetch events from Google Calendar
 */
async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  syncToken?: string
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    maxResults: '250',
    showDeleted: 'false',
  });

  if (syncToken) {
    params.append('syncToken', syncToken);
  } else {
    // First sync: get events from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    params.append('timeMin', thirtyDaysAgo.toISOString());
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Google API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Create event in Google Calendar
 */
async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: any
): Promise<{ id: string }> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    throw new Error(`Google API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Update event in Google Calendar
 */
async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: any
): Promise<{ id: string }> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    throw new Error(`Google API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Format Nexus event for Google Calendar
 */
function formatEventForGoogle(event: CalendarEvent): any {
  const startDateTime = new Date(event.start_date).toISOString();
  const endDateTime = event.end_date
    ? new Date(event.end_date).toISOString()
    : new Date(new Date(event.start_date).getTime() + 3600000).toISOString();

  return {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: event.all_day
      ? { date: event.start_date.split('T')[0] }
      : { dateTime: startDateTime },
    end: event.all_day
      ? { date: new Date(new Date(event.start_date).getTime() + 86400000).toISOString().split('T')[0] }
      : { dateTime: endDateTime },
  };
}

/**
 * Format Google event for Nexus
 */
function formatEventFromGoogle(googleEvent: GoogleEvent): any {
  const start = googleEvent.start.dateTime || googleEvent.start.date;
  const end = googleEvent.end.dateTime || googleEvent.end.date;
  const allDay = !googleEvent.start.dateTime;

  return {
    title: googleEvent.summary,
    description: googleEvent.description,
    location: googleEvent.location,
    start_date: start,
    end_date: end,
    all_day: allDay,
    event_type: 'event',
    priority: 'medium',
  };
}
