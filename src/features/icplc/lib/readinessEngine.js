// Derived readiness signals for ICPLC participants.
// NOTHING here is persisted — all values are computed on read from the participant row.
// V1 readiness enum: unknown | in_progress | action_required | blocked | ready
// CRITICAL is explicitly deferred until deadline configuration exists.

/**
 * Derives whether a participant has itinerary data.
 * @param {object} p - icplc_participants row
 * @returns {'received' | 'missing'}
 */
export function deriveItineraryStatus(p) {
  return (p.arrival_flight || p.arrival_date) ? 'received' : 'missing'
}

/**
 * Derives whether a participant's travel arrangements are complete.
 * @param {object} p
 * @returns {'ready' | 'outstanding'}
 */
export function deriveTravelStatus(p) {
  return deriveItineraryStatus(p) === 'received' && p.arrival_date && p.departure_date
    ? 'ready'
    : 'outstanding'
}

/**
 * Derives the operational readiness of a participant.
 *
 * V1 enum: unknown | in_progress | action_required | blocked | ready
 * Do NOT add 'critical' — it is not implemented in V1 and must not appear
 * in filters, chips, or database queries until deadline configuration is built.
 *
 * @param {object} p - icplc_participants row
 * @returns {{ readiness: string, reasons: string[] }}
 */
export function deriveReadiness(p) {
  const reasons = []

  // BLOCKED — hard blocker: passport problem AND visa is required
  if (
    ['renewal_needed', 'renewal_in_progress', 'no_passport', 'issue'].includes(p.passport_readiness) &&
    p.visa_requirement === 'required'
  ) {
    reasons.push('Passport issue blocks visa process')
    return { readiness: 'blocked', reasons }
  }

  // ACTION_REQUIRED checks (accumulate reasons)
  if (p.passport_readiness !== 'unknown' && p.passport_readiness !== 'ready') {
    reasons.push('Passport action needed')
  }
  if (p.visa_requirement === 'required' && p.visa_process_status === 'not_started') {
    reasons.push('Visa not started')
  }
  if (p.visa_process_status === 'issue') {
    reasons.push('Visa issue')
  }
  if (['issue', 'not_registered'].includes(p.registration_status)) {
    reasons.push('Registration outstanding')
  }
  if (deriveItineraryStatus(p) === 'missing' && p.participation_status === 'confirmed') {
    reasons.push('Itinerary missing for confirmed participant')
  }

  if (reasons.length > 0) return { readiness: 'action_required', reasons }

  // IN_PROGRESS — something is underway but no action currently needed from staff
  if (['in_progress', 'submitted', 'processing'].includes(p.visa_process_status)) {
    return { readiness: 'in_progress', reasons: [] }
  }

  // READY — all critical gates pass
  if (
    p.passport_readiness === 'ready' &&
    (p.visa_requirement !== 'required' || p.visa_process_status === 'approved') &&
    deriveItineraryStatus(p) === 'received'
  ) {
    return { readiness: 'ready', reasons: [] }
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
    case 'action_required': return 'Action Required'
    case 'blocked':         return 'Blocked'
    default:                return 'Unknown'
  }
}
