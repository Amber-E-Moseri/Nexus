// Fallback layer for Nova intent handlers.
// Catches NovaApiError with status 429/529 (quota exhausted) and returns
// structured data instead of an error. Never retries — quota is gone for now.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { NovaApiError } from '../../_shared/novaModelRouter.ts'
import type { NovaResponse, NovaSource } from '../../_shared/novaCitations.ts'

export type FallbackMode = 'degraded' | 'offline'
export type FallbackReason = 'no_ai_credits' | 'rate_limit' | 'timeout'

export interface FallbackResponse extends NovaResponse {
  fallbackMode: FallbackMode
  fallbackReason: FallbackReason
}

function isQuotaError(err: unknown): boolean {
  if (err instanceof NovaApiError) {
    return err.status === 429 || err.status === 529
  }
  if (err instanceof Error) {
    return (
      err.message.includes('429') ||
      err.message.includes('529') ||
      err.message.includes('quota') ||
      err.message.includes('overloaded_through_upstream_api_budget') ||
      err.message.includes('insufficient_quota')
    )
  }
  return false
}

const OFFLINE_RESPONSE = (intent: string): FallbackResponse => ({
  answer:
    "Nova's AI layer is temporarily unavailable — you've hit the usage limit. " +
    'Try again in a few minutes, or contact your admin if this persists.',
  sources: [],
  intent,
  fallbackMode: 'offline',
  fallbackReason: 'no_ai_credits',
})

export async function executeIntentWithFallback<T extends NovaResponse>(
  intent: string,
  handler: () => Promise<T>,
  fallbackFn?: () => Promise<FallbackResponse>,
): Promise<T | FallbackResponse> {
  try {
    return await handler()
  } catch (err) {
    if (!isQuotaError(err)) throw err

    console.warn(`nova quota exhausted for intent=${intent}:`, (err as Error).message)

    if (fallbackFn) {
      try {
        return await fallbackFn()
      } catch (fallbackErr) {
        console.error('nova fallback fn also failed:', (fallbackErr as Error).message)
      }
    }

    return OFFLINE_RESPONSE(intent)
  }
}

// ─── Daily Brief fallback ─────────────────────────────────────────────────────
// Returns a structured markdown summary from raw SQL data — no AI needed.

export async function buildBriefFallback(
  client: ReturnType<typeof createClient>,
  userId: string,
  briefData: {
    overdueTasks: any[]
    dueTodayTasks: any[]
    meetings: any[]
    activeSprints: any[]
    pendingRequests: any[]
  },
  sessionId: string | null,
): Promise<FallbackResponse> {
  const { overdueTasks, dueTodayTasks, meetings, activeSprints, pendingRequests } = briefData

  const sources: NovaSource[] = [
    ...overdueTasks.slice(0, 5).map((t: any) => ({
      type: 'task' as const, id: t.id, label: t.title, route: `/tasks/${t.id}`,
    })),
    ...dueTodayTasks.slice(0, 5).map((t: any) => ({
      type: 'task' as const, id: t.id, label: t.title, route: `/tasks/${t.id}`,
    })),
    ...meetings.slice(0, 3).map((m: any) => ({
      type: 'meeting' as const, id: m.id, label: m.title, route: `/meetings/${m.id}`,
    })),
    ...activeSprints.slice(0, 2).map((s: any) => ({
      type: 'sprint' as const, id: s.id, label: s.name, route: `/sprints/${s.id}`,
    })),
  ]

  const lines: string[] = ['**Your Daily Briefing** *(AI synthesis unavailable)*', '']

  if (overdueTasks.length > 0) {
    lines.push(`**Overdue Tasks (${overdueTasks.length})**`)
    for (const t of overdueTasks.slice(0, 5)) {
      lines.push(`- [${t.priority ?? 'medium'}] ${t.title} — due ${t.due_date}`)
    }
    if (overdueTasks.length > 5) lines.push(`  …and ${overdueTasks.length - 5} more`)
    lines.push('')
  }

  if (dueTodayTasks.length > 0) {
    lines.push(`**Due Today (${dueTodayTasks.length})**`)
    for (const t of dueTodayTasks.slice(0, 5)) {
      lines.push(`- ${t.title}`)
    }
    lines.push('')
  }

  if (meetings.length > 0) {
    lines.push(`**Today's Meetings (${meetings.length})**`)
    for (const m of meetings) {
      const time = m.scheduled_start
        ? new Date(m.scheduled_start).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
        : ''
      lines.push(`- ${m.title}${time ? ` at ${time}` : ''}`)
    }
    lines.push('')
  }

  if (activeSprints.length > 0) {
    lines.push(`**Active Sprints (${activeSprints.length})**`)
    for (const s of activeSprints) {
      lines.push(`- ${s.name}${s.end_date ? ` — ends ${s.end_date}` : ''}`)
    }
    lines.push('')
  }

  if (pendingRequests.length > 0) {
    lines.push(`**Pending Actions (${pendingRequests.length})**`)
    for (const r of pendingRequests) {
      lines.push(`- ${r.summary ?? 'Pending request'}`)
    }
    lines.push('')
  }

  if (
    overdueTasks.length === 0 &&
    dueTodayTasks.length === 0 &&
    meetings.length === 0 &&
    activeSprints.length === 0
  ) {
    lines.push('Nothing urgent on the calendar today.')
  }

  return {
    answer: lines.join('\n').trim(),
    sources,
    intent: 'daily_brief',
    sessionId: sessionId ?? undefined,
    fallbackMode: 'degraded',
    fallbackReason: 'no_ai_credits',
  }
}

// ─── Project Analysis fallback ────────────────────────────────────────────────
// Groups pre-computed risk signals by severity — no AI needed.

export function buildProjectAnalysisFallback(
  signals: Array<{
    code: string
    severity: string
    entityType: string
    entityId: string
    entityLabel: string
  }>,
  sessionId: string | null,
): FallbackResponse {
  const bySeverity: Record<string, typeof signals> = {}
  for (const s of signals) {
    ;(bySeverity[s.severity] ??= []).push(s)
  }

  const order = ['critical', 'high', 'medium', 'low']
  const lines: string[] = ['**Risk Signals Detected** *(AI explanation unavailable)*', '']

  for (const sev of order) {
    const group = bySeverity[sev]
    if (!group?.length) continue
    lines.push(`**${sev.charAt(0).toUpperCase() + sev.slice(1)} (${group.length})**`)
    for (const s of group.slice(0, 4)) {
      lines.push(`- ${s.entityLabel} — ${s.code.replace(/_/g, ' ').toLowerCase()}`)
    }
    if (group.length > 4) lines.push(`  …and ${group.length - 4} more`)
    lines.push('')
  }

  lines.push('Review each signal on the task or sprint page for details.')

  const sources: NovaSource[] = signals
    .filter((s) => s.entityType === 'task')
    .slice(0, 6)
    .map((s) => ({
      type: 'task' as const,
      id: s.entityId,
      label: s.entityLabel,
      route: `/tasks/${s.entityId}`,
      excerpt: `Risk: ${s.code}`,
    }))

  return {
    answer: lines.join('\n').trim(),
    sources,
    intent: 'project_analysis',
    sessionId: sessionId ?? undefined,
    fallbackMode: 'degraded',
    fallbackReason: 'no_ai_credits',
  }
}

// ─── Ask Nexus fallback ───────────────────────────────────────────────────────
// Returns a simple "here are related records" response when Claude is down.

export function buildAskFallback(
  relatedSources: NovaSource[],
  sessionId: string | null,
): FallbackResponse {
  const answer =
    relatedSources.length > 0
      ? 'AI synthesis is unavailable right now. Here are the most relevant records — tap any to open it.'
      : "AI synthesis is unavailable and I couldn't find matching records. " +
        'Try asking your regional secretary, or check back in a few minutes.'

  return {
    answer,
    sources: relatedSources,
    intent: 'ask',
    sessionId: sessionId ?? undefined,
    fallbackMode: relatedSources.length > 0 ? 'degraded' : 'offline',
    fallbackReason: 'no_ai_credits',
  }
}
