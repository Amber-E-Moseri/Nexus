// Register cron job in Supabase SQL Editor with:
// select cron.schedule(
//   'generate-recurring-meetings-hourly',
//   '0 * * * *',  -- Every hour
//   $$
//   select net.http_post(
//     url := '[SUPABASE_PROJECT_URL]/functions/v1/generate-recurring-meetings',
//     headers := '{"Authorization": "Bearer [SERVICE_ROLE_KEY]"}'::jsonb
//   );
//   $$
// );
//
// Progressively materializes the next occurrence of each recurring meeting
// series, ~1 day before it's due to happen, instead of creating dozens of
// meetings up front. Only one row per series ever carries a non-null
// `next_occurrence_scheduled` at a time (the most recently generated/edited
// occurrence) — this function finds those that are due, generates the next
// row, and moves the marker forward.
//
// NOTE: the recurrence-date math here (parseRule/nextOccurrenceDate) mirrors
// src/features/meetings/lib/recurrence.js. Keep the two in sync if the
// recurrence rule format ever changes.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function verifyServiceRole(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return false
  const token = authHeader.replace('Bearer ', '')
  const expectedToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return token === expectedToken
}

const MAX_OCCURRENCES = 52
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const REVERSE_DAY_MAP: Record<string, string> = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' }

interface RecurrenceData {
  frequency: string
  daysOfWeek: Set<string>
  dayOfMonth: number
  endType: 'occurrences' | 'date' | 'never'
  occurrences: number
  endDate: string | null
}

function parseRecurrenceRule(rrule: string | null): RecurrenceData | null {
  if (!rrule) return null
  const parts = Object.fromEntries(rrule.split(';').map((p) => p.split('='))) as Record<string, string>
  const interval = parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1
  const frequency = parts.FREQ === 'WEEKLY' && interval === 2 ? 'bi-weekly' : (parts.FREQ || '').toLowerCase()

  const daysOfWeek = new Set<string>()
  if (parts.BYDAY) {
    parts.BYDAY.split(',').forEach((d) => {
      if (REVERSE_DAY_MAP[d]) daysOfWeek.add(REVERSE_DAY_MAP[d])
    })
  }

  const dayOfMonth = parts.BYMONTHDAY ? parseInt(parts.BYMONTHDAY, 10) : 1

  let endType: RecurrenceData['endType'] = 'never'
  let occurrences = MAX_OCCURRENCES
  let endDate: string | null = null
  if (parts.COUNT) {
    endType = 'occurrences'
    occurrences = parseInt(parts.COUNT, 10)
  } else if (parts.UNTIL) {
    endType = 'date'
    const raw = parts.UNTIL
    endDate = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }

  return { frequency, daysOfWeek, dayOfMonth, endType, occurrences, endDate }
}

function addDaysUtc(d: Date, days: number): Date {
  const next = new Date(d)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addMonthsUtc(d: Date, months: number): Date {
  const next = new Date(d)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

function lastDayOfMonthUtc(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}

// Mirrors generateOccurrenceDates in recurrence.js — generates the bounded
// occurrence list for a series from its original start date.
function generateOccurrenceDates(startDateTime: Date, recurrenceData: RecurrenceData): Date[] {
  const { frequency, daysOfWeek, dayOfMonth, endType, occurrences, endDate } = recurrenceData
  const hardCap = endType === 'occurrences' ? Math.min(occurrences, MAX_OCCURRENCES) : MAX_OCCURRENCES
  const untilDate = endType === 'date' && endDate ? new Date(`${endDate}T23:59:59Z`) : null

  if (frequency === 'none') return [startDateTime]

  const dates: Date[] = []

  if ((frequency === 'weekly' || frequency === 'bi-weekly') && daysOfWeek.size > 0) {
    const weekStep = frequency === 'bi-weekly' ? 2 : 1
    const selectedDayIndexes = new Set(Array.from(daysOfWeek).map((d) => DAYS_OF_WEEK.indexOf(d)))
    let cur = startDateTime
    let weekIndex = 0
    while (dates.length < hardCap) {
      if (selectedDayIndexes.has(cur.getUTCDay()) && weekIndex % weekStep === 0) {
        if (untilDate && cur > untilDate) break
        dates.push(cur)
      }
      const next = addDaysUtc(cur, 1)
      if (next.getUTCDay() === 0 && cur.getUTCDay() !== 0) weekIndex += 1
      cur = next
      if (untilDate && cur > untilDate) break
    }
    return dates
  }

  let cur = startDateTime
  while (dates.length < hardCap) {
    if (untilDate && cur > untilDate) break
    dates.push(cur)

    if (frequency === 'daily') {
      cur = addDaysUtc(cur, 1)
    } else if (frequency === 'weekly') {
      cur = addDaysUtc(cur, 7)
    } else if (frequency === 'bi-weekly') {
      cur = addDaysUtc(cur, 14)
    } else if (frequency === 'monthly') {
      const advanced = addMonthsUtc(cur, 1)
      const targetDay = Math.min(dayOfMonth, lastDayOfMonthUtc(advanced))
      advanced.setUTCDate(targetDay)
      cur = advanced
    } else {
      break
    }
  }

  return dates
}

function getNextOccurrenceDate(recurrenceRule: string | null, seriesStartDate: Date, seriesInstanceNum: number): Date | null {
  const recurrenceData = parseRecurrenceRule(recurrenceRule)
  if (!recurrenceData) return null
  const allDates = generateOccurrenceDates(seriesStartDate, recurrenceData)
  return allDates[seriesInstanceNum] ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }
  if (!(await verifyServiceRole(req))) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const { data: dueMeetings, error: dueError } = await supabase
    .from('meetings')
    .select('id, title, department_id, meeting_type, agenda, status, visibility, allowed_viewers, created_by, recurrence_id, recurrence_rule, series_instance_num, next_occurrence_scheduled')
    .not('recurrence_rule', 'is', null)
    .not('next_occurrence_scheduled', 'is', null)
    .lte('next_occurrence_scheduled', new Date().toISOString())
    .limit(50)

  if (dueError) {
    return jsonResponse(500, { error: dueError.message })
  }

  if (!dueMeetings || dueMeetings.length === 0) {
    return jsonResponse(200, { generated: 0, message: 'No occurrences due for generation' })
  }

  let generated = 0
  const errors: string[] = []

  for (const meeting of dueMeetings) {
    try {
      const { data: parent, error: parentError } = await supabase
        .from('meetings')
        .select('date')
        .eq('recurrence_id', meeting.recurrence_id)
        .eq('series_instance_num', 1)
        .single()
      if (parentError) throw parentError

      const seriesStartDate = new Date(parent.date)
      const nextDate = getNextOccurrenceDate(meeting.recurrence_rule, seriesStartDate, meeting.series_instance_num)

      if (!nextDate) {
        // Series has reached its end condition — stop generating.
        await supabase.from('meetings').update({ next_occurrence_scheduled: null }).eq('id', meeting.id)
        continue
      }

      const nextInstanceNum = meeting.series_instance_num + 1
      const followingDate = getNextOccurrenceDate(meeting.recurrence_rule, seriesStartDate, nextInstanceNum)
      const followingScheduled = followingDate ? addDaysUtc(followingDate, -1).toISOString() : null

      const { data: newMeeting, error: insertError } = await supabase
        .from('meetings')
        .insert({
          title: meeting.title,
          department_id: meeting.department_id,
          meeting_type: meeting.meeting_type,
          agenda: meeting.agenda,
          status: 'scheduled',
          visibility: meeting.visibility,
          allowed_viewers: meeting.allowed_viewers,
          created_by: meeting.created_by,
          date: nextDate.toISOString(),
          recurrence_id: meeting.recurrence_id,
          recurrence_rule: meeting.recurrence_rule,
          series_instance_num: nextInstanceNum,
          next_occurrence_scheduled: followingScheduled,
        })
        .select('id')
        .single()
      if (insertError) throw insertError

      // Carry forward the same attendee list as the most recently generated
      // occurrence (reflects any "this and future" edits made since creation).
      const { data: attendance } = await supabase
        .from('meeting_attendance')
        .select('user_id')
        .eq('meeting_id', meeting.id)

      if (attendance && attendance.length > 0) {
        await supabase.from('meeting_attendance').insert(
          attendance.map((a: { user_id: string }) => ({ meeting_id: newMeeting.id, user_id: a.user_id, status: 'pending' })),
        )
      }

      await supabase.from('meetings').update({ next_occurrence_scheduled: null }).eq('id', meeting.id)
      generated += 1
    } catch (err) {
      errors.push(`meeting ${meeting.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return jsonResponse(200, {
    generated,
    checked: dueMeetings.length,
    errors: errors.length > 0 ? errors : undefined,
  })
})
