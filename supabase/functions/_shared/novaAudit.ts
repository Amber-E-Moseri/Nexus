// Nova audit log writer.
// Writes to nova_audit_log and nova_messages using the caller's own JWT client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { NovaSource } from './novaCitations.ts'

export interface AuditEntry {
  userId: string
  sessionId?: string
  intent: string
  toolsInvoked?: string[]
  sourceIds?: Array<{ type: string; id: string }>
  modelUsed?: string
  tokensUsed?: number
  latencyMs?: number
  isAction?: boolean
  safetyEvent?: string
}

export async function writeAuditLog(
  client: ReturnType<typeof createClient>,
  entry: AuditEntry,
): Promise<string | null> {
  const { data, error } = await client
    .from('nova_audit_log')
    .insert({
      user_id: entry.userId,
      session_id: entry.sessionId ?? null,
      intent: entry.intent,
      tools_invoked: entry.toolsInvoked ?? [],
      source_ids: entry.sourceIds ?? [],
      model_used: entry.modelUsed ?? null,
      tokens_used: entry.tokensUsed ?? null,
      latency_ms: entry.latencyMs ?? null,
      is_action: entry.isAction ?? false,
      safety_event: entry.safetyEvent ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('nova audit write failed:', error.message)
    return null
  }
  return data?.id ?? null
}

export interface MessageEntry {
  sessionId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  sources?: NovaSource[]
  intent?: string
}

export async function writeMessage(
  client: ReturnType<typeof createClient>,
  entry: MessageEntry,
): Promise<string | null> {
  const { data, error } = await client
    .from('nova_messages')
    .insert({
      session_id: entry.sessionId,
      user_id: entry.userId,
      role: entry.role,
      content: entry.content,
      sources: entry.sources ?? [],
      intent: entry.intent ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('nova message write failed:', error.message)
    return null
  }
  return data?.id ?? null
}

export async function createSession(
  client: ReturnType<typeof createClient>,
  userId: string,
  sessionType: string,
  departmentId?: string | null,
): Promise<string | null> {
  const { data, error } = await client
    .from('nova_sessions')
    .insert({
      user_id: userId,
      session_type: sessionType,
      department_id: departmentId ?? null,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    console.error('nova session create failed:', error.message)
    return null
  }
  return data?.id ?? null
}
