// Nova — in-app AI assistant edge function.
//
// Two jobs, both handled in this one function so Claude itself decides which
// track a question belongs to (see the guardrail instructions in
// buildSystemPrompt.ts):
//   Track A — how-to/FAQ, answered from the cached knowledge-base system prompt.
//   Track B — exactly two live-data tools (get_sprint_due_today,
//             get_my_followups_today), executed against the CALLER's own JWT
//             so Postgres RLS — not this function — enforces who can see what.
//
// Deliberately NOT the Vercel `api/mcp.ts` connector: that one serves
// external MCP clients (Claude Cowork) via API keys. Nova is in-app only and
// talks to Supabase directly with the browser session's JWT. Do not reuse or
// modify api/mcp.ts for this — see the build prompt, section 5 and 8.
//
// CRITICAL: this function must never construct a service-role Supabase
// client. Every query — KB reads, tool queries, and the query-log write —
// goes through a client scoped to the caller's own JWT, so RLS applies
// exactly as it would for that user anywhere else in Nexus.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsOptionsResponse } from '../_shared/cors.ts'
import {
  buildNovaSystemBlocks,
  parseKbUsedTrailer,
  isNovaRole,
  type NovaKbEntry,
  type NovaRole,
} from '../../../src/features/nova/lib/buildSystemPrompt.ts'
import { buildNovaToolDefinitions, type NovaToolName } from '../../../src/features/nova/lib/novaTools.ts'

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const MAX_QUESTION_CHARS = 1000
const MAX_TOOL_ITERATIONS = 4 // only 2 tools exist; this just guards against a runaway loop
const ANTHROPIC_TIMEOUT_MS = Number(Deno.env.get('ANTHROPIC_TIMEOUT_MS')) || 60000

// ── Anthropic call (non-streaming internally — see note above the response
// builder at the bottom of this file for why) ──────────────────────────────

async function callClaude(
  systemBlocks: unknown,
  tools: unknown,
  messages: unknown[],
  anthropicKey: string,
): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS)
  let resp: Response
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: systemBlocks,
        tools,
        tool_choice: { type: 'auto' },
        messages,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Claude API call timed out after ${ANTHROPIC_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(`Claude API error: ${err.error?.message || resp.status}`)
  }
  return await resp.json()
}

// ── Role resolution ──────────────────────────────────────────────────────
// JWT custom claims carry user_role (see CLAUDE.md — custom_access_token_hook).
// Fall back to a direct table lookup for pre-hook sessions, same fallback
// pattern used everywhere else in this codebase.

function decodeJwtClaim(token: string, claim: string): string | null {
  try {
    const payloadB64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(payloadB64))
    return payload[claim] ?? null
  } catch {
    return null
  }
}

async function resolveRole(
  userClient: ReturnType<typeof createClient>,
  token: string,
  userId: string,
): Promise<NovaRole | null> {
  const claimRole = decodeJwtClaim(token, 'user_role')
  if (isNovaRole(claimRole)) return claimRole

  const { data } = await userClient.from('users').select('role').eq('id', userId).maybeSingle()
  return isNovaRole(data?.role) ? (data!.role as NovaRole) : null
}

// ── Track B tool implementations ─────────────────────────────────────────
// Every query below runs on the caller's own RLS-scoped client. No tool here
// accepts a target-user parameter — both are hardcoded to the asking user's
// own id, by design (see novaTools.ts: "never call this to look up another
// user's ... ").

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const isIncompleteCategory = (category: string | undefined) => category !== 'completed' && category !== 'cancelled'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function toolGetSprintDueToday(client: ReturnType<typeof createClient>, userId: string) {
  const { data: memberships, error: memberErr } = await client
    .from('sprint_members')
    .select('sprint_id, sprint:sprints!inner(id, name, status)')
    .eq('user_id', userId)
  if (memberErr) throw new Error('Could not load your sprint memberships.')

  const activeSprints = (memberships ?? [])
    .map((m: any) => (Array.isArray(m.sprint) ? m.sprint[0] : m.sprint))
    .filter((s: any) => s?.status === 'active')
  const activeSprintIds = activeSprints.map((s: any) => s.id)

  if (activeSprintIds.length === 0) {
    return { date: todayISO(), sprints: [], tasks: [], note: 'You are not currently a member of any active sprint.' }
  }

  const today = todayISO()
  const { data: tasks, error: taskErr } = await client
    .from('tasks')
    .select(
      'id, title, priority, due_date, sprint_id, status_definition:task_status_definitions!status_id(name, category), assignee:users!assignee_id(id, name)',
    )
    .in('sprint_id', activeSprintIds)
    .eq('due_date', today)
    .is('deleted_at', null)
  if (taskErr) throw new Error('Could not load sprint tasks.')

  const sorted = (tasks ?? []).slice().sort((a: any, b: any) => {
    const rankDiff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
    if (rankDiff !== 0) return rankDiff
    return (a.title ?? '').localeCompare(b.title ?? '')
  })

  return {
    date: today,
    sprints: activeSprints.map((s: any) => ({ id: s.id, name: s.name })),
    tasks: sorted.map((t: any) => ({
      id: t.id,
      title: t.title,
      priority: t.priority ?? 'medium',
      status: t.status_definition?.name ?? 'Unknown',
      assignee: t.assignee?.name ?? 'Unassigned',
    })),
  }
}

function assigneeFilteredQuery(
  client: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  userId: string,
  secondaryTaskIds: string[],
) {
  let query = client.from(table).select(columns).is('deleted_at', null)
  query = secondaryTaskIds.length
    ? query.or(`assignee_id.eq.${userId},id.in.(${secondaryTaskIds.join(',')})`)
    : query.eq('assignee_id', userId)
  return query
}

async function toolGetMyFollowupsToday(client: ReturnType<typeof createClient>, userId: string) {
  const today = todayISO()

  const { data: secondary } = await client.from('task_assignees').select('task_id').eq('user_id', userId)
  const secondaryIds = (secondary ?? []).map((r: any) => r.task_id)

  // (a) + (b): overdue and due-today tasks assigned to the user.
  const { data: dueTasks, error: dueErr } = await assigneeFilteredQuery(
    client,
    'tasks',
    'id, title, priority, due_date, status_definition:task_status_definitions!status_id(name, category)',
    userId,
    secondaryIds,
  ).lte('due_date', today)
  if (dueErr) throw new Error('Could not load your tasks.')

  const incompleteDue = (dueTasks ?? []).filter((t: any) => isIncompleteCategory(t.status_definition?.category))
  const overdueTasks = incompleteDue.filter((t: any) => t.due_date < today)
  const dueTodayTasks = incompleteDue.filter((t: any) => t.due_date === today)

  // (c) Incomplete meeting action items — tasks tied to a meeting. Excludes
  // ones already counted above (has a due_date of today-or-earlier) so a
  // task that's both an action item AND overdue doesn't show up twice.
  const { data: actionItems, error: actionErr } = await assigneeFilteredQuery(
    client,
    'tasks',
    'id, title, due_date, status_definition:task_status_definitions!status_id(name, category), meeting:meetings(id, title)',
    userId,
    secondaryIds,
  ).not('meeting_id', 'is', null)
  if (actionErr) throw new Error('Could not load your meeting action items.')

  const meetingActionItems = (actionItems ?? []).filter((t: any) => {
    const incomplete = isIncompleteCategory(t.status_definition?.category)
    const notAlreadyCounted = !t.due_date || t.due_date > today
    return incomplete && notAlreadyCounted
  })

  // (d) Awaiting the user's response.
  //
  // Verified against real data before shipping (see nova-followups-heuristic
  // verification notes): an earlier version of this guessed at notification
  // `type` values ('%invite%', '%approval%', '%pending%') — checked against
  // the actual distinct types in production (mention, task_assigned,
  // task_status_changed, task_completed, sprint_access_requested,
  // flock_followup_due), that pattern matched ZERO real rows. It was a
  // silent-miss failure mode: it would always return an empty list and look
  // like "nothing pending" even when something genuinely was.
  //
  // sprint_access_requested notifications turned out to have a real,
  // precise backing table — sprint_access_requests, with an actual `status`
  // column ('pending' / 'approved' / ...) — confirmed against live rows
  // that its recipients are always the sprint's owner/manager, i.e. this
  // really is "awaiting your response." Querying that table directly is
  // exact, not a guess.
  //
  // Absence-approval batches have NO backing table as of this writing —
  // absence_email_log is a send log (status: sent/failed), not a pending-
  // approval queue, and no absence_approvals/absence_email_batches table
  // exists. Rather than fabricate a query against something that doesn't
  // exist, this category is scoped to sprint access requests only for v1.
  // Widen it if/when a real pending-absence-approval table lands — do not
  // reach for notification-type pattern matching as the fallback; that path
  // is proven to silently under-report.
  const { data: managedSprints } = await client
    .from('sprint_members')
    .select('sprint_id')
    .eq('user_id', userId)
    .in('role', ['owner', 'manager'])
  const managedSprintIds = (managedSprints ?? []).map((m: any) => m.sprint_id)

  let pendingSprintRequests: any[] = []
  if (managedSprintIds.length > 0) {
    const { data: requests, error: reqErr } = await client
      .from('sprint_access_requests')
      .select('id, sprint_id, user_id, requested_at, sprint:sprints(name), requester:users!user_id(name)')
      .eq('status', 'pending')
      .in('sprint_id', managedSprintIds)
      .order('requested_at', { ascending: false })
    if (reqErr) throw new Error('Could not load pending sprint access requests.')
    pendingSprintRequests = requests ?? []
  }

  return {
    date: today,
    overdue_tasks: overdueTasks.map(formatFollowupTask),
    due_today_tasks: dueTodayTasks.map(formatFollowupTask),
    meeting_action_items: meetingActionItems.map((t: any) => ({
      id: t.id,
      title: t.title,
      meeting: t.meeting?.title ?? 'Unknown meeting',
      status: t.status_definition?.name ?? 'Unknown',
    })),
    awaiting_your_response: pendingSprintRequests.map((r: any) => ({
      id: r.id,
      type: 'sprint_access_request',
      summary: `${r.requester?.name ?? 'Someone'} requested access to "${r.sprint?.name ?? 'a sprint'}"`,
      created_at: r.requested_at,
    })),
  }
}

function formatFollowupTask(t: any) {
  return {
    id: t.id,
    title: t.title,
    priority: t.priority ?? 'medium',
    due_date: t.due_date,
    status: t.status_definition?.name ?? 'Unknown',
  }
}

// ── Adoption layer tools ────────────────────────────────────────────────

async function toolGetMyWorkSummary(client: ReturnType<typeof createClient>, userId: string) {
  // Combines sprint-due-today, followups-today, and onboarding status.
  const sprintDue = await toolGetSprintDueToday(client, userId)
  const followups = await toolGetMyFollowupsToday(client, userId)
  const onboarding = await toolGetOnboardingStatus(client, userId)

  return {
    summary: 'Your work summary',
    sprint_tasks_due_today: sprintDue.tasks.length,
    overdue_tasks: followups.overdue_tasks.length,
    tasks_due_today: followups.due_today_tasks.length,
    meeting_action_items: followups.meeting_action_items.length,
    onboarding_complete: onboarding.completed_at !== null,
    onboarding_progress: onboarding.steps ? onboarding.steps.filter((s: any) => s.completed_at).length : 0,
    onboarding_total: onboarding.steps ? onboarding.steps.length : 0,
    details: {
      sprint_tasks: sprintDue.tasks,
      followups: followups,
      onboarding_status: onboarding,
    },
  }
}

async function toolGetOnboardingStatus(client: ReturnType<typeof createClient>, userId: string) {
  const { data } = await client.rpc('get_onboarding_status', { p_user_id: userId })
  if (!data) {
    return {
      started_at: new Date().toISOString(),
      completed_at: null,
      steps: [],
    }
  }
  return data
}

async function toolGetDepartmentHealth(client: ReturnType<typeof createClient>, userId: string) {
  // Stub for Release 1: returns a placeholder. Real implementation in Release 2.
  // This tool requires permission checks (only dept leads + admins).
  const { data: user } = await client.from('users').select('role, department_id').eq('id', userId).single()

  if (!user || !['super_admin', 'regional_secretary', 'dept_lead'].includes(user.role)) {
    return {
      error: 'Only department leads and admins can view health scores.',
    }
  }

  // Placeholder response for now
  return {
    message: 'Department health score calculation coming in Release 2.',
    placeholder: true,
  }
}

async function executeTool(name: NovaToolName | string, client: ReturnType<typeof createClient>, userId: string) {
  if (name === 'get_sprint_due_today') return await toolGetSprintDueToday(client, userId)
  if (name === 'get_my_followups_today') return await toolGetMyFollowupsToday(client, userId)
  if (name === 'get_my_work_summary') return await toolGetMyWorkSummary(client, userId)
  if (name === 'get_onboarding_status') return await toolGetOnboardingStatus(client, userId)
  if (name === 'get_department_health') return await toolGetDepartmentHealth(client, userId)
  throw new Error(`Unknown tool: ${name}`)
}

// ── Main handler ──────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') return corsOptionsResponse(req)
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const token = authHeader.slice(7)

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: 'Nova is not configured.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Scoped to the caller's own JWT for the entire request — no service role
  // client exists anywhere in this function.
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid session.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let question: string
  try {
    const body = await req.json()
    question = typeof body?.question === 'string' ? body.question.trim() : ''
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!question) {
    return new Response(JSON.stringify({ error: 'Please ask Nova a question.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return new Response(JSON.stringify({ error: `Questions are limited to ${MAX_QUESTION_CHARS} characters.` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const role = await resolveRole(userClient, token, user.id)
    if (!role) {
      return new Response(JSON.stringify({ error: 'Could not determine your role.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // RLS (`nova_kb_read`) already restricts this to active, role-applicable
    // rows — no client-side filtering needed or trusted.
    const { data: kbEntries, error: kbErr } = await userClient
      .from('nova_kb_entries')
      .select('id, slug, question, answer, feature_area, applicable_roles, related_slugs')
      .order('feature_area', { ascending: true })
    if (kbErr) throw new Error('Could not load the knowledge base.')

    const systemBlocks = buildNovaSystemBlocks(role, (kbEntries ?? []) as NovaKbEntry[])
    const tools = buildNovaToolDefinitions()
    const messages: any[] = [{ role: 'user', content: question }]

    const toolCallsMade: string[] = []
    let response = await callClaude(systemBlocks, tools, messages, anthropicKey)
    let iterations = 0

    while (response.stop_reason === 'tool_use' && iterations < MAX_TOOL_ITERATIONS) {
      iterations += 1
      const toolUseBlocks = (response.content ?? []).filter((b: any) => b.type === 'tool_use')

      const toolResults = []
      for (const block of toolUseBlocks) {
        toolCallsMade.push(block.name)
        try {
          const result = await executeTool(block.name, userClient, user.id)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        } catch (toolErr) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: String((toolErr as Error)?.message || toolErr) }),
            is_error: true,
          })
        }
      }

      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })
      response = await callClaude(systemBlocks, tools, messages, anthropicKey)
    }

    const rawText = (response.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim()

    const { text: cleanText, kbSlugsUsed } = parseKbUsedTrailer(rawText)

    const slugToId = new Map((kbEntries ?? []).map((e: any) => [e.slug, e.id]))
    const kbEntriesUsed = kbSlugsUsed.map((slug) => slugToId.get(slug)).filter(Boolean)

    const track: 'kb' | 'live_data' | 'unanswered' =
      toolCallsMade.length > 0 ? 'live_data' : kbEntriesUsed.length > 0 ? 'kb' : 'unanswered'

    const { data: logRow } = await userClient
      .from('nova_query_log')
      .insert({
        user_id: user.id,
        question,
        track,
        kb_entries_used: kbEntriesUsed,
        tool_calls_made: toolCallsMade,
      })
      .select('id')
      .single()

    // Internally non-streaming (see callClaude above — the tool-use loop is
    // simpler and fully correct this way, and it lets the KB_USED trailer be
    // stripped once from a complete string instead of tail-buffering a live
    // token stream). The frontend still gets a real streamed UX: the already-
    // final, already-cleaned text is chunked out over SSE below.
    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const words = cleanText.split(/(\s+)/) // keep whitespace so chunks rejoin cleanly
        const CHUNK_SIZE = 6
        for (let i = 0; i < words.length; i += CHUNK_SIZE) {
          const chunk = words.slice(i, i + CHUNK_SIZE).join('')
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
          if (i + CHUNK_SIZE < words.length) await new Promise((r) => setTimeout(r, 12))
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, track, log_id: logRow?.id ?? null })}\n\n`),
        )
        controller.close()
      },
    })

    return new Response(responseStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('nova-chat error:', error)
    return new Response(JSON.stringify({ error: (error as Error)?.message || 'Nova could not answer that.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
