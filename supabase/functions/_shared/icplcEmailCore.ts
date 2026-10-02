export const ICPLC_MERGE_TAGS = ['{{name}}', '{{first_name}}', '{{subgroup}}', '{{email}}'] as const

export interface IcplcRecipientVars {
  name?: string | null
  first_name?: string | null
  subgroup?: string | null
  email?: string | null
}

export interface IcplcParticipantInput {
  id: string
  full_name?: string | null
  email?: string | null
  subgroup?: string | null
  participation_status?: string | null
}

export interface ResolvedIcplcRecipient {
  email: string
  normalizedEmail: string
  name: string
  subgroup: string
  participantIds: string[]
}

export interface RecipientResolution {
  requestedParticipants: number
  eligibleParticipants: number
  uniqueRecipients: number
  skippedMissingEmail: number
  skippedInvalidEmail: number
  skippedNotAttending: number
  deduplicatedRecipients: number
  unmatchedParticipantIds: string[]
  recipients: ResolvedIcplcRecipient[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function stripPlain(value: unknown, max = 1000): string {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  return [...raw].map((c) => {
    const code = c.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : c
  }).join('').trim().slice(0, max)
}

export function normalizeEmail(email: unknown): string {
  return stripPlain(email, 320).toLowerCase()
}

export function isValidEmail(email: unknown): boolean {
  return EMAIL_RE.test(normalizeEmail(email))
}

export function firstNameOf(name: unknown): string {
  return stripPlain(name, 160).split(/\s+/).filter(Boolean)[0] ?? ''
}

export function replaceMergeTags(template: string, vars: IcplcRecipientVars = {}): string {
  const name = stripPlain(vars.name, 160)
  const values: Record<string, string> = {
    name,
    first_name: stripPlain(vars.first_name, 80) || firstNameOf(name),
    subgroup: stripPlain(vars.subgroup, 120),
    email: stripPlain(vars.email, 320),
  }

  return String(template ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key) => {
    const normalizedKey = String(key).toLowerCase()
    return Object.prototype.hasOwnProperty.call(values, normalizedKey) ? values[normalizedKey] : ''
  })
}

function linkifyEscaped(text: string): string {
  let output = ''
  let lastIndex = 0
  for (const match of text.matchAll(URL_RE)) {
    const rawUrl = match[0]
    const index = match.index ?? 0
    output += escapeHtml(text.slice(lastIndex, index))
    let url = rawUrl
    let tail = ''
    while (/[),.;!?]$/.test(url)) {
      tail = url.slice(-1) + tail
      url = url.slice(0, -1)
    }
    try {
      const parsed = new URL(url)
      if (['http:', 'https:'].includes(parsed.protocol)) {
        const safeUrl = escapeHtml(parsed.toString())
        output += `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(tail)}`
      } else {
        output += escapeHtml(rawUrl)
      }
    } catch {
      output += escapeHtml(rawUrl)
    }
    lastIndex = index + rawUrl.length
  }
  output += escapeHtml(text.slice(lastIndex))
  return output
}

function formatInline(line: string): string {
  return linkifyEscaped(line).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

export function renderFormattedBody(body: string, vars: IcplcRecipientVars = {}): string {
  const merged = replaceMergeTags(String(body ?? ''), vars).replace(/\r\n/g, '\n')
  return merged
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${formatInline(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export function renderIcplcEmailHtml(body: string, vars: IcplcRecipientVars, options: { isTest?: boolean } = {}): string {
  const bodyHtml = renderFormattedBody(body, vars)
  const year = new Date().getFullYear()
  const testBanner = options.isTest
    ? '<div style="padding:10px 16px;background:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;text-align:center;">TEST SEND</div>'
    : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>body{margin:0;background:#f8fafc;color:#111827;font-family:Arial,sans-serif;line-height:1.6}.wrap{max-width:640px;margin:0 auto;background:#fff}.head{padding:20px;text-align:center;border-bottom:1px solid #e5e7eb}.body{padding:24px;font-size:14px}.body p{margin:0 0 16px}.body a{color:#4c2a92}.foot{padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:11px;text-align:center}</style>
</head><body><div class="wrap">${testBanner}<div class="head"><img src="https://nexus.lwcanada.org/blw-canada-logo.png" alt="BLW Canada" width="96" height="96" style="display:block;margin:0 auto;"></div><div class="body">${bodyHtml}</div><div class="foot">ICPLC 2026 - BLW Canada Sub-Region - ${year}</div></div></body></html>`
}

export function personalizeSubject(subject: string, vars: IcplcRecipientVars): string {
  return stripPlain(replaceMergeTags(subject, vars), 200)
}

export function resolveRecipients(participantIds: string[], participants: IcplcParticipantInput[]): RecipientResolution {
  const requested = Array.from(new Set((participantIds ?? []).filter(Boolean)))
  const byId = new Map(participants.map((participant) => [participant.id, participant]))
  const recipients = new Map<string, ResolvedIcplcRecipient>()
  const unmatchedParticipantIds: string[] = []
  let skippedMissingEmail = 0
  let skippedInvalidEmail = 0
  let skippedNotAttending = 0
  let eligibleParticipants = 0
  let deduplicatedParticipants = 0

  for (const id of requested) {
    const participant = byId.get(id)
    if (!participant) {
      unmatchedParticipantIds.push(id)
      continue
    }

    if (participant.participation_status === 'not_attending') {
      skippedNotAttending += 1
      continue
    }

    const normalizedEmail = normalizeEmail(participant.email)
    if (!normalizedEmail) {
      skippedMissingEmail += 1
      continue
    }
    if (!isValidEmail(normalizedEmail)) {
      skippedInvalidEmail += 1
      continue
    }

    eligibleParticipants += 1
    const existing = recipients.get(normalizedEmail)
    if (existing) {
      if (!existing.participantIds.includes(participant.id)) {
        existing.participantIds.push(participant.id)
        deduplicatedParticipants += 1
      }
      continue
    }

    recipients.set(normalizedEmail, {
      email: stripPlain(participant.email, 320),
      normalizedEmail,
      name: stripPlain(participant.full_name, 160) || normalizedEmail,
      subgroup: stripPlain(participant.subgroup, 120),
      participantIds: [participant.id],
    })
  }

  return {
    requestedParticipants: requested.length,
    eligibleParticipants,
    uniqueRecipients: recipients.size,
    skippedMissingEmail,
    skippedInvalidEmail,
    skippedNotAttending,
    deduplicatedRecipients: deduplicatedParticipants,
    unmatchedParticipantIds,
    recipients: Array.from(recipients.values()),
  }
}
