// Nova Orchestrate — synchronous read and draft workflows.
// All queries run under the caller's JWT. No service-role client.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsOptionsResponse, jsonResponse } from '../_shared/cors.ts'
import { resolveUserContext } from '../_shared/novaAuth.ts'
import { writeAuditLog, writeMessage, createSession } from '../_shared/novaAudit.ts'
import { writeAuditWithCost } from '../_shared/novaCostCalculator.ts'
import { validateOrchestrateRequest, isKnownIntent } from '../_shared/novaSchemas.ts'
import type { NovaResponse } from '../_shared/novaCitations.ts'
import { callClaude, extractTextFromResponse, NOVA_MODELS } from '../_shared/novaModelRouter.ts'
import type { ModelCallResult } from '../_shared/novaModelRouter.ts'
import { handleDailyBrief } from './intents/brief.ts'
import { handleAskNexus } from './intents/ask.ts'
import { handleProjectAnalysis } from './intents/projectAnalysis.ts'
import { handleMeetingPrep } from './intents/meetingPrep.ts'
import { handleMeetingExtract } from './intents/meetingExtract.ts'
import { handleReport } from './intents/report.ts'

const RATE_LIMIT_PER_HOUR = 30

async function checkUserRateLimit(
  client: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await client
    .from('nova_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo)
  if (error) return true
  return (count ?? 0) < RATE_LIMIT_PER_HOUR
}

// Last-resort intent classification when no chip is selected.
// Returns one of the KNOWN_INTENTS or 'ask' as fallback.
// Uses fast model with a 10s timeout so slow inference doesn't block the response.
async function classifyIntent(message: string): Promise<string> {
  try {
    const result = await callClaude({
      tier: 'fast',
      systemBlocks: [
        {
          type: 'text',
          text: `Classify the user message into exactly one intent. Respond with ONLY the intent name.

Intents:
- daily_brief: asking for a summary of their day, daily overview, what's on their plate
- meeting_prep: asking to prepare for an upcoming meeting, pre-meeting brief, "prepare for X meeting"
- project_analysis: asking about project risks, sprint health, task analysis, blockers
- ask: any other question about Nexus data, tasks, meetings, general questions

Respond with one word only: daily_brief, meeting_prep, project_analysis, or ask`,
        },
      ],
      messages: [{ role: 'user', content: message }],
      maxTokens: 20,
      timeoutMs: 10000,
    })
    const classified = extractTextFromResponse(result).trim().toLowerCase()
    return isKnownIntent(classified) ? classified : 'ask'
  } catch {
    return 'ask'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req)
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, undefined, req)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Unauthorized' }, undefined, req)
  }
  const token = authHeader.slice(7)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
  if (authErr || !user) return jsonResponse(401, { error: 'Invalid session.' }, undefined, req)

  const userCtx = await resolveUserContext(userClient, token, user.id)
  if (!userCtx) return jsonResponse(403, { error: 'Could not determine your role.' }, undefined, req)

  let body: unknown
  try { body = await req.json() }
  catch { return jsonResponse(400, { error: 'Invalid request body.' }, undefined, req) }

  const request = validateOrchestrateRequest(body)
  if (!request) return jsonResponse(400, { error: 'A message is required (max 2000 chars).' }, undefined, req)

  const withinLimit = await checkUserRateLimit(userClient, user.id)
  if (!withinLimit) {
    await writeAuditLog(userClient, {
      userId: user.id, intent: request.intent ?? 'unknown', safetyEvent: 'rate_limit',
    })
    return jsonResponse(429, { error: 'Rate limit exceeded. Try again later.' }, undefined, req)
  }

  const startTime = Date.now()

  try {
    const intent = request.intent ?? await classifyIntent(request.message)

    const sessionType =
      intent === 'daily_brief' ? 'daily_brief' :
      intent === 'project_analysis' ? 'project_analysis' :
      intent === 'meeting_prep' ? 'meeting_prep' :
      intent === 'meeting_extract' ? 'meeting_extract' :
      intent === 'report' ? 'report' : 'chat'

    const sessionId = await createSession(userClient, user.id, sessionType, userCtx.departmentId)

    await writeMessage(userClient, {
      sessionId: sessionId!,
      userId: user.id,
      role: 'user',
      content: request.message,
      intent,
    })

    let response: NovaResponse

    switch (intent) {
      case 'daily_brief':
        response = await handleDailyBrief(userClient, userCtx, sessionId)
        break
      case 'meeting_prep':
        response = await handleMeetingPrep(userClient, userCtx, request, sessionId)
        break
      case 'meeting_extract':
        response = await handleMeetingExtract(userClient, userCtx, request, sessionId)
        break
      case 'project_analysis':
        response = await handleProjectAnalysis(userClient, userCtx, request, sessionId)
        break
      case 'report':
        response = await handleReport(userClient, userCtx, request, sessionId)
        break
      default:
        response = await handleAskNexus(userClient, userCtx, request, sessionId)
        break
    }

    const latencyMs = Date.now() - startTime

    await writeMessage(userClient, {
      sessionId: sessionId!,
      userId: user.id,
      role: 'assistant',
      content: response.answer,
      sources: response.sources,
      intent,
    })

    // Cost tracking: intent modules don't bubble up ModelCallResult directly,
    // so we log a cost-free audit row here. Individual intent modules that call
    // callClaude accumulate token usage in their result — wiring full per-call
    // cost propagation is a follow-up once intent modules return ModelCallResult.
    // For now this row captures latency, intent, and source metadata correctly.
    await writeAuditLog(userClient, {
      userId: user.id,
      sessionId: sessionId ?? undefined,
      intent,
      sourceIds: response.sources.map((s) => ({ type: s.type, id: s.id })),
      latencyMs,
    })

    return jsonResponse(200, response as unknown as Record<string, unknown>, undefined, req)
  } catch (error) {
    const latencyMs = Date.now() - startTime
    console.error('nova-orchestrate error:', error)
    await writeAuditLog(userClient, {
      userId: user.id, intent: request.intent ?? 'unknown',
      latencyMs, safetyEvent: 'error',
    }).catch(() => {})
    return jsonResponse(500, { error: 'Nova could not process that request.' }, undefined, req)
  }
})
