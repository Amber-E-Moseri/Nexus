// Approach taken for status alignment (task 7):
//   tasks.status (legacy text) still exists and is kept in sync by the
//   sync_task_status_fields() BEFORE INSERT OR UPDATE trigger defined in
//   migration 20260618000001_configurable_task_statuses.sql. That trigger
//   resolves status_id from the legacy status string on write, and writes the
//   legacy_key back to tasks.status when status_id is supplied directly. It also
//   manages completed_at based on the resolved category, so this function no
//   longer sets completed_at explicitly. API callers may supply either status
//   (legacy string) or status_id (uuid). Both are returned in read responses so
//   callers can migrate at their own pace.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN')

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin ?? '',
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

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [yearText, monthText, dayText] = value.split('-')
  const year = Number.parseInt(yearText, 10)
  const month = Number.parseInt(monthText, 10)
  const day = Number.parseInt(dayText, 10)
  const parsed = new Date(`${value}T00:00:00Z`)

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day
}

function validateTaskFields(fields: string[], body: Record<string, unknown>) {
  for (const field of fields) {
    if (!(field in body)) continue

    const value = body[field]

    if (field === 'title') {
      if (typeof value !== 'string') return { valid: false, error: 'title must be a string' }
      if (!value.trim()) return { valid: false, error: 'title is required' }
      if (value.length > 500) return { valid: false, error: 'title must be 500 characters or fewer' }
    }

    if (field === 'description') {
      if (value !== null && typeof value !== 'string') return { valid: false, error: 'description must be a string or null' }
      if (typeof value === 'string' && value.length > 10000) {
        return { valid: false, error: 'description must be 10000 characters or fewer' }
      }
    }

    if (field === 'priority') {
      if (typeof value !== 'string' || !['urgent', 'high', 'medium', 'low'].includes(value)) {
        return { valid: false, error: "priority must be one of: 'urgent', 'high', 'medium', 'low'" }
      }
    }

    if (field === 'due_date') {
      if (value !== null && typeof value !== 'string') return { valid: false, error: 'due_date must be a string or null' }
      if (typeof value === 'string' && !isValidDateString(value)) {
        return { valid: false, error: 'due_date must be a valid YYYY-MM-DD date' }
      }
    }

    if (field === 'source_name') {
      if (value !== null && typeof value !== 'string') return { valid: false, error: 'source_name must be a string or null' }
      if (typeof value === 'string' && value.length > 200) {
        return { valid: false, error: 'source_name must be 200 characters or fewer' }
      }
    }
  }

  return { valid: true, error: null }
}

Deno.serve(async (request) => {
  if (!allowedOrigin) {
    console.error('task-api error', 'Missing ALLOWED_ORIGIN environment variable')
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('task-api error', 'Missing required environment variables')
    return jsonResponse(500, { error: 'Internal server error' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const apiKey = request.headers.get('x-api-key')

  if (!apiKey) {
    return jsonResponse(401, { error: 'Missing x-api-key header' })
  }

  const keyHash = await hashApiKey(apiKey)
  const { data: keyRecord, error: keyError } = await supabase
    .from('api_keys')
    .select('id, department_id, sprint_id, permissions, revoked, disabled, expires_at')
    .eq('key_hash', keyHash)
    .single()

  if (keyError || !keyRecord) {
    return jsonResponse(401, { error: 'Invalid API key' })
  }

  if (keyRecord.revoked) {
    return jsonResponse(401, { error: 'API key has been revoked' })
  }

  if (keyRecord.disabled) {
    return jsonResponse(401, { error: 'API key is disabled' })
  }

  if (keyRecord.expires_at && new Date(keyRecord.expires_at).getTime() < Date.now()) {
    return jsonResponse(401, { error: 'API key has expired' })
  }

  const { data: rateCheck, error: rateError } = await supabase.rpc('check_and_increment_rate_limit', {
    p_key_id: keyRecord.id,
    p_max_requests: 60,
  })

  if (rateError) {
    console.error('rate-limit check failed', rateError.message)
    return jsonResponse(503, { error: 'Rate limit service unavailable. Try again shortly.' })
  }

  if (rateCheck && !rateCheck.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded — 60 requests per minute' }), {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(rateCheck.retry_after ?? 60),
      },
    })
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
      const validation = validateTaskFields(
        ['title', 'description', 'priority', 'due_date', 'source_name'],
        body as Record<string, unknown>,
      )

      if (!validation.valid) {
        return jsonResponse(400, { error: validation.error })
      }

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
          .select('id, title, status, status_id')
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
        // Prefer status_id if the caller supplies it; otherwise pass status (legacy
        // string) and let the trigger resolve status_id from it.
        ...(body.status_id ? { status_id: body.status_id } : { status: body.status ?? 'backlog' }),
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
        .select('id, title, status, status_id, priority, due_date, source, source_name, source_type, external_unique_key, department_id, sprint_id, created_at')
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
      const validation = validateTaskFields(
        ['title', 'description', 'priority', 'due_date', 'source_name'],
        body as Record<string, unknown>,
      )

      if (!validation.valid) {
        return jsonResponse(400, { error: validation.error })
      }

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
      for (const field of ['title', 'status', 'status_id', 'priority', 'due_date', 'description', 'source_name']) {
        if (field in body) {
          updates[field] = field === 'title' && typeof body[field] === 'string'
            ? body[field].trim()
            : body[field]
        }
      }
      // completed_at is managed by the sync_task_status_fields trigger.

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

    if (request.method === 'GET' && path === '/folders') {
      if (!hasPermission(keyRecord.permissions, 'tasks:read')) {
        return jsonResponse(403, { error: 'API key does not allow task reads' })
      }

      let query = supabase
        .from('folders')
        .select('id, name, sort_order, department_id, created_at')
        .order('sort_order', { ascending: true })

      if (keyRecord.department_id) query = query.eq('department_id', keyRecord.department_id)

      const { data: folders, error } = await query
      if (error) throw error

      return jsonResponse(200, { folders: folders ?? [] })
    }

    if (request.method === 'GET' && path === '/lists') {
      if (!hasPermission(keyRecord.permissions, 'tasks:read')) {
        return jsonResponse(403, { error: 'API key does not allow task reads' })
      }

      const folderId = url.searchParams.get('folder_id')

      let query = supabase
        .from('lists')
        .select('id, name, folder_id, department_id, sort_order, created_at')
        .order('sort_order', { ascending: true })

      if (keyRecord.department_id) query = query.eq('department_id', keyRecord.department_id)
      if (folderId) query = query.eq('folder_id', folderId)

      const { data: lists, error } = await query
      if (error) throw error

      return jsonResponse(200, { lists: lists ?? [] })
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
    return jsonResponse(500, { error: 'Internal server error' })
  }
})
