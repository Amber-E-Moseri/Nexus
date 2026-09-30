// Client-side participant filters — everything that depends on DERIVED values (readiness, flight status,
// effective visa requirement) or on joined data (tags). DB-column filters stay in fetchParticipants().

import { deriveReadiness, deriveFlightStatus } from './readinessEngine.js'
import { effectiveVisaRequirement, attentionCategoryKeys, documentationActionRequired } from './documentationRules.js'
import { effectivePassportRegion } from './passportRegion.js'
import { effectiveAssistanceRequested } from './cmpDocumentation.js'
import { deriveDocumentationActions } from './documentationRisk.js'
import { matchesAttentionState } from './attentionModel.js'

/** Special tags-filter value: participants with no tags at all. */
export const UNTAGGED = '__untagged__'

const has = (list) => Array.isArray(list) && list.length > 0

/** Tags are matched by name (what the filter stores). `mode` is 'any' (default) or 'all'. */
export function matchesTags(participant, selected, mode = 'any') {
  if (!has(selected)) return true
  const names = new Set((participant.tags || []).map((t) => t.name))
  const wantsUntagged = selected.includes(UNTAGGED)
  const wanted = selected.filter((s) => s !== UNTAGGED)
  if (mode === 'all') {
    if (wantsUntagged && names.size > 0) return false
    return wanted.every((n) => names.has(n))
  }
  if (wantsUntagged && names.size === 0) return true
  return wanted.some((n) => names.has(n))
}

/** How many participants fall in each attention category (people marked Not Attending are never counted). */
export function countAttentionCategories(participants = []) {
  const counts = new Map()
  for (const p of participants) {
    for (const key of attentionCategoryKeys(p)) counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

/**
 * ctx = { targets, now } feeds the time-risk filter (targets come from the event's Settings > Deadlines).
 */
export function applyClientFilters(participants, filters = {}, ctx = {}) {
  let rows = participants || []
  if (has(filters.attention)) {
    rows = rows.filter((p) => {
      const keys = attentionCategoryKeys(p)
      return filters.attention.some((k) => keys.includes(k))
    })
  }
  if (has(filters.readiness)) {
    rows = rows.filter((p) => filters.readiness.includes(deriveReadiness(p).readiness))
  }
  if (has(filters.flight_status)) {
    rows = rows.filter((p) => filters.flight_status.includes(deriveFlightStatus(p)))
  }
  if (has(filters.visa_requirement)) {
    rows = rows.filter((p) => filters.visa_requirement.includes(effectiveVisaRequirement(p)))
  }
  if (has(filters.attention_state)) {
    rows = rows.filter((p) => filters.attention_state.some((state) => matchesAttentionState(p, state)))
  }
  if (has(filters.passport_region)) {
    rows = rows.filter((p) => filters.passport_region.includes(effectivePassportRegion(p)))
  }
  if (has(filters.assistance)) {
    rows = rows.filter((p) => effectiveAssistanceRequested(p) === true)
  }
  if (has(filters.time_risk)) {
    rows = rows.filter((p) => filters.time_risk.includes(deriveDocumentationActions(p, ctx).worst))
  }
  if (has(filters.documentation)) {
    rows = rows.filter((p) => filters.documentation.some((k) => (
      k === 'action_required' ? documentationActionRequired(p) : attentionCategoryKeys(p).includes(k)
    )))
  }
  if (has(filters.tags)) {
    rows = rows.filter((p) => matchesTags(p, filters.tags, filters.tags_mode))
  }
  return rows
}
