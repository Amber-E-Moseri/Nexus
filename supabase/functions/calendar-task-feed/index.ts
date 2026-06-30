// Space Task Calendar iCal Feed
// Token-based, no auth required for calendar apps.
// Two feed types: my_tasks (assignee) and followed_tasks (currently tasks the user created).
// Scoped to a specific space.

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

    let taskQuery = supabase
      .from('tasks')
      .select('id, title, description, due_date, status_id, priority, assignee_id, parent_task_id, created_by')
      .eq('department_id', sub.space_id)
      .is('parent_task_id', null)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })

    if (sub.feed_type === 'my_tasks') {
      taskQuery = taskQuery.eq('assignee_id', sub.user_id)
    } else if (sub.feed_type === 'followed_tasks') {
      taskQuery = taskQuery.eq('created_by', sub.user_id)
    } else {
      return new Response(JSON.stringify({ error: 'Unsupported feed type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: tasks, error: taskError } = await taskQuery
    if (taskError) throw taskError

    const statusIds = [...new Set((tasks ?? []).map((task) => task.status_id).filter(Boolean))] as string[]
    const statusMap: Record<string, string> = {}
    if (statusIds.length > 0) {
      const { data: statuses, error: statusError } = await supabase
        .from('task_status_definitions')
        .select('id, name')
        .in('id', statusIds)

      if (statusError) throw statusError
      for (const status of statuses ?? []) {
        statusMap[status.id] = status.name
      }
    }

    const feedName = sub.feed_type === 'my_tasks' ? 'My Tasks' : 'Created Tasks'
    const ical = generateTaskICalFeed(feedName, tasks ?? [], statusMap)

    return new Response(ical, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${feedName.replace(/\s+/g, '-').toLowerCase()}.ics"`,
        'Cache-Control': 'max-age=900',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Task feed error:', error)
    return new Response(JSON.stringify({ error: 'Feed generation failed', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

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
    const dtstamp = now
    const dueDateStr = task.due_date.split('T')[0].replace(/-/g, '')
    const dtstart = `DTSTART;VALUE=DATE:${dueDateStr}`
    const dtend = `DTEND;VALUE=DATE:${dueDateStr}`

    const statusName = statusMap[task.status_id] ?? 'Open'
    const description = [
      task.description,
      `Status: ${statusName}`,
      task.priority ? `Priority: ${task.priority}` : null,
    ].filter(Boolean).join('\n')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(dtstart)
    lines.push(dtend)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(`SUMMARY:${escapeICalValue(task.title)}`)
    if (description) lines.push(`DESCRIPTION:${escapeICalValue(description)}`)
    if (task.priority) {
      const priorityMap: Record<string, string> = { urgent: '1', high: '1', medium: '5', low: '9' }
      lines.push(`PRIORITY:${priorityMap[task.priority] || '5'}`)
    }
    lines.push('STATUS:CONFIRMED')
    lines.push(`CREATED:${dtstamp}`)
    lines.push('TRANSP:TRANSPARENT')
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
