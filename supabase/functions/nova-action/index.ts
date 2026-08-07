// nova-action — Confirmed write handler.
// Validates the confirmation token, re-checks permissions, calls the domain RPC,
// marks the proposal consumed, and writes an audit row.
// Auth: user JWT only — no service role. Domain RPCs are SECURITY DEFINER.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, corsOptionsResponse, jsonResponse } from '../_shared/cors.ts'
import { verifyToken, sha256Hex, canonicalJson } from '../_shared/novaActionTokens.ts'
import { callAssignTask, callCreateTask } from './tools/tasks.ts'
import { callAddAgendaItem } from './tools/meetings.ts'

const KNOWN_TOOLS = new Set(['nova_assign_task', 'nova_create_task', 'nova_add_agenda_item'])

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOptionsResponse(req)
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, undefined, req)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Unauthorized' }, undefined, req)
  }

  const actionSecret = Deno.env.get('NOVA_ACTION_SECRET')
  if (!actionSecret) return jsonResponse(500, { error: 'NOVA_ACTION_SECRET not configured.' }, undefined, req)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const token = authHeader.slice(7)
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
  if (authErr || !user) return jsonResponse(401, { error: 'Invalid session.' }, undefined, req)

  let body: any
  try { body = await req.json() }
  catch { return jsonResponse(400, { error: 'Invalid request body.' }, undefined, req) }

  const { proposalId, confirmationToken } = body ?? {}
  if (!proposalId || !confirmationToken) {
    return jsonResponse(400, { error: 'proposalId and confirmationToken are required.' }, undefined, req)
  }

  // 1. Verify token signature + expiry
  const payload = await verifyToken(confirmationToken, actionSecret)
  if (!payload) return jsonResponse(403, { error: 'Invalid or expired confirmation token.' }, undefined, req)

  // 2. Token must match this proposal and this user
  if (payload.proposalId !== proposalId || payload.userId !== user.id) {
    return jsonResponse(403, { error: 'Token mismatch.' }, undefined, req)
  }

  // 3. Load proposal
  const { data: proposal, error: propErr } = await userClient
    .from('nova_action_proposals')
    .select('*')
    .eq('id', proposalId)
    .single()

  if (propErr || !proposal) return jsonResponse(404, { error: 'Proposal not found.' }, undefined, req)
  if (proposal.user_id !== user.id) return jsonResponse(403, { error: 'Permission denied.' }, undefined, req)
  if (proposal.consumed_at) return jsonResponse(409, { error: 'This action has already been executed.' }, undefined, req)
  if (proposal.status !== 'pending') return jsonResponse(409, { error: `Proposal is ${proposal.status}.` }, undefined, req)

  // 4. Token expiry (DB-side)
  if (proposal.token_expires_at && new Date(proposal.token_expires_at) <= new Date()) {
    return jsonResponse(403, { error: 'Confirmation token expired.' }, undefined, req)
  }

  // 5. Hash comparison — stored hash must match SHA-256 of the presented token
  const presentedHash = await sha256Hex(confirmationToken)
  if (presentedHash !== proposal.confirmation_token_hash) {
    return jsonResponse(403, { error: 'Token hash mismatch.' }, undefined, req)
  }

  // 6. Arguments hash must still match
  const argsHash = await sha256Hex(canonicalJson(proposal.arguments))
  if (argsHash !== proposal.arguments_hash) {
    return jsonResponse(403, { error: 'Argument integrity check failed.' }, undefined, req)
  }

  // 7. Tool must be known
  if (!KNOWN_TOOLS.has(proposal.tool_name)) {
    return jsonResponse(400, { error: `Unknown tool: ${proposal.tool_name}` }, undefined, req)
  }

  const startTime = Date.now()

  try {
    // 8. Execute via domain RPC (SECURITY DEFINER — permission check inside RPC)
    let result: Record<string, unknown>

    switch (proposal.tool_name) {
      case 'nova_assign_task':
        result = await callAssignTask(userClient, proposal.arguments)
        break
      case 'nova_create_task':
        result = await callCreateTask(userClient, proposal.arguments)
        break
      case 'nova_add_agenda_item':
        result = await callAddAgendaItem(userClient, proposal.arguments)
        break
      default:
        throw new Error(`Unhandled tool: ${proposal.tool_name}`)
    }

    // 9. Mark proposal consumed (transactionally as a follow-up update)
    await userClient
      .from('nova_action_proposals')
      .update({ consumed_at: new Date().toISOString(), status: 'confirmed' })
      .eq('id', proposalId)

    // 10. Audit row
    await userClient
      .from('nova_audit_log')
      .insert({
        user_id: user.id,
        session_id: proposal.session_id ?? null,
        intent: proposal.tool_name,
        is_action: true,
        confirmed_at: new Date().toISOString(),
        actor_confirmed: true,
        proposal_id: proposalId,
        latency_ms: Date.now() - startTime,
      })

    return jsonResponse(200, { success: true, tool: proposal.tool_name, result }, undefined, req)
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Action failed'
    console.error('nova-action error:', msg)

    // Mark expired if permission denied
    if (msg.includes('permission denied')) {
      await userClient
        .from('nova_action_proposals')
        .update({ status: 'cancelled' })
        .eq('id', proposalId)
    }

    await userClient
      .from('nova_audit_log')
      .insert({
        user_id: user.id,
        session_id: proposal.session_id ?? null,
        intent: proposal.tool_name,
        is_action: true,
        safety_event: 'error',
        latency_ms: Date.now() - startTime,
      })
      .catch(() => {})

    return jsonResponse(500, { error: msg }, undefined, req)
  }
})
