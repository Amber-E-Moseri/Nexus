// Derived readiness signals for ICPLC participants.
// NOTHING here is persisted — all values are computed on read from the participant row.
// Readiness enum: unknown | waiting_itinerary | in_progress | action_required | blocked | ready
// CRITICAL is explicitly deferred until deadline configuration exists.

import { DOCUMENT_READINESS } from '../../registration/icplcDocReadiness.js'
import { effectiveCanadaDocReadiness } from './cmpDocumentation.js'
import { isCommitted, effectiveVisaRequirement, canadianDocAttention } from './documentationRules.js'
import { flightNotRequired } from './flightRequirement.js'

/**
 * Derives whether a participant has itinerary data.
 * @param {object} p - icplc_participants row
 * @returns {'received' | 'missing'}
 */
export function deriveItineraryStatus(p) {
  return (p.arrival_flight || p.arrival_date) ? 'received' : 'missing'
}

/**
 * Confirmed for counting purposes: staff-marked `confirmed`, or derived Ready
 * (documents cleared + itinerary received). Never persisted; not_attending is excluded.
 * @param {object} p
 * @returns {boolean}
 */
export function isConfirmedOrReady(p) {
  if (p.participation_status === 'not_attending') return false
  return p.participation_status === 'confirmed' || deriveReadiness(p).readiness === 'ready'
}

/**
 * Derives whether a participant's travel arrangements are complete.
 * @param {object} p
 * @returns {'ready' | 'outstanding'}
 */
export function deriveTravelStatus(p) {
  if (flightNotRequired(p)) return 'ready'
  return deriveItineraryStatus(p) === 'received' && p.arrival_date && p.departure_date
    ? 'ready'
    : 'outstanding'
}

/** Itinerary is settled when one was received, or staff recorded that no flight is required (nothing is invented). */
export function isItinerarySettled(p) {
  return deriveItineraryStatus(p) === 'received' || flightNotRequired(p)
}

/**
 * Derives the operational readiness of a participant.
 *
 * Enum: unknown | waiting_itinerary | in_progress | action_required | blocked | ready
 * Do NOT add 'critical' — it is not implemented in V1 and must not appear
 * in filters, chips, or database queries until deadline configuration is built.
 *
 * @param {object} p - icplc_participants row
 * @returns {{ readiness: string, reasons: string[] }}
 */
export function deriveReadiness(p) {
  const reasons = []
  // ECOWAS passport + unassessed visa => not required (explicit staff values still win).
  const visaRequirement = effectiveVisaRequirement(p)

  // BLOCKED — hard blocker: passport problem AND visa is required
  if (
    ['renewal_needed', 'renewal_in_progress', 'no_passport', 'issue'].includes(p.passport_readiness) &&
    visaRequirement === 'required'
  ) {
    reasons.push('Passport issue blocks visa process')
    return { readiness: 'blocked', reasons }
  }

  // ACTION_REQUIRED checks (accumulate reasons)
  if (p.passport_readiness !== 'unknown' && p.passport_readiness !== 'ready') {
    reasons.push('Passport action needed')
  }
  if (visaRequirement === 'required' && p.visa_process_status === 'not_started') {
    reasons.push('Visa required but not started')
  }
  // Readiness derives from participant DATA only. A staff "Mark reviewed" never changes it; it only changes
  // whether staff still need to follow up (see attentionModel.attentionReasons).
  if (visaRequirement === 'review' && isCommitted(p)) {
    reasons.push('Visa requirement unknown')
  }
  if (p.visa_process_status === 'issue') {
    reasons.push('Visa issue')
  }
  if (['issue', 'not_registered'].includes(p.registration_status)) {
    reasons.push('Registration outstanding')
  }
  const canadianDocReason = canadianDocAttention(p)
  if (canadianDocReason) {
    reasons.push(canadianDocReason)
  }
  if (deriveItineraryStatus(p) === 'missing' && p.participation_status === 'confirmed' && !flightNotRequired(p)) {
    reasons.push('Itinerary missing for confirmed participant')
  }

  if (reasons.length > 0) return { readiness: 'action_required', reasons }

  // IN_PROGRESS — something is underway but no action currently needed from staff
  if (['in_progress', 'submitted', 'processing'].includes(p.visa_process_status)) {
    return { readiness: 'in_progress', reasons: [] }
  }
  if (effectiveCanadaDocReadiness(p) === DOCUMENT_READINESS.RENEWAL_IN_PROGRESS) {
    return { readiness: 'in_progress', reasons: [] }
  }

  // READY — all critical gates pass
  if (
    p.passport_readiness === 'ready' &&
    visaRequirement !== 'review' &&
    (visaRequirement !== 'required' || p.visa_process_status === 'approved') &&
    isItinerarySettled(p)
  ) {
    return { readiness: 'ready', reasons: [] }
  }

  // WAITING ON ITINERARY — documents are settled, only travel details are missing
  if (
    p.passport_readiness === 'ready' &&
    visaRequirement !== 'review' &&
    (visaRequirement !== 'required' || p.visa_process_status === 'approved')
  ) {
    return { readiness: 'waiting_itinerary', reasons: [] }
  }

  // UNKNOWN — not enough information to determine readiness
  return { readiness: 'unknown', reasons: [] }
}

/**
 * Returns the CSS class / Badge tone for a readiness value.
 * Maps to existing Nexus Badge tones.
 */
export function readinessTone(readiness) {
  switch (readiness) {
    case 'ready':          return 'done'
    case 'in_progress':    return 'in_progress'
    case 'waiting_itinerary': return 'in_progress'
    case 'action_required': return 'at_risk'
    case 'blocked':        return 'blocked'
    default:               return 'mute'    // unknown
  }
}

/**
 * Returns the display label for a readiness value.
 */
export function readinessLabel(readiness) {
  switch (readiness) {
    case 'ready':           return 'Ready'
    case 'in_progress':     return 'In Progress'
    case 'waiting_itinerary': return 'Waiting on itinerary'
    case 'action_required': return 'Action Required'
    case 'blocked':         return 'Blocked'
    default:                return 'Unknown'
  }
}

/**
 * Derives flight booking status for Working List and Travel page.
 * Separate from deriveItineraryStatus() — this is the three-state Working List contract.
 * @param {object} p - icplc_participants row
 * @returns {'booked' | 'missing' | 'awaiting' | 'not_required'}
 */
export function deriveFlightStatus(p) {
  if (p.arrival_flight && p.departure_flight) return 'booked'
  if (flightNotRequired(p)) return 'not_required'
  if (p.participation_status === 'confirmed') return 'missing'
  return 'awaiting'
}

export function flightStatusTone(status) {
  if (status === 'booked') return 'done'
  if (status === 'not_required') return 'mute'
  if (status === 'missing') return 'at_risk'
  return 'mute'
}

export function flightStatusLabel(status) {
  if (status === 'booked') return 'Booked'
  if (status === 'not_required') return 'Not required'
  if (status === 'missing') return 'Missing'
  return 'Awaiting'
}
