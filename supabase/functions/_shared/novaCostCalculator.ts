// Nova cost calculator.
// Pricing is per-million-tokens in USD, stored as integer cents to avoid float drift.
// Add new models here as they're adopted; never hardcode prices in intent modules.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ModelCallResult } from './novaModelRouter.ts'

interface ModelPricing {
  // All values: USD per 1M tokens
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
}

const PRICING: Record<string, ModelPricing> = {
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.60,
    cacheCreation: 0.15, // no separate creation cost for OpenAI
    cacheRead: 0.075,    // OpenAI charges ~50% for cached prompt tokens
  },
  'claude-haiku-4-5-20251001': {
    input: 0.80,
    output: 4.00,
    cacheCreation: 0.80,
    cacheRead: 0.08,
  },
  'claude-sonnet-5': {
    input: 3.00,
    output: 15.00,
    cacheCreation: 3.00,
    cacheRead: 0.30,
  },
}

function fallbackPricing(): ModelPricing {
  return PRICING['gpt-4o-mini']
}

export interface CostBreakdown {
  inputCostCents: number
  outputCostCents: number
  cacheCostCents: number
  totalCostCents: number
  isCacheHit: boolean
}

function toCents(tokens: number, pricePerMillion: number): number {
  return Math.round((tokens / 1_000_000) * pricePerMillion * 100)
}

export function calculateCost(result: ModelCallResult): CostBreakdown {
  const pricing = PRICING[result.model] ?? fallbackPricing()
  const isCacheHit = result.cacheReadInputTokens > 0

  const cacheReadCents = toCents(result.cacheReadInputTokens, pricing.cacheRead)
  const cacheCreationCents = toCents(result.cacheCreationInputTokens, pricing.cacheCreation)
  const cacheCostCents = isCacheHit ? cacheReadCents : cacheCreationCents

  const billableInput = result.inputTokens
    - result.cacheCreationInputTokens
    - result.cacheReadInputTokens
  const inputCostCents = toCents(Math.max(0, billableInput), pricing.input)
  const outputCostCents = toCents(result.outputTokens, pricing.output)

  return {
    inputCostCents,
    outputCostCents,
    cacheCostCents,
    totalCostCents: inputCostCents + outputCostCents + cacheCostCents,
    isCacheHit,
  }
}

export interface AuditCostEntry {
  userId: string
  sessionId?: string | null
  intent: string
  toolsInvoked?: string[]
  sourceIds?: Array<{ type: string; id: string }>
  latencyMs?: number
  isAction?: boolean
  safetyEvent?: string | null
  cacheBreakpointVersion?: string
}

export async function writeAuditWithCost(
  client: ReturnType<typeof createClient>,
  entry: AuditCostEntry,
  modelResult: ModelCallResult,
): Promise<string | null> {
  const cost = calculateCost(modelResult)

  const { data, error } = await client
    .from('nova_audit_log')
    .insert({
      user_id: entry.userId,
      session_id: entry.sessionId ?? null,
      intent: entry.intent,
      tools_invoked: entry.toolsInvoked ?? [],
      source_ids: entry.sourceIds ?? [],
      model_used: modelResult.model,
      // legacy total column — keep populated for backward compat
      tokens_used: modelResult.inputTokens + modelResult.outputTokens,
      // new breakdown columns
      input_tokens: modelResult.inputTokens,
      output_tokens: modelResult.outputTokens,
      cache_creation_input_tokens: modelResult.cacheCreationInputTokens || null,
      cache_read_input_tokens: modelResult.cacheReadInputTokens || null,
      cost_usd_cents: cost.totalCostCents,
      prompt_cache_hit: cost.isCacheHit,
      cache_breakpoint_version: entry.cacheBreakpointVersion ?? Deno.env.get('NOVA_SYSTEM_PROMPT_VERSION') ?? 'v1',
      latency_ms: entry.latencyMs ?? null,
      is_action: entry.isAction ?? false,
      safety_event: entry.safetyEvent ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('nova audit+cost write failed:', error.message)
    return null
  }
  return data?.id ?? null
}
