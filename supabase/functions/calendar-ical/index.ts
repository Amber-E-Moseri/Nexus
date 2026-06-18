import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.5"

serve(async (req) => {
  // Only allow GET requests
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 })
  }

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get("token")

    if (!token) {
      return new Response("Missing token", { status: 400 })
    }

    // Initialize Supabase client with service role (no auth needed for this endpoint)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseKey) {
      return new Response("Server configuration error", { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify token and get subscription details
    const { data: subscription, error: subError } = await supabase
      .from("calendar_subscriptions")
      .select("user_id, scope, department_id")
      .eq("token", token)
      .single()

    if (subError || !subscription) {
      return new Response("Invalid token", { status: 401 })
    }

    // Update last_accessed_at
    await supabase
      .from("calendar_subscriptions")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("token", token)

    // Fetch approved events
    let query = supabase
      .from("calendar_events")
      .select(
        "id, title, description, start_date, end_date, all_day, location, zoom_join_url, department_id"
      )
      .eq("status", "approved")

    // Filter based on scope
    if (subscription.scope === "department" && subscription.department_id) {
      // Get events for this department OR org-wide events (department_id IS NULL)
      query = supabase
        .from("calendar_events")
        .select(
          "id, title, description, start_date, end_date, all_day, location, zoom_join_url, department_id"
        )
        .eq("status", "approved")
        .or(`department_id.eq.${subscription.department_id},department_id.is.null`)
    }

    const { data: events, error: eventsError } = await query.gte(
      "start_date",
      new Date().toISOString()
    )

    if (eventsError) {
      return new Response("Failed to fetch events", { status: 500 })
    }

    // Generate iCalendar format
    const ical = generateICalendar(events || [], subscription.scope)

    return new Response(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=calendar.ics",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    })
  } catch (error) {
    console.error("Calendar iCal error:", error)
    return new Response("Internal server error", { status: 500 })
  }
})

function generateICalendar(
  events: any[],
  scope: string
): string {
  const now = new Date()
  const calendarName = scope === "all" ? "Ministry Calendar" : "Department Calendar"

  let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BLW Canada//Ministry Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${calendarName}
X-WR-TIMEZONE:UTC
X-WR-CALDESC:${calendarName} from BLW Canada OS
BEGIN:VTIMEZONE
TZID:UTC
BEGIN:STANDARD
DTSTART:19700101T000000Z
TZOFFSETFROM:+0000
TZOFFSETTO:+0000
END:STANDARD
END:VTIMEZONE
`

  // Add events
  for (const event of events) {
    const uid = `${event.id}@calendar.blwcanada.org`
    const startDate = new Date(event.start_date)
    const endDate = new Date(event.end_date)

    let dtstart: string
    let dtend: string

    if (event.all_day) {
      // All-day events use DATE format
      dtstart = `DTSTART;VALUE=DATE:${formatDateOnly(startDate)}`
      dtend = `DTEND;VALUE=DATE:${formatDateOnly(endDate)}`
    } else {
      // Timed events use DATETIME format
      dtstart = `DTSTART:${formatDateTime(startDate)}`
      dtend = `DTEND:${formatDateTime(endDate)}`
    }

    const summary = escapeICalText(event.title)
    const description = event.description ? escapeICalText(event.description) : ""
    const location = event.location ? escapeICalText(event.location) : ""

    ical += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatDateTime(now)}
CREATED:${formatDateTime(now)}
LAST-MODIFIED:${formatDateTime(now)}
${dtstart}
${dtend}
SUMMARY:${summary}
`

    if (description) {
      ical += `DESCRIPTION:${description}\n`
    }

    if (location) {
      ical += `LOCATION:${location}\n`
    }

    if (event.zoom_join_url) {
      ical += `URL:${event.zoom_join_url}\n`
    }

    ical += `STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
`
  }

  ical += `END:VCALENDAR`

  return ical
}

function formatDateTime(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  const hours = String(date.getUTCHours()).padStart(2, "0")
  const minutes = String(date.getUTCMinutes()).padStart(2, "0")
  const seconds = String(date.getUTCSeconds()).padStart(2, "0")

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")

  return `${year}${month}${day}`
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n")
}
