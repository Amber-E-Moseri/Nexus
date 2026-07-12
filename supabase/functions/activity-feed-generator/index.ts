import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const allowedOrigins = [
  Deno.env.get('ALLOWED_ORIGIN') ?? '',
  'https://blwcannexus.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean)

function getCorsHeaders(request?: Request) {
  const origin = request?.headers?.get('origin') ?? ''
  const matched = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': matched,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function jsonResponse(status: number, body: Record<string, unknown>, request?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
    },
  })
}

type ActionName =
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_due_changed'
  | 'comment_added'
  | 'comment_assigned'
  | 'dependency_added'

type ActivityRow = {
  user_id: string
  actor_id: string | null
  action: ActionName
  entity_type: 'task' | 'comment' | 'sprint'
  entity_id: string
  payload: Record<string, unknown>
  read: boolean
}

async function getTaskWatcherIds(supabase: ReturnType<typeof createClient>, taskId: string): Promise<string[]> {
  const { data } = await supabase
    .from('task_follows')
    .select('user_id')
    .eq('task_id', taskId)
  return (data ?? []).map((row) => row.user_id)
}

async function getActorName(supabase: ReturnType<typeof createClient>, actorId: string | null | undefined) {
  if (!actorId) return null

  const { data } = await supabase
    .from('users')
    .select('name')
    .eq('id', actorId)
    .maybeSingle()

  return data?.name ?? null
}

function dedupeRecipients(recipients: Array<string | null | undefined>, actorId: string | null | undefined) {
  return [...new Set(recipients.filter((recipient): recipient is string => Boolean(recipient) && recipient !== actorId))]
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(request) })
  }

  if (request.method !== 'POST') {
    return jsonResponse(200, { ok: false }, request)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('activity-feed-generator error', 'Missing Supabase environment variables')
      return jsonResponse(200, { ok: false }, request)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { action, payload } = await request.json() as { action?: ActionName; payload?: Record<string, unknown> }

    if (!action || !payload) {
      return jsonResponse(200, { ok: false }, request)
    }

    const actorId = typeof payload.actor_id === 'string' ? payload.actor_id : null
    const actorName = await getActorName(supabase, actorId)
    const basePayload = {
      ...payload,
      actor_name: actorName,
    }

    const rows: ActivityRow[] = []

    if (action === 'task_assigned') {
      const assigneeId = typeof payload.assignee_id === 'string' ? payload.assignee_id : null
      const recipients = dedupeRecipients([assigneeId], actorId)

      rows.push(...recipients.map((recipient) => ({
        user_id: recipient,
        actor_id: actorId,
        action,
        entity_type: 'task',
        entity_id: String(payload.task_id),
        payload: basePayload,
        read: false,
      })))
    }

    if (action === 'task_status_changed') {
      const taskId = String(payload.task_id)
      const [{ data: task }, { data: commenters }, { data: dependentTasks }, watcherIds] = await Promise.all([
        supabase.from('tasks').select('created_by').eq('id', taskId).maybeSingle(),
        supabase.from('task_comments').select('author_id').eq('task_id', taskId),
        supabase.from('task_dependencies').select('task:tasks!task_id(assignee_id)').eq('depends_on_id', taskId).eq('type', 'blocking'),
        getTaskWatcherIds(supabase, taskId),
      ])

      const recipients = dedupeRecipients([
        typeof payload.assignee_id === 'string' ? payload.assignee_id : null,
        task?.created_by ?? null,
        ...(commenters ?? []).map((comment) => comment.author_id),
        ...(dependentTasks ?? []).map((item) => item.task?.assignee_id ?? null),
        ...watcherIds,
      ], actorId)

      rows.push(...recipients.map((recipient) => ({
        user_id: recipient,
        actor_id: actorId,
        action,
        entity_type: 'task',
        entity_id: taskId,
        payload: basePayload,
        read: false,
      })))
    }

    if (action === 'task_due_changed') {
      const recipients = dedupeRecipients([
        typeof payload.assignee_id === 'string' ? payload.assignee_id : null,
      ], actorId)

      rows.push(...recipients.map((recipient) => ({
        user_id: recipient,
        actor_id: actorId,
        action,
        entity_type: 'task',
        entity_id: String(payload.task_id),
        payload: basePayload,
        read: false,
      })))
    }

    if (action === 'comment_added') {
      const taskId = String(payload.task_id)
      const authorId = typeof payload.author_id === 'string' ? payload.author_id : actorId
      const [{ data: task }, { data: commenters }, watcherIds] = await Promise.all([
        supabase.from('tasks').select('assignee_id, created_by').eq('id', taskId).maybeSingle(),
        supabase.from('task_comments').select('author_id').eq('task_id', taskId),
        getTaskWatcherIds(supabase, taskId),
      ])

      const recipients = dedupeRecipients([
        task?.assignee_id ?? (typeof payload.assignee_id === 'string' ? payload.assignee_id : null),
        task?.created_by ?? null,
        ...(commenters ?? []).map((comment) => comment.author_id),
        ...watcherIds,
      ], authorId)

      rows.push(...recipients.map((recipient) => ({
        user_id: recipient,
        actor_id: authorId,
        action,
        entity_type: 'comment',
        entity_id: String(payload.comment_id),
        payload: basePayload,
        read: false,
      })))
    }

    if (action === 'comment_assigned') {
      const assignedTo = typeof payload.assigned_to === 'string' ? payload.assigned_to : null
      const recipients = dedupeRecipients([assignedTo], actorId)

      rows.push(...recipients.map((recipient) => ({
        user_id: recipient,
        actor_id: actorId,
        action,
        entity_type: 'comment',
        entity_id: String(payload.comment_id),
        payload: basePayload,
        read: false,
      })))
    }

    if (action === 'dependency_added') {
      const taskId = String(payload.task_id)
      const dependsOnId = String(payload.depends_on_id)

      const { data: relatedTasks } = await supabase
        .from('tasks')
        .select('id, title, assignee_id')
        .in('id', [taskId, dependsOnId])

      const taskRow = (relatedTasks ?? []).find((task) => task.id === taskId)
      const dependsOnRow = (relatedTasks ?? []).find((task) => task.id === dependsOnId)

      const recipients = dedupeRecipients([
        taskRow?.assignee_id ?? null,
        dependsOnRow?.assignee_id ?? null,
      ], actorId)

      const payloadWithTitles = {
        ...basePayload,
        task_title: payload.task_title ?? taskRow?.title ?? null,
        depends_on_title: payload.depends_on_title ?? dependsOnRow?.title ?? null,
      }

      rows.push(...recipients.map((recipient) => ({
        user_id: recipient,
        actor_id: actorId,
        action,
        entity_type: 'task',
        entity_id: taskId,
        payload: payloadWithTitles,
        read: false,
      })))
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('activity_feed').insert(rows)
      if (error) {
        console.error('activity-feed-generator insert error', error.message)
      }
    }

    return jsonResponse(200, { ok: true, inserted: rows.length }, request)
  } catch (error) {
    console.error('activity-feed-generator error', error)
    return jsonResponse(200, { ok: false }, request)
  }
})
