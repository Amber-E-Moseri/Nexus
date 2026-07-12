// Space Task Calendar iCal Feed
// Token-based, no auth required for calendar apps.
// Feed types:
//   my_tasks          — tasks assigned to user in a specific space
//   followed_tasks    — tasks user follows in a specific space (task_followers join)
//   all_my_tasks      — all tasks assigned to user across all spaces
//   all_followed_tasks — all tasks user follows across all spaces
//   planner           — user's time-blocked schedule (time_blocks table, timed events)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const url = new URL(req.url)
    const token = url.pathname.split('/').pop()

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase environment variables')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: sub, error: subError } = await supabase
      .from('task_feed_subscriptions')
      .select('user_id, space_id, feed_type')
      .eq('token', token)
      .single()

    if (subError || !sub) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { user_id, space_id, feed_type } = sub

    // Planner feed: time-blocked schedule with real start/end times
    if (feed_type === 'planner') {
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 1)
      const sixMonthsAhead = new Date()
      sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6)

      const { data: blocks, error: blockError } = await supabase
        .from('time_blocks')
        .select('id, task_id, scheduled_date, scheduled_start_time, scheduled_end_time, is_all_day')
        .eq('user_id', user_id)
        .gte('scheduled_date', sixMonthsAgo.toISOString().split('T')[0])
        .lte('scheduled_date', sixMonthsAhead.toISOString().split('T')[0])
        .order('scheduled_date')
        .order('scheduled_start_time')

      if (blockError) throw blockError

      // Fetch task titles for all referenced tasks
      const taskIds = [...new Set((blocks ?? []).map((b) => b.task_id).filter(Boolean))] as string[]
      const taskMap: Record<string, { title: string; priority: string | null }> = {}
      if (taskIds.length > 0) {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, priority')
          .in('id', taskIds)
        for (const t of tasks ?? []) taskMap[t.id] = { title: t.title, priority: t.priority }
      }

      const ical = generatePlannerICalFeed(blocks ?? [], taskMap)
      return new Response(ical, {
        status: 200,
        headers: calendarHeaders('My Planner Schedule'),
      })
    }

    // Task feeds: assigned or followed, optionally space-scoped
    const GLOBAL_FEEDS = ['all_my_tasks', 'all_followed_tasks']
    const isGlobal = GLOBAL_FEEDS.includes(feed_type)

    let taskQuery = supabase
      .from('tasks')
      .select('id, title, description, due_date, status_id, priority, assignee_id, created_by')
      .is('parent_task_id', null)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })

    if (!isGlobal && space_id) {
      taskQuery = taskQuery.eq('department_id', space_id)
    }

    if (feed_type === 'my_tasks' || feed_type === 'all_my_tasks') {
      taskQuery = taskQuery.eq('assignee_id', user_id)
    } else if (feed_type === 'followed_tasks' || feed_type === 'all_followed_tasks') {
      // Join through task_follows
      const { data: follows, error: followError } = await supabase
        .from('task_follows')
        .select('task_id')
        .eq('user_id', user_id)
      if (followError) throw followError

      const followedIds = (follows ?? []).map((f) => f.task_id) as string[]
      if (followedIds.length === 0) {
        return new Response(generateEmptyFeed('Followed Tasks'), {
          status: 200,
          headers: calendarHeaders('Followed Tasks'),
        })
      }
      taskQuery = taskQuery.in('id', followedIds)
    } else {
      return new Response(JSON.stringify({ error: 'Unsupported feed type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: tasks, error: taskError } = await taskQuery
    if (taskError) throw taskError

    const statusIds = [...new Set((tasks ?? []).map((t) => t.status_id).filter(Boolean))] as string[]
    const statusMap: Record<string, string> = {}
    if (statusIds.length > 0) {
      const { data: statuses } = await supabase
        .from('task_status_definitions')
        .select('id, name')
        .in('id', statusIds)
      for (const s of statuses ?? []) statusMap[s.id] = s.name
    }

    const feedNames: Record<string, string> = {
      my_tasks: 'My Tasks',
      followed_tasks: 'Followed Tasks',
      all_my_tasks: 'All My Tasks',
      all_followed_tasks: 'All Followed Tasks',
    }
    const feedName = feedNames[feed_type] ?? 'Tasks'
    const ical = generateTaskICalFeed(feedName, tasks ?? [], statusMap)

    return new Response(ical, {
      status: 200,
      headers: calendarHeaders(feedName),
    })
  } catch (error) {
    console.error('Task feed error:', error)
    return new Response(JSON.stringify({ error: 'Feed generation failed', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

function calendarHeaders(feedName: string): HeadersInit {
  return {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="${feedName.replace(/\s+/g, '-').toLowerCase()}.ics"`,
    'Cache-Control': 'max-age=900',
    'Access-Control-Allow-Origin': '*',
  }
}

function generateEmptyFeed(feedName: string): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BLW Canada//Task Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalValue(feedName)}`,
    'X-WR-TIMEZONE:America/Toronto',
    `LAST-MODIFIED:${now}`,
    'END:VCALENDAR',
  ].join('\r\n')
}

function generateTaskICalFeed(feedName: string, tasks: any[], statusMap: Record<string, string>): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BLW Canada//Task Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalValue(feedName)}`,
    'X-WR-TIMEZONE:America/Toronto',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    `LAST-MODIFIED:${now}`,
  ]

  for (const task of tasks) {
    if (!task.due_date) continue

    const uid = `task-${task.id}@blwcanada.org`
    const dueDateStr = task.due_date.split('T')[0].replace(/-/g, '')
    const statusName = statusMap[task.status_id] ?? 'Open'
    const description = [
      task.description,
      `Status: ${statusName}`,
      task.priority ? `Priority: ${task.priority}` : null,
    ].filter(Boolean).join('\n')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTART;VALUE=DATE:${dueDateStr}`)
    const nextDay = new Date(task.due_date)
    nextDay.setDate(nextDay.getDate() + 1)
    const dtendStr = nextDay.toISOString().slice(0, 10).replace(/-/g, '')
    lines.push(`DTEND;VALUE=DATE:${dtendStr}`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(`SUMMARY:${escapeICalValue(task.title)}`)
    if (description) lines.push(`DESCRIPTION:${escapeICalValue(description)}`)
    if (task.priority) {
      const priorityMap: Record<string, string> = { urgent: '1', high: '1', medium: '5', low: '9' }
      lines.push(`PRIORITY:${priorityMap[task.priority] || '5'}`)
    }
    lines.push('STATUS:CONFIRMED')
    lines.push(`CREATED:${now}`)
    lines.push('TRANSP:TRANSPARENT')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function generatePlannerICalFeed(blocks: any[], taskMap: Record<string, { title: string; priority: string | null }>): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BLW Canada//Task Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:My Planner Schedule',
    'X-WR-TIMEZONE:America/Toronto',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    `LAST-MODIFIED:${now}`,
  ]

  for (const block of blocks) {
    const task = block.task_id ? taskMap[block.task_id] : null
    const title = task?.title ?? 'Scheduled Block'
    const uid = `block-${block.id}@blwcanada.org`
    const dateStr = block.scheduled_date.replace(/-/g, '')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(`SUMMARY:${escapeICalValue(title)}`)
    lines.push(`CREATED:${now}`)

    if (block.is_all_day) {
      lines.push(`DTSTART;VALUE=DATE:${dateStr}`)
      const nextBlockDay = new Date(block.scheduled_date)
      nextBlockDay.setDate(nextBlockDay.getDate() + 1)
      const blockDtend = nextBlockDay.toISOString().slice(0, 10).replace(/-/g, '')
      lines.push(`DTEND;VALUE=DATE:${blockDtend}`)
      lines.push('TRANSP:TRANSPARENT')
    } else {
      // Convert HH:MM:SS time to iCal local time format
      const startTime = (block.scheduled_start_time ?? '09:00:00').replace(/:/g, '').slice(0, 6)
      const endTime = (block.scheduled_end_time ?? '10:00:00').replace(/:/g, '').slice(0, 6)
      lines.push(`DTSTART;TZID=America/Toronto:${dateStr}T${startTime}`)
      lines.push(`DTEND;TZID=America/Toronto:${dateStr}T${endTime}`)
      lines.push('TRANSP:OPAQUE')
    }

    if (task?.priority) {
      const priorityMap: Record<string, string> = { urgent: '1', high: '1', medium: '5', low: '9' }
      lines.push(`PRIORITY:${priorityMap[task.priority] || '5'}`)
    }
    lines.push('STATUS:CONFIRMED')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function escapeICalValue(value: string): string {
  if (!value) return ''
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}
