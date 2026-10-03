export const ICPLC_MERGE_TAGS = ['{{name}}', '{{first_name}}', '{{subgroup}}', '{{email}}']

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function normalizeEmail(email = '') {
  return String(email ?? '').trim().toLowerCase()
}

export function isValidEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
}

export function firstNameOf(name = '') {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean)[0] || ''
}

export function replaceMergeTags(template = '', vars = {}) {
  const name = String(vars.name ?? '')
  const values = {
    name,
    first_name: String(vars.first_name ?? '') || firstNameOf(name),
    subgroup: String(vars.subgroup ?? ''),
    email: String(vars.email ?? ''),
  }
  return String(template ?? '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key) => values[key.toLowerCase()] ?? '')
}

function linkifyEscaped(text) {
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

function formatInline(line) {
  return linkifyEscaped(line).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

export function renderEmailBody(body = '', vars = {}) {
  const merged = replaceMergeTags(body, vars).replace(/\r\n/g, '\n')
  return merged
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${formatInline(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export function renderEmailHtml(body = '', vars = {}, { isTest = false } = {}) {
  const banner = isTest
    ? '<div style="padding:10px 16px;background:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;text-align:center;">TEST SEND</div>'
    : ''
  return `<div style="max-width:640px;margin:0 auto;background:#fff;color:#111827;font-family:Arial,sans-serif;line-height:1.6;border:1px solid #E5E7EB;">${banner}<div style="padding:18px;text-align:center;border-bottom:1px solid #E5E7EB;"><strong>ICPLC 2026</strong></div><div style="padding:22px;font-size:14px;">${renderEmailBody(body, vars)}</div><div style="padding:14px 22px;border-top:1px solid #E5E7EB;color:#6B7280;font-size:11px;text-align:center;">BLW Canada Sub-Region</div></div>`
}

export function estimateRecipients(participants = []) {
  const seen = new Set()
  const stats = {
    requested: participants.length,
    eligible: 0,
    unique: 0,
    skippedMissing: 0,
    skippedInvalid: 0,
    skippedNotAttending: 0,
    deduped: 0,
  }

  for (const participant of participants) {
    if (participant.participation_status === 'not_attending') {
      stats.skippedNotAttending += 1
      continue
    }
    const email = normalizeEmail(participant.email)
    if (!email) {
      stats.skippedMissing += 1
      continue
    }
    if (!isValidEmail(email)) {
      stats.skippedInvalid += 1
      continue
    }
    stats.eligible += 1
    if (seen.has(email)) {
      stats.deduped += 1
      continue
    }
    seen.add(email)
    stats.unique += 1
  }

  return stats
}
