// Calendar iCal Feed Generator
// Generates RFC 5545 format iCal feeds for public subscriptions

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
  priority: string;
  status: string;
  sprint_id?: string;
}

interface Sprint {
  id: string;
  name: string;
}

serve(async (req: Request) => {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = new URL(req.url);
    const token = url.pathname.split('/').pop();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing subscription token' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch subscription
    const { data: subscription, error: subError } = await supabase
      .from('calendar_subscriptions')
      .select('*')
      .eq('token', token)
      .eq('is_public', true)
      .single();

    if (subError || !subscription) {
      console.error('Subscription not found:', subError);
      return new Response(
        JSON.stringify({ error: 'Subscription not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Increment access count
    await supabase
      .rpc('increment_subscription_access', { p_token: token })
      .catch(err => console.error('Failed to increment access count:', err));

    // Build query for events
    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('space_id', subscription.space_id)
      .eq('status', 'approved');

    // Apply filters from subscription
    if (subscription.filter_priority) {
      query = query.eq('priority', subscription.filter_priority);
    }

    if (subscription.filter_status) {
      query = query.eq('status', subscription.filter_status);
    }

    // Only show future events (last 30 days to future)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    query = query.gte('start_date', thirtyDaysAgo.toISOString());

    const { data: events, error: eventError } = await query.order('start_date', {
      ascending: true,
    });

    if (eventError) {
      console.error('Failed to fetch events:', eventError);
      throw eventError;
    }

    // Fetch sprints for linking
    let sprintMap: Record<string, Sprint> = {};
    if (events && events.some(e => e.sprint_id)) {
      const sprintIds = [...new Set(events.filter(e => e.sprint_id).map(e => e.sprint_id))];
      const { data: sprints } = await supabase
        .from('sprints')
        .select('id, name')
        .in('id', sprintIds);

      if (sprints) {
        sprints.forEach(s => {
          sprintMap[s.id] = s;
        });
      }
    }

    // Generate iCal feed
    const ical = generateICalFeed(
      subscription,
      events || [],
      sprintMap
    );

    // Return iCal with correct headers
    return new Response(ical, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${subscription.name || 'calendar'}.ics"`,
        'Cache-Control': 'max-age=900', // 15 minutes
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('iCal generation error:', error);
    return new Response(
      JSON.stringify({
        error: 'Feed generation failed',
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
 * Generate RFC 5545 iCal feed
 */
function generateICalFeed(
  subscription: any,
  events: CalendarEvent[],
  sprints: Record<string, Sprint>
): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines: string[] = [];

  // iCal header
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//BLW Canada//Ministry Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeICalValue(subscription.name || 'Ministry Calendar')}`);
  lines.push('X-WR-TIMEZONE:America/Toronto');
  lines.push('X-WR-CALDESC:BLW Canada Ministry Events');
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT15M');
  lines.push(`LAST-MODIFIED:${now}`);

  // Events
  for (const event of events) {
    lines.push(generateICalEvent(event, sprints));
  }

  // iCal footer
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Generate single iCal event
 */
function generateICalEvent(event: CalendarEvent, sprints: Record<string, Sprint>): string {
  const lines: string[] = [];
  const uid = `${event.id}@blwcanada.org`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Parse dates
  let dtstart: string;
  let dtend: string;

  if (event.all_day) {
    // For all-day events, use date format (not datetime)
    const startDate = event.start_date.split('T')[0].replace(/-/g, '');
    const endDate = event.end_date
      ? event.end_date.split('T')[0].replace(/-/g, '')
      : new Date(new Date(event.start_date).getTime() + 86400000)
          .toISOString()
          .split('T')[0]
          .replace(/-/g, '');

    dtstart = `DTSTART;VALUE=DATE:${startDate}`;
    dtend = `DTEND;VALUE=DATE:${endDate}`;
  } else {
    // For timed events, use datetime format
    dtstart = `DTSTART:${event.start_date.replace(/[-:]/g, '').split('.')[0]}Z`;
    dtend = `DTEND:${(event.end_date || event.start_date)
      .replace(/[-:]/g, '')
      .split('.')[0]}Z`;
  }

  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${uid}`);
  lines.push(dtstart);
  lines.push(dtend);
  lines.push(`DTSTAMP:${dtstamp}`);
  lines.push(`SUMMARY:${escapeICalValue(event.title)}`);

  // Description with sprint info
  let description = event.description || '';
  if (event.sprint_id && sprints[event.sprint_id]) {
    if (description) {
      description += '\n\n';
    }
    description += `Sprint: ${sprints[event.sprint_id].name}`;
  }

  if (description) {
    lines.push(`DESCRIPTION:${escapeICalValue(description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICalValue(event.location)}`);
  }

  // Priority (iCal uses 0-9 scale)
  const priorityMap = {
    high: '1',
    medium: '5',
    low: '9',
  };
  lines.push(`PRIORITY:${priorityMap[event.priority] || '5'}`);

  // Status
  const statusMap = {
    approved: 'CONFIRMED',
    pending: 'TENTATIVE',
    rejected: 'CANCELLED',
    confirmed: 'CONFIRMED',
    cancelled: 'CANCELLED',
  };
  lines.push(`STATUS:${statusMap[event.status] || 'CONFIRMED'}`);

  // Categories
  if (event.priority) {
    lines.push(`CATEGORIES:${event.priority}`);
  }

  lines.push(`CREATED:${dtstamp}`);
  lines.push(`LAST-MODIFIED:${dtstamp}`);
  lines.push('TRANSP:OPAQUE');
  lines.push('END:VEVENT');

  return lines.join('\r\n');
}

/**
 * Escape special characters for iCal format
 */
function escapeICalValue(value: string): string {
  if (!value) return '';

  return value
    .replace(/\\/g, '\\\\') // Backslash
    .replace(/,/g, '\\,') // Comma
    .replace(/;/g, '\\;') // Semicolon
    .replace(/\n/g, '\\n') // Newline
    .replace(/\r/g, '\\r'); // Carriage return
}
