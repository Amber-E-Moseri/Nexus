// "Flight Not Required": some participants are already in Nigeria (e.g. they attended another event first) and
// legitimately have no ICPLC flight. That is a recorded exception, distinct from a missing flight:
//   flight expected + none       -> needs attention
//   flight explicitly not needed -> no missing-flight reason
//   flight submitted             -> the normal flight workflow (the exception no longer matters)
// Nothing is fabricated: no itinerary and no flight record is ever created for these people.
// It says nothing about registration, which can never be waived.

export const FLIGHT_NOT_REQUIRED_REASONS = [
  { value: 'already_in_nigeria', label: 'Already in Nigeria' },
  { value: 'other', label: 'Other (explain in the note)' },
]

/** Reason values are open-ended, so an unknown one is still shown sensibly. */
export function flightNotRequiredReasonLabel(reason) {
  if (!reason) return ''
  const known = FLIGHT_NOT_REQUIRED_REASONS.find((r) => r.value === reason)
  if (known) return known.label
  const text = String(reason).replace(/_/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function hasFlightData(p) {
  return !!(p?.arrival_flight || p?.arrival_date || p?.departure_flight || p?.departure_date)
}

/** True when staff recorded that no ICPLC flight is needed AND none has been submitted. */
export function flightNotRequired(p) {
  return !!p?.flight_not_required_reason && !hasFlightData(p)
}

/** The recorded exception (reason, note, who, when), or null. */
export function flightNotRequiredInfo(p) {
  if (!p?.flight_not_required_reason) return null
  return {
    reason: p.flight_not_required_reason,
    label: flightNotRequiredReasonLabel(p.flight_not_required_reason),
    note: p.flight_not_required_note || null,
    by: p.flight_not_required_by || null,
    at: p.flight_not_required_at || null,
    superseded: hasFlightData(p), // a flight was submitted after all: the normal workflow applies
  }
}

/**
 * A meaningful real flight: at least one flight number was recorded (arrival or departure).
 * Dates alone are not canonical attendance evidence; a flight number is the meaningful signal.
 */
export function hasMeaningfulFlight(p) {
  return !!(p?.arrival_flight || p?.departure_flight)
}

/**
 * Derived attendance evidence from flight data or FNR. Never persisted; never mutates participation.
 *
 * Attendance evidence: meaningful flight number OR Flight Not Required (FNR).
 * Conflicts are not auto-resolved; staff must decide.
 *
 * Rules:
 *   confirmed + evidence  -> null (Confirmed is stronger; suppress the derived badge)
 *   not_attending + flight -> ONE attendance conflict (not separate warnings)
 *   not_attending + FNR    -> ONE attendance conflict
 *   any other + evidence   -> positive attendance evidence (likely attending)
 *   no evidence            -> null
 *
 * @param {object} p - icplc_participants row
 * @returns {{ type: 'evidence' | 'conflict', label: string } | null}
 */
export function attendanceEvidence(p) {
  const hasFlight = hasMeaningfulFlight(p)
  const hasFNR = flightNotRequired(p)
  const hasEvidence = hasFlight || hasFNR

  // No attendance evidence of any kind
  if (!hasEvidence) return null

  // Confirmed outranks any derived evidence
  if (p?.participation_status === 'confirmed') return null

  // Explicit Absent + evidence = conflict (consolidate into one warning)
  if (p?.participation_status === 'not_attending') {
    const evidenceList = []
    if (hasFlight) evidenceList.push('flight')
    if (hasFNR) evidenceList.push('FNR')
    const evidencePhrase = evidenceList.join(' and ')
    return {
      type: 'conflict',
      label: `Attendance conflict — ${evidencePhrase} recorded, but status is Not Attending`,
    }
  }

  // Explicit Uncertain: evidence exists but does not promote (staff reviewing)
  if (p?.participation_status === 'uncertain') {
    const evidenceLabel = hasFlight ? 'Flight received' : 'Flight not required'
    return { type: 'evidence', label: evidenceLabel }
  }

  // Tracking, Likely: positive evidence
  const evidenceLabel = hasFlight ? 'Flight received' : 'Flight not required'
  return { type: 'evidence', label: evidenceLabel }
}

/**
 * Whether a participant should appear in the default Travel workspace.
 * FNR with no flight data means no travel action is needed.
 * Absent participants are never travel-relevant.
 *
 * @param {object} p
 * @returns {boolean}
 */
export function isTravelRelevant(p) {
  if (p?.participation_status === 'not_attending') return false
  if (flightNotRequired(p)) return false
  return true
}

/**
 * Partition a set of participant IDs into eligible (for bulk FNR) vs skipped.
 *
 * A participant is eligible only if:
 *   - no existing flight/travel data (hasFlightData = false), AND
 *   - persisted participation_status is not 'not_attending'
 *
 * Used by both BulkActionBar (client pre-filter) and useBulkFlightNotRequired (server re-check)
 * to guarantee one canonical eligibility rule across both layers.
 *
 * @param {string[]} ids - IDs to evaluate
 * @param {Map<string, object>} existingRows - id → participant row (must include all hasFlightData fields + participation_status)
 * @returns {{ eligible: string[], skippedFlight: number, skippedNotAttending: number }}
 */
export function partitionFNREligibility(ids, existingRows) {
  let skippedFlight = 0
  let skippedNotAttending = 0
  const eligible = []
  for (const id of ids) {
    const row = existingRows.get(id)
    if (!row) continue
    if (hasFlightData(row)) { skippedFlight += 1; continue }
    if (row.participation_status === 'not_attending') { skippedNotAttending += 1; continue }
    eligible.push(id)
  }
  return { eligible, skippedFlight, skippedNotAttending }
}
