// Documentation time risk and follow-up actions for ICPLC participants. Derived on read, never stored.
//
// Nexus MONITORS readiness here. ICPLC does not renew passports or Canadian immigration documents, so passport
// and Canadian-document items are risk/review indicators (participant action or staff review). The active
// assistance workflow is the Nigerian visa; target dates only rank follow-up, they never change readiness and
// never make anyone Blocked. Registration and flight-booking deadlines play no part here at all.

import { effectiveVisaRequirement, isCommitted, CANADIAN_DOCS_REVIEW_REASON } from './documentationRules.js'
import { canadianDocSelfReport, effectiveAssistanceRequested } from './cmpDocumentation.js'

export const DUE_SOON_DAYS = 14

export const RISK = { OVERDUE: 'overdue', DUE_SOON: 'due_soon', REVIEW: 'review', ON_TRACK: 'on_track' }
export const RISK_LABELS = { overdue: 'Overdue', due_soon: 'Due soon', review: 'Needs review', on_track: 'On track' }

// Who has to do something
export const ACTION_KIND = { PARTICIPANT: 'participant', TEAM: 'team', REVIEW: 'review' }
export const ACTION_KIND_LABELS = { participant: 'Participant action', team: 'ICPLC team action', review: 'Review needed' }

const RISK_ORDER = { overdue: 3, due_soon: 2, review: 1, on_track: 0 }

/** Read the two target dates the risk model uses from event_configs.tab_config.icplc_deadlines. */
export function readTargets(tabConfig) {
  const d = tabConfig?.icplc_deadlines || {}
  return { visaTarget: d.visa_target_date || null, passportTarget: d.passport_ready_target || null }
}

function dayNumber(dateLike) {
  if (!dateLike) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateLike))
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(dateLike)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor(d.getTime() / 86_400_000)
}

/** Whole days from `now` (local calendar date) to a YYYY-MM-DD target. Negative once it has passed. */
export function daysUntil(target, now = new Date()) {
  const t = dayNumber(target)
  if (t == null) return null
  const today = dayNumber(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
  return t - today
}

/** { level, days } for a target date, or null when no target is set. */
export function riskForTarget(target, now = new Date()) {
  const days = daysUntil(target, now)
  if (days == null) return null
  if (days < 0) return { level: RISK.OVERDUE, days }
  if (days <= DUE_SOON_DAYS) return { level: RISK.DUE_SOON, days }
  return { level: RISK.ON_TRACK, days }
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

function targetPhrase(risk, targetName) {
  if (!risk) return ''
  if (risk.days < 0) return `target passed ${plural(-risk.days, 'day')} ago`
  if (risk.days === 0) return `${targetName} is today`
  return `${plural(risk.days, 'day')} to ${targetName}`
}

const PASSPORT_PROGRESS = {
  renewal_in_progress: 'Passport renewal in progress',
  renewal_needed: 'Passport renewal needed',
  no_passport: 'No valid passport',
}

/**
 * Follow-up items for one participant.
 * @returns {{ items: Array<{id, kind, dimension, level: string|null, text: string}>, worst: string|null,
 *            assistance: boolean, priority: number }}
 */
export function deriveDocumentationActions(p, { targets = {}, now = new Date() } = {}) {
  const empty = { items: [], worst: null, assistance: false, priority: 0 }
  if (!p || p.participation_status === 'not_attending') return empty

  const items = []
  const visaRequirement = effectiveVisaRequirement(p)
  const visaMatters = visaRequirement !== 'not_required'

  // Passport: a prerequisite for the visa. The participant obtains it; we only watch the timeline.
  const passport = p.passport_readiness || 'unknown'
  if (PASSPORT_PROGRESS[passport]) {
    const risk = visaMatters ? riskForTarget(targets.passportTarget, now) : null
    const timing = risk
      ? ` — ${targetPhrase(risk, 'passport-ready target')}${risk.level === RISK.OVERDUE ? ', may delay visa processing' : ''}`
      : ''
    items.push({
      id: 'passport', kind: ACTION_KIND.PARTICIPANT, dimension: 'passport', level: risk?.level ?? null,
      text: `${PASSPORT_PROGRESS[passport]} — participant must obtain a valid passport${timing}`,
    })
  } else if (passport === 'unsure') {
    items.push({ id: 'passport', kind: ACTION_KIND.REVIEW, dimension: 'passport', level: RISK.REVIEW, text: 'Passport status unsure — confirm with the participant' })
  } else if (passport === 'issue') {
    items.push({ id: 'passport', kind: ACTION_KIND.REVIEW, dimension: 'passport', level: RISK.REVIEW, text: 'Passport issue flagged — review' })
  } else if (passport === 'unknown' && isCommitted(p)) {
    items.push({ id: 'passport', kind: ACTION_KIND.REVIEW, dimension: 'passport', level: RISK.REVIEW, text: 'Passport status unknown — confirm with the participant' })
  }

  // Canadian documents: a self-reported concern only. Which document, and whether it lapsed, is unknown.
  if (canadianDocSelfReport(p).concern) {
    items.push({ id: 'canadian_docs', kind: ACTION_KIND.REVIEW, dimension: 'canadian', level: RISK.REVIEW, text: `${CANADIAN_DOCS_REVIEW_REASON} (self-reported)` })
  }

  // Nigerian visa: the workflow the ICPLC team actively assists with.
  const process = p.visa_process_status || 'not_started'
  if (visaRequirement === 'review' && isCommitted(p)) {
    items.push({ id: 'visa', kind: ACTION_KIND.REVIEW, dimension: 'visa', level: RISK.REVIEW, text: 'Visa requirement not yet determined — needs review' })
  } else if (visaRequirement === 'required') {
    if (process === 'issue') {
      items.push({ id: 'visa', kind: ACTION_KIND.TEAM, dimension: 'visa', level: RISK.REVIEW, text: 'Visa issue — team follow-up required' })
    } else if (process === 'not_started' || process === 'in_progress') {
      const risk = riskForTarget(targets.visaTarget, now)
      let text
      if (risk?.level === RISK.OVERDUE) text = `Visa not submitted — ${targetPhrase(risk, 'visa target')}`
      else text = `Visa ${process === 'in_progress' ? 'in progress' : 'not started'}${risk ? ` — ${targetPhrase(risk, 'visa target')}` : ''}`
      items.push({ id: 'visa', kind: ACTION_KIND.TEAM, dimension: 'visa', level: risk?.level ?? null, text })
    }
    // submitted / processing / approved / not_applicable: nothing for staff to chase from the target date.
  }

  // Assistance: a queue flag, independent of readiness.
  const assistance = effectiveAssistanceRequested(p) === true
  if (assistance) {
    items.push({ id: 'assistance', kind: ACTION_KIND.TEAM, dimension: 'visa', level: null, text: 'Visa / travel documentation assistance requested — team follow-up required' })
  }

  let worst = null
  for (const it of items) {
    if (it.level && (worst === null || RISK_ORDER[it.level] > RISK_ORDER[worst])) worst = it.level
  }

  return { items, worst, assistance, priority: followUpPriority(items, assistance) }
}

const LEVEL_SCORE = { overdue: 100, due_soon: 70, review: 30, on_track: 5 }

function followUpPriority(items, assistance) {
  let best = 0
  for (const it of items) {
    let s = it.level ? LEVEL_SCORE[it.level] : 0
    if (it.dimension === 'visa' && it.kind === ACTION_KIND.TEAM && it.level === RISK.REVIEW) s = 90 // visa issue
    if (it.dimension === 'passport' && s > 0) s -= 10 // the visa comes first
    best = Math.max(best, s)
  }
  return best + (assistance ? 15 : 0)
}

/** People to chase first: highest priority first, name as tiebreak. Only people with something to follow up. */
export function followUpFirst(participants, ctx, limit = 5) {
  return (participants || [])
    .map((p) => ({ p, ...deriveDocumentationActions(p, ctx) }))
    .filter((r) => r.priority > 0)
    .sort((a, b) => b.priority - a.priority || (a.p.full_name || '').localeCompare(b.p.full_name || ''))
    .slice(0, limit)
}
