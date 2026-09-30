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
