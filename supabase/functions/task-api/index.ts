import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function hasPermission(permissions: unknown, value: string) {
  return Array.isArray(permissions) && permissions.includes(value)
}

function normalizePath(pathname: string) {
  return pathname.replace(/^.*\/task-api/, '') || '/'
}

function taskWithinScope(task: { department_id?: string | null; sprint_id?: string | null }, key: {
  department_id?: string | null
  sprint_id?: string | null
}) {
  if (key.department_id && task.department_id !== key.department_id) return false
  if (key.sprint_id && task.sprint_id !== key.sprint_id) return false
  return true
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Missing required environment variables' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const apiKey = request.headers.get('x-api-key')

  if (!apiKey) {
    return jsonResponse(401, { error: 'Missing x-api-key header' })
  }

  const keyHash = await hashApiKey(apiKey)
  const { data: keyRecord, error: keyError } = await supabase
    .from('api_keys')
    .select('id, department_id, sprint_id, permissions, revoked, expires_at')
    .eq('key_hash', keyHash)
    .single()

  if (keyError || !keyRecord) {
    return jsonResponse(401, { error: 'Invalid API key' })
  }

  if (keyRecord.revoked) {
    return jsonResponse(401, { error: 'API key has been revoked' })
  }

  if (keyRecord.expires_at && new Date(keyRecord.expires_at).getTime() < Date.now()) {
    return jsonResponse(401, { error: 'API key has expired' })
  }

  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRecord.id)

  const url = new URL(request.url)
  const path = normalizePath(url.pathname)

  try {
    if (request.method === 'POST' && path === '/tasks') {
      if (!hasPermission(keyRecord.permissions, 'tasks:write')) {
        return jsonResponse(403, { error: 'API key does not allow task writes' })
      }

      const body = await request.json()
      if (!body.title?.trim()) {
        return jsonResponse(400, { error: 'title is required' })
      }

      if (body.department_id && keyRecord.department_id && body.department_id !== keyRecord.department_id) {
        return jsonResponse(403, { error: 'department_id is outside this API key scope' })
      }

      if (body.sprint_id && keyRecord.sprint_id && body.sprint_id !== keyRecord.sprint_id) {
        return jsonResponse(403, { error: 'sprint_id is outside this API key scope' })
      }

      if (body.external_unique_key) {
        const { data: existing } = await supabase
          .from('tasks')
          .select('id, title, status')
          .eq('external_unique_key', body.external_unique_key)
          .maybeSingle()

        if (existing) {
          return jsonResponse(200, {
            duplicate: true,
            task: existing,
            message: 'Task with this external_unique_key already exists',
          })
        }
      }

      const sprintId = body.sprint_id ?? keyRecord.sprint_id ?? null
      const departmentId = body.department_id ?? keyRecord.department_id ?? null
      const taskData = {
        title: body.title.trim(),
        description: body.description?.trim() || null,
        status: body.status ?? 'backlog',
        priority: body.priority ?? 'medium',
        due_date: body.due_date ?? null,
        department_id: departmentId,
        sprint_id: sprintId,
        task_type: sprintId ? 'sprint' : 'space',
        source: 'api',
        source_name: body.source_name ?? null,
        source_type: body.source_type ?? null,
        external_unique_key: body.external_unique_key ?? null,
        is_personal: false,
      }

      const { data: task, error } = await supabase.from('tasks').insert(taskData).select().single()
      if (error) throw error

      return jsonResponse(201, { task })
    }

    if (request.method === 'GET' && path === '/tasks') {
      if (!hasPermission(keyRecord.permissions, 'tasks:read')) {
        return jsonResponse(403, { error: 'API key does not allow task reads' })
      }

      const status = url.searchParams.get('status')
      const source = url.searchParams.get('source')
      const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200)

      let query = supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, source, source_name, source_type, external_unique_key, department_id, sprint_id, created_at')
        .eq('is_personal', false)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (keyRecord.department_id) query = query.eq('department_id', keyRecord.department_id)
      if (keyRecord.sprint_id) query = query.eq('sprint_id', keyRecord.sprint_id)
      if (status) query = query.eq('status', status)
      if (source) query = query.eq('source', source)

      const { data: tasks, error } = await query
      if (error) throw error

      return jsonResponse(200, { tasks: tasks ?? [], count: tasks?.length ?? 0 })
    }

    if (request.method === 'PATCH' && path.startsWith('/tasks/')) {
      if (!hasPermission(keyRecord.permissions, 'tasks:write')) {
        return jsonResponse(403, { error: 'API key does not allow task writes' })
      }

      const taskId = path.replace('/tasks/', '')
      const body = await request.json()
      const { data: existingTask, error: existingTaskError } = await supabase
        .from('tasks')
        .select('id, department_id, sprint_id, is_personal')
        .eq('id', taskId)
        .single()

      if (existingTaskError || !existingTask || existingTask.is_personal) {
        return jsonResponse(404, { error: 'Task not found' })
      }

      if (!taskWithinScope(existingTask, keyRecord)) {
        return jsonResponse(403, { error: 'Task is outside this API key scope' })
      }

      const updates: Record<string, unknown> = {}
      for (const field of ['title', 'status', 'priority', 'due_date', 'description']) {
        if (field in body) {
          updates[field] = field === 'title' && typeof body[field] === 'string'
            ? body[field].trim()
            : body[field]
        }
      }

      if (updates.status === 'done') {
        updates.completed_at = new Date().toISOString()
      } else if ('status' in updates) {
        updates.completed_at = null
      }

      const { data: task, error } = await supabase.from('tasks').update(updates).eq('id', taskId).select().single()
      if (error) throw error

      return jsonResponse(200, { task })
    }

    if (request.method === 'GET' && path === '/spaces') {
      if (!hasPermission(keyRecord.permissions, 'tasks:read')) {
        return jsonResponse(403, { error: 'API key does not allow task reads' })
      }

      let query = supabase.from('departments').select('id, name, color').order('name')
      if (keyRecord.department_id) query = query.eq('id', keyRecord.department_id)

      const { data: spaces, error } = await query
      if (error) throw error
      return jsonResponse(200, { spaces: spaces ?? [] })
    }

    if (request.method === 'GET' && path === '/sprints') {
      if (!hasPermission(keyRecord.permissions, 'tasks:read')) {
        return jsonResponse(403, { error: 'API key does not allow task reads' })
      }

      let query = supabase
        .from('sprints')
        .select('id, name, status, start_date, end_date')
        .neq('status', 'archived')
        .order('created_at', { ascending: false })

      if (keyRecord.sprint_id) query = query.eq('id', keyRecord.sprint_id)

      const { data: sprints, error } = await query
      if (error) throw error
      return jsonResponse(200, { sprints: sprints ?? [] })
    }

    return jsonResponse(404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('task-api error', message)
    return jsonResponse(500, { error: 'Internal server error', detail: message })
  }
})
