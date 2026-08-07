// Nova request/response validation.
// Lightweight validation without external dependencies (no Zod in Deno edge functions).

export const KNOWN_INTENTS = [
  'daily_brief',
  'ask',
  'meeting_prep',
  'meeting_extract',
  'project_analysis',
  'report',
] as const

export type NovaIntent = (typeof KNOWN_INTENTS)[number]

export function isKnownIntent(value: unknown): value is NovaIntent {
  return typeof value === 'string' && (KNOWN_INTENTS as readonly string[]).includes(value)
}

export interface NovaOrchestrateRequest {
  intent?: NovaIntent
  message: string
  context?: {
    meetingId?: string
    sprintId?: string
    departmentId?: string
    reportType?: string
  }
}

export function validateOrchestrateRequest(body: unknown): NovaOrchestrateRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>

  const message = typeof b.message === 'string' ? b.message.trim() : ''
  if (!message) return null
  if (message.length > 2000) return null

  const intent = isKnownIntent(b.intent) ? b.intent : undefined

  let context: NovaOrchestrateRequest['context'] = undefined
  if (b.context && typeof b.context === 'object') {
    const c = b.context as Record<string, unknown>
    context = {
      meetingId: typeof c.meetingId === 'string' ? c.meetingId : undefined,
      sprintId: typeof c.sprintId === 'string' ? c.sprintId : undefined,
      departmentId: typeof c.departmentId === 'string' ? c.departmentId : undefined,
      reportType: typeof c.reportType === 'string' ? c.reportType : undefined,
      flagId: typeof c.flagId === 'string' ? c.flagId : undefined,
    }
  }

  return { intent, message, context }
}

export interface NovaRiskSignal {
  code: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  entityType: string
  entityId: string
  entityLabel: string
  evidenceIds: string[]
  detectedAt: string
}
