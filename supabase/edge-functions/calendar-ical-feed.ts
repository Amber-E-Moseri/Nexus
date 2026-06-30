// Calendar iCal Feed Generator
// Generates RFC 5545 format iCal feeds for public subscriptions.
// Filters events per the subscriber's role using calendar_category_visibility rules.

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
  event_type?: string;
  status: string;
  sprint_id?: string;
}

interface Sprint {
  id: string;
  name: string;
}

serve(async (req: Request) => {
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

    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase environment variables');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve subscription
    const { data: subscription, error: subError } = await supabase
      .from('calendar_subscriptions')
      .select('*')
      .eq('token', token)
      .eq('is_public', true)
      .single();

    if (subError || !subscription) {
      return new Response(
        JSON.stringify({ error: 'Subscription not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Increment access count (non-blocking)
    supabase.rpc('increment_subscription_access', { p_token: token })
      .catch((err: Error) => console.error('Failed to increment access count:', err));

    // Resolve subscriber's role for category visibility filtering
    const subscriberRole = await getSubscriberRole(supabase, subscription.user_id);
    const hiddenCategories = await getHiddenCategories(supabase, subscription.org_id, subscriberRole);

    // Build event query
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('space_id', subscription.space_id)
      .eq('status', 'approved')
      .gte('start_date', thirtyDaysAgo.toISOString());

    if (subscription.filter_priority) query = query.eq('priority', subscription.filter_priority);

    const { data: allEvents, error: eventError } = await query.order('start_date', { ascending: true });

    if (eventError) throw eventError;

    // Apply role-based category visibility (fail open: missing rule = visible)
    const events = (allEvents || []).filter(
      (e: CalendarEvent) => !hiddenCategories.has(e.event_type ?? '')
    );

    // Fetch sprints for context
    let sprintMap: Record<string, Sprint> = {};
    const sprintIds = [...new Set(events.filter((e: CalendarEvent) => e.sprint_id).map((e: CalendarEvent) => e.sprint_id))] as string[];
    if (sprintIds.length > 0) {
      const { data: sprints } = await supabase.from('sprints').select('id, name').in('id', sprintIds);
      (sprints || []).forEach((s: Sprint) => { sprintMap[s.id] = s; });
    }

    const ical = generateICalFeed(subscription, events, sprintMap);

    return new Response(ical, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${subscription.name || 'calendar'}.ics"`,
        'Cache-Control': 'max-age=900',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('iCal generation error:', error);
    return new Response(
      JSON.stringify({ error: 'Feed generation failed', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function getSubscriberRole(supabase: any, userId: string): Promise<string> {
  if (!userId) return 'member';
  const { data: user } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
  return user?.role ?? 'member';
}

// Returns the Set of event_type values hidden for this role in this org.
// Missing rule = visible (fail open).
async function getHiddenCategories(supabase: any, orgId: string, role: string): Promise<Set<string>> {
  if (!orgId) return new Set();
  const { data } = await supabase.rpc('get_hidden_categories', { p_org_id: orgId, p_role: role });
  return new Set((data || []).map((row: { category: string }) => row.category));
}

function generateICalFeed(subscription: any, events: CalendarEvent[], sprints: Record<string, Sprint>): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BLW Canada//Ministry Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalValue(subscription.name || 'Ministry Calendar')}`,
    'X-WR-TIMEZONE:America/Toronto',
    'X-WR-CALDESC:BLW Canada Ministry Events',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    `LAST-MODIFIED:${now}`,
  ];

  for (const event of events) {
    lines.push(generateICalEvent(event, sprints));
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function generateICalEvent(event: CalendarEvent, sprints: Record<string, Sprint>): string {
  const lines: string[] = [];
  const uid = `${event.id}@blwcanada.org`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let dtstart: string;
  let dtend: string;

  if (event.all_day) {
    const startDate = event.start_date.split('T')[0].replace(/-/g, '');
    const endDate = event.end_date
      ? event.end_date.split('T')[0].replace(/-/g, '')
      : new Date(new Date(event.start_date).getTime() + 86400000).toISOString().split('T')[0].replace(/-/g, '');
    dtstart = `DTSTART;VALUE=DATE:${startDate}`;
    dtend = `DTEND;VALUE=DATE:${endDate}`;
  } else {
    dtstart = `DTSTART:${event.start_date.replace(/[-:]/g, '').split('.')[0]}Z`;
    dtend = `DTEND:${(event.end_date || event.start_date).replace(/[-:]/g, '').split('.')[0]}Z`;
  }

  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${uid}`);
  lines.push(dtstart);
  lines.push(dtend);
  lines.push(`DTSTAMP:${dtstamp}`);
  lines.push(`SUMMARY:${escapeICalValue(event.title)}`);

  let description = event.description || '';
  if (event.sprint_id && sprints[event.sprint_id]) {
    description += (description ? '\n\n' : '') + `Sprint: ${sprints[event.sprint_id].name}`;
  }
  if (description) lines.push(`DESCRIPTION:${escapeICalValue(description)}`);
  if (event.location) lines.push(`LOCATION:${escapeICalValue(event.location)}`);

  const priorityMap: Record<string, string> = { high: '1', medium: '5', low: '9' };
  lines.push(`PRIORITY:${priorityMap[event.priority] || '5'}`);

  const statusMap: Record<string, string> = {
    approved: 'CONFIRMED', confirmed: 'CONFIRMED',
    pending: 'TENTATIVE',
    rejected: 'CANCELLED', cancelled: 'CANCELLED',
  };
  lines.push(`STATUS:${statusMap[event.status] || 'CONFIRMED'}`);

  // Categories: include both event_type and priority so external apps can filter
  const categories = [event.event_type, event.priority].filter(Boolean).join(',');
  if (categories) lines.push(`CATEGORIES:${categories}`);

  lines.push(`CREATED:${dtstamp}`);
  lines.push(`LAST-MODIFIED:${dtstamp}`);
  lines.push('TRANSP:OPAQUE');
  lines.push('END:VEVENT');

  return lines.join('\r\n');
}

function escapeICalValue(value: string): string {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}
