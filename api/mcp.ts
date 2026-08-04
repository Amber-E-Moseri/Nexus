import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import * as z from 'zod'

type VercelRequest = IncomingMessage
type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse
  json(value: unknown): void
}

export const config = { api: { bodyParser: false } }

const configuredRateLimit = Number.parseInt(process.env.MCP_RATE_LIMIT_PER_MINUTE ?? '', 10)
const RATE_LIMIT_PER_MINUTE = Number.isFinite(configuredRateLimit) && configuredRateLimit > 0 ? configuredRateLimit : 60
const UUID = z.string().uuid()
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')

type ApiKey = {
  id: string | null
  key_hash: string
  created_by: string
  department_id: string | null
  sprint_id: string | null
  permissions: string[]
  auth_type?: 'api_key' | 'oauth'
}

type Actor = {
  id: string
  role: string | null
  departmentId: string | null
  apiKey: ApiKey
  spaceRoles: Array<{ space_id: string; role: string }>
  isProgramsMember: boolean
}

class ToolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

function hashKey(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function toolResult(value: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
  }
}

function safeError(error: unknown) {
  if (error instanceof ToolError) return { code: error.code, message: error.message }
  if (error instanceof z.ZodError) return { code: 'INVALID_INPUT', message: 'The supplied tool input is invalid.' }
  console.error('MCP tool failure', error)
  return { code: 'INTERNAL_ERROR', message: 'Nexus could not complete this request.' }
}

function requireScope(actor: Actor, scope: string) {
  if (!actor.apiKey.permissions.includes(scope)) {
    throw new ToolError('KEY_SCOPE_DENIED', `This API key does not include the ${scope} scope.`)
  }
}

function requireDepartmentScope(actor: Actor, departmentId: string | null) {
  if (actor.apiKey.department_id && actor.apiKey.department_id !== departmentId) {
    throw new ToolError('KEY_SCOPE_DENIED', 'This API key is restricted to another department.')
  }
  if (actor.apiKey.sprint_id) {
    throw new ToolError('KEY_SCOPE_DENIED', 'This API key is restricted to a sprint and cannot be used for this department resource.')
  }
}

function requireSprintScope(actor: Actor, sprintId: string) {
  if (actor.apiKey.sprint_id && actor.apiKey.sprint_id !== sprintId) {
    throw new ToolError('KEY_SCOPE_DENIED', 'This API key is restricted to another sprint.')
  }
}

function isAdmin(actor: Actor) {
  return actor.role === 'super_admin' || actor.role === 'regional_secretary'
}

function hasSpaceRole(actor: Actor, spaceId: string | null, role: string) {
  return !!spaceId && actor.spaceRoles.some((entry) => entry.space_id === spaceId && entry.role === role)
}

async function authenticate(supabase: SupabaseClient, authorization: string | undefined): Promise<Actor> {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new ToolError('AUTHENTICATION_FAILED', 'Provide an API key in the Authorization: Bearer header.')

  const { data: oauthToken } = await supabase
    .from('mcp_oauth_tokens')
    .select('id, token_hash, user_id, scopes, expires_at, revoked')
    .eq('token_hash', hashKey(token)).maybeSingle()
  const { data: apiKey, error: keyError } = oauthToken ? { data: null, error: null } : await supabase
    .from('api_keys')
    .select('id, key_hash, created_by, department_id, sprint_id, permissions, expires_at, revoked, disabled')
    .eq('key_hash', hashKey(token))
    .maybeSingle()

  const key = oauthToken
    ? { id: null, key_hash: oauthToken.token_hash, created_by: oauthToken.user_id, department_id: null, sprint_id: null, permissions: oauthToken.scopes, auth_type: 'oauth' as const, revoked: oauthToken.revoked, disabled: false, expires_at: oauthToken.expires_at }
    : apiKey
  if (keyError || !key || !key.created_by || key.revoked || key.disabled || (key.expires_at && new Date(key.expires_at) <= new Date())) {
    throw new ToolError('AUTHENTICATION_FAILED', 'The API key is invalid, disabled, revoked, or expired.')
  }
  if (!Array.isArray(key.permissions) || !key.permissions.includes('mcp:access')) {
    throw new ToolError('KEY_SCOPE_DENIED', 'This API key is not enabled for MCP. Regenerate it with the mcp:access scope.')
  }

  const [{ data: user, error: userError }, { data: spaceRoles }, { data: programsSpaces }] = await Promise.all([
    supabase.from('users').select('id, role, department_id').eq('id', key.created_by).maybeSingle(),
    supabase.from('space_roles').select('space_id, role').eq('user_id', key.created_by),
    supabase.from('departments').select('id').eq('name', 'Programs').limit(1),
  ])
  if (userError || !user) throw new ToolError('AUTHENTICATION_FAILED', 'The API key owner no longer has an active Nexus account.')

  const programSpaceId = programsSpaces?.[0]?.id
  const { data: programMembership } = programSpaceId
    ? await supabase.from('space_members').select('id').eq('user_id', user.id).eq('space_id', programSpaceId).maybeSingle()
    : { data: null }

  // Service-role access bypasses Postgres RLS. Every tool below applies the
  // corresponding Nexus visibility/management rules before issuing its query.
  return {
    id: user.id,
    role: user.role,
    departmentId: user.department_id,
    apiKey: key,
    spaceRoles: spaceRoles ?? [],
    isProgramsMember: !!programMembership,
  }
}

async function canManageSprint(supabase: SupabaseClient, actor: Actor, sprint: any) {
  if (isAdmin(actor) || actor.isProgramsMember || sprint.created_by === actor.id) return true
  const { data: membership } = await supabase
    .from('sprint_members')
    .select('role')
    .eq('sprint_id', sprint.id)
    .eq('user_id', actor.id)
    .in('role', ['owner', 'manager'])
    .maybeSingle()
  return !!membership
}

async function canEditMeeting(supabase: SupabaseClient, actor: Actor, meeting: any) {
  if (meeting.created_by === actor.id || meeting.allowed_editors?.includes(actor.id)) return true
  if (meeting.meeting_type === '1_on_1_meeting') return false
  if (meeting.visibility !== 'published') return false
  if (actor.role === 'super_admin') return true
  if (actor.role === 'regional_secretary' || actor.spaceRoles.some((entry) => entry.role === 'ors')) return true
  if (hasSpaceRole(actor, meeting.department_id, 'dept_lead')) return true
  const { data: grant } = await supabase
    .from('user_grants')
    .select('id')
    .eq('user_id', actor.id)
    .eq('grant_type', 'meetings_manager')
    .maybeSingle()
  return !!grant
}

function currentWeek() {
  const now = new Date()
  const day = now.getUTCDay() || 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1))
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) }
}

async function audit(supabase: SupabaseClient, actor: Actor, toolName: string, success: boolean, errorCode?: string) {
  await supabase.from('mcp_tool_audit_log').insert({
    api_key_id: actor.apiKey.auth_type === 'oauth' ? null : actor.apiKey.id,
    user_id: actor.id,
    tool_name: toolName,
    success,
    error_code: errorCode ?? null,
  })
}

async function enforceRateLimit(supabase: SupabaseClient, actor: Actor) {
  // Recheck the exact key hash immediately before a tool executes. This makes
  // regeneration/revocation effective even if it happens after HTTP auth but
  // before MCP dispatches the JSON-RPC tool call.
  if (actor.apiKey.auth_type === 'oauth') {
    const { data: oauth } = await supabase.from('mcp_oauth_tokens').select('id, expires_at, revoked').eq('token_hash', actor.apiKey.key_hash).maybeSingle()
    if (!oauth || oauth.revoked || (oauth.expires_at && new Date(oauth.expires_at) <= new Date())) throw new ToolError('AUTHENTICATION_FAILED', 'This OAuth connection is revoked or expired.')
    return
  }
  const { data: currentKey } = await supabase
    .from('api_keys')
    .select('id, expires_at, revoked, disabled')
    .eq('id', actor.apiKey.id)
    .eq('key_hash', actor.apiKey.key_hash)
    .maybeSingle()
  if (!currentKey || currentKey.revoked || currentKey.disabled || (currentKey.expires_at && new Date(currentKey.expires_at) <= new Date())) {
    throw new ToolError('AUTHENTICATION_FAILED', 'This API key was revoked, disabled, rotated, or expired.')
  }

  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await supabase
    .from('mcp_tool_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', actor.apiKey.id)
    .gte('created_at', since)
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    throw new ToolError('RATE_LIMITED', 'Too many MCP requests for this key. Try again in one minute.')
  }
}

function createServer(supabase: SupabaseClient, actor: Actor) {
  const server = new McpServer({ name: 'nexus', version: '1.0.0' })
  const register = <T extends Record<string, z.ZodTypeAny>>(
    name: string,
    description: string,
    inputSchema: T,
    handler: (input: z.output<z.ZodObject<T>>) => Promise<unknown>,
  ) => {
    server.registerTool(name, { description, inputSchema: inputSchema as any }, async (input: any) => {
      try {
        await enforceRateLimit(supabase, actor)
        const output = await handler(input as z.output<z.ZodObject<T>>)
        await audit(supabase, actor, name, true)
        return toolResult({ ok: true, data: output }) as any
      } catch (error) {
        const safe = safeError(error)
        await audit(supabase, actor, name, false, safe.code)
        return toolResult({ ok: false, error: safe }, true) as any
      }
    })
  }

  register('create_sprint_task', 'Create a task in a sprint that the authenticated Nexus user can manage.', {
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10_000).optional(),
    department_id: UUID.optional(),
    assignee_id: UUID.optional(),
    due_date: DATE.optional(),
    sprint_id: UUID,
  }, async ({ title, description, department_id, assignee_id, due_date, sprint_id }) => {
    requireScope(actor, 'tasks:write')
    requireSprintScope(actor, sprint_id)
    const { data: sprint } = await supabase
      .from('sprints')
      .select('id, department_id, created_by, archived_at, is_archived')
      .eq('id', sprint_id).maybeSingle()
    if (!sprint || sprint.archived_at || sprint.is_archived) throw new ToolError('NOT_FOUND', 'The sprint does not exist or is archived.')
    if (!(await canManageSprint(supabase, actor, sprint))) throw new ToolError('PERMISSION_DENIED', 'You cannot create tasks in this sprint.')
    const departmentId = department_id ?? sprint.department_id ?? null
    if (department_id && sprint.department_id && department_id !== sprint.department_id) throw new ToolError('INVALID_INPUT', 'department_id must match the sprint department.')
    if (!actor.apiKey.sprint_id) requireDepartmentScope(actor, departmentId)

    if (assignee_id) {
      const [{ data: assignee }, { data: sprintMember }] = await Promise.all([
        supabase.from('users').select('id, department_id').eq('id', assignee_id).maybeSingle(),
        supabase.from('sprint_members').select('id').eq('sprint_id', sprint_id).eq('user_id', assignee_id).maybeSingle(),
      ])
      if (!assignee || (!sprintMember && assignee.department_id !== departmentId && assignee_id !== actor.id)) {
        throw new ToolError('INVALID_ASSIGNEE', 'The assignee must belong to this sprint or department.')
      }
    }

    const { data: status } = await supabase
      .from('task_status_definitions')
      .select('id, legacy_key')
      .is('department_id', null)
      .eq('active', true)
      .eq('category', 'open')
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(1).maybeSingle()
    if (!status) throw new ToolError('CONFIGURATION_ERROR', 'Nexus has no active default open task status.')

    const { data: task, error } = await supabase.from('tasks').insert({
      title, description: description || null, department_id: departmentId, assignee_id: assignee_id ?? null,
      due_date: due_date ?? null, sprint_id, task_type: 'sprint', source: 'api', created_by: actor.id,
      status_id: status.id, status: status.legacy_key ?? 'to_do', is_personal: false,
    }).select('id, title, description, department_id, assignee_id, due_date, sprint_id, status_id, created_at').single()
    if (error || !task) throw new ToolError('WRITE_FAILED', 'Nexus could not create the task.')
    if (assignee_id) await supabase.from('task_assignees').upsert({ task_id: task.id, user_id: assignee_id }, { onConflict: 'task_id,user_id' })
    return task
  })

  register('get_sprint_status', 'Return task counts by Nexus task status category for a visible sprint.', { sprint_id: UUID }, async ({ sprint_id }) => {
    requireScope(actor, 'tasks:read')
    requireSprintScope(actor, sprint_id)
    const [{ data: sprint }, { data: member }] = await Promise.all([
      supabase.from('sprints').select('id, name, department_id, created_by').eq('id', sprint_id).maybeSingle(),
      supabase.from('sprint_members').select('id').eq('sprint_id', sprint_id).eq('user_id', actor.id).maybeSingle(),
    ])
    if (!sprint) throw new ToolError('NOT_FOUND', 'The sprint does not exist.')
    const visible = isAdmin(actor) || actor.isProgramsMember || sprint.created_by === actor.id || !!member || hasSpaceRole(actor, sprint.department_id, 'dept_lead') || actor.departmentId === sprint.department_id
    if (!visible) throw new ToolError('PERMISSION_DENIED', 'You cannot view this sprint.')
    if (!actor.apiKey.sprint_id) requireDepartmentScope(actor, sprint.department_id)
    const { data: tasks, error } = await supabase.from('tasks')
      .select('id, status, status_definition:task_status_definitions!status_id(name, category)')
      .eq('sprint_id', sprint_id).is('deleted_at', null)
    if (error) throw new ToolError('READ_FAILED', 'Nexus could not load sprint tasks.')
    const buckets: Record<string, number> = { open: 0, in_progress: 0, completed: 0, cancelled: 0, unknown: 0 }
    const statuses: Record<string, number> = {}
    for (const task of tasks ?? []) {
      const definition = Array.isArray(task.status_definition) ? task.status_definition[0] : task.status_definition
      const category = definition?.category ?? 'unknown'
      buckets[category] = (buckets[category] ?? 0) + 1
      const statusName = definition?.name ?? task.status ?? 'Unknown'
      statuses[statusName] = (statuses[statusName] ?? 0) + 1
    }
    return { sprint: { id: sprint.id, name: sprint.name }, total: (tasks ?? []).length, buckets, statuses }
  })

  register('get_weekly_wins', 'List weekly wins available to the authenticated Nexus user. Defaults to the current Monday-Sunday week.', {
    start_date: DATE.optional(), end_date: DATE.optional(),
  }, async ({ start_date, end_date }) => {
    requireScope(actor, 'wins:read')
    const current = currentWeek()
    const start = start_date ?? current.start
    const end = end_date ?? current.end
    if (start > end) throw new ToolError('INVALID_INPUT', 'start_date must be on or before end_date.')
    if (!isAdmin(actor) && !actor.departmentId) return { start_date: start, end_date: end, wins: [] }
    requireDepartmentScope(actor, actor.departmentId)
    let query = supabase.from('weekly_wins').select('id, department_id, week_start, content, task_id, created_by, created_at, updated_at, author:users!created_by(id, name), task:tasks!task_id(id, title)')
      .gte('week_start', start).lte('week_start', end).order('week_start').order('created_at').limit(200)
    if (!isAdmin(actor)) query = query.eq('department_id', actor.departmentId)
    const { data, error } = await query
    if (error) throw new ToolError('READ_FAILED', 'Nexus could not load weekly wins.')
    return { start_date: start, end_date: end, wins: data ?? [] }
  })

  register('log_meeting_minutes', 'Append a human-authored note to meeting notes without changing AI-managed transcript, summary, or extraction fields.', {
    meeting_id: UUID, content: z.string().trim().min(1).max(20_000),
  }, async ({ meeting_id, content }) => {
    requireScope(actor, 'meetings:write')
    const { data: meeting } = await supabase
      .from('meetings').select('id, department_id, created_by, visibility, meeting_type, allowed_editors').eq('id', meeting_id).maybeSingle()
    if (!meeting) throw new ToolError('NOT_FOUND', 'The meeting does not exist.')
    requireDepartmentScope(actor, meeting.department_id)
    if (!(await canEditMeeting(supabase, actor, meeting))) throw new ToolError('PERMISSION_DENIED', 'You cannot add minutes to this meeting.')
    const { data: updatedRow, error } = await supabase
      .rpc('append_mcp_meeting_note_block', { p_meeting_id: meeting.id, p_content: content })
      .maybeSingle()
    const updated = updatedRow as { id: string; notes_text: string | null; updated_at: string | null } | null
    if (error || !updated) throw new ToolError('WRITE_FAILED', 'Nexus could not save the meeting minutes.')
    return { meeting_id: updated.id, notes_text: updated.notes_text, updated_at: updated.updated_at }
  })

  register('list_my_tasks', 'List tasks assigned to the authenticated Nexus user, including secondary task_assignees assignments.', {}, async () => {
    requireScope(actor, 'tasks:read')
    const { data: secondary } = await supabase.from('task_assignees').select('task_id').eq('user_id', actor.id)
    const secondaryIds = (secondary ?? []).map((row) => row.task_id)
    let query = supabase.from('tasks').select('id, title, description, priority, status, due_date, due_time, created_at, department_id, assignee_id, sprint_id, task_type, source, completed_at, status_definition:task_status_definitions!status_id(id, name, color, category, legacy_key), assignee:users!assignee_id(id, name), space:departments(id, name, color)')
      .is('deleted_at', null).order('due_date', { ascending: true }).order('created_at', { ascending: false }).limit(200)
    query = secondaryIds.length ? query.or(`assignee_id.eq.${actor.id},id.in.(${secondaryIds.join(',')})`) : query.eq('assignee_id', actor.id)
    if (actor.apiKey.department_id) query = query.eq('department_id', actor.apiKey.department_id)
    if (actor.apiKey.sprint_id) query = query.eq('sprint_id', actor.apiKey.sprint_id)
    const { data, error } = await query
    if (error) throw new ToolError('READ_FAILED', 'Nexus could not load your tasks.')
    return { tasks: data ?? [] }
  })

  return server
}

function sendJsonRpcError(res: VercelResponse, status: number, code: string, message: string) {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32001, message, data: { code } }, id: null })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version')
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    sendJsonRpcError(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST for MCP requests.')
    return
  }
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    sendJsonRpcError(res, 500, 'SERVER_NOT_CONFIGURED', 'The Nexus MCP connector is not configured.')
    return
  }
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const actor = await authenticate(supabase, req.headers.authorization)
    const server = createServer(supabase, actor)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    await transport.handleRequest(req, res)
    res.on('close', () => { void transport.close(); void server.close() })
  } catch (error) {
    const safe = safeError(error)
    const status = safe.code === 'AUTHENTICATION_FAILED' || safe.code === 'KEY_SCOPE_DENIED' ? 401 : 500
    if (status === 401) {
      res.setHeader('WWW-Authenticate', 'Bearer resource_metadata="https://nexus.lwcanada.org/.well-known/oauth-protected-resource"')
    }
    if (!res.headersSent) sendJsonRpcError(res, status, safe.code, safe.message)
  }
}
