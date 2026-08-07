// Server-side KB full-text search.
// Called from nova-orchestrate intent handlers before any Claude call.
// Uses the caller's JWT-scoped client so RLS on nova_kb_entries applies.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface KbMatch {
  id: string
  slug: string
  question: string
  answer: string
  rank: number
  matchedFields: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface KbSearchResult {
  match: KbMatch | null
  // rank > 0.8 — return answer directly, skip Claude
  directMatch: boolean
  // rank 0.3–0.8 — decent match but Claude may improve it
  fallthrough: boolean
}

const HIGH_CONFIDENCE = 0.8
const MEDIUM_CONFIDENCE = 0.3

function toConfidence(rank: number): 'high' | 'medium' | 'low' {
  if (rank >= HIGH_CONFIDENCE) return 'high'
  if (rank >= MEDIUM_CONFIDENCE) return 'medium'
  return 'low'
}

export async function searchKnowledgeBase(
  client: ReturnType<typeof createClient>,
  query: string,
): Promise<KbSearchResult> {
  const { data, error } = await client.rpc('search_nova_kb', {
    p_query: query,
    p_limit: 1,
    p_min_rank: MEDIUM_CONFIDENCE,
  })

  if (error || !data?.length) {
    return { match: null, directMatch: false, fallthrough: false }
  }

  const row = data[0] as any
  const match: KbMatch = {
    id: row.id,
    slug: row.slug,
    question: row.question,
    answer: row.answer,
    rank: row.rank,
    matchedFields: row.matched_fields ?? [],
    confidence: toConfidence(row.rank),
  }

  return {
    match,
    directMatch: match.rank >= HIGH_CONFIDENCE,
    fallthrough: match.rank >= MEDIUM_CONFIDENCE && match.rank < HIGH_CONFIDENCE,
  }
}

export async function recordKbQuery(
  client: ReturnType<typeof createClient>,
  opts: {
    userId: string
    departmentId?: string | null
    query: string
    kbResult: KbSearchResult
    claudeUsed: boolean
  },
): Promise<void> {
  await client
    .from('nova_kb_query_log')
    .insert({
      user_id: opts.userId,
      department_id: opts.departmentId ?? null,
      query: opts.query,
      kb_matched: !!opts.kbResult.match,
      kb_rank: opts.kbResult.match?.rank ?? null,
      kb_confidence: opts.kbResult.match?.confidence ?? null,
      direct_match: opts.kbResult.directMatch,
      claude_used: opts.claudeUsed,
    })
    .catch((e: any) => console.error('nova_kb_query_log write failed:', e.message))
}
