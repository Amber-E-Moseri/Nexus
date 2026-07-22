// Shared helper for turning a raw extract-meeting-data result into UI state,
// factored out of the two independent review UIs (AudioTranscriptionPanel's
// TranscriptCard and MeetingDetailView's AI Extract tab) that both
// duplicated this exact logic. Full consolidation of those two UIs is
// deliberately deferred (different UX: live streaming card vs. tab review) —
// this only extracts the piece that was byte-for-byte identical.

// Open items above this confidence are pre-checked for the user in the
// review UI; below it, the user has to opt in manually.
const OPEN_ITEM_AUTO_SELECT_THRESHOLD = 0.8

export function autoSelectOpenItems(openItems) {
  const selected = new Set()
  ;(openItems ?? []).forEach((item, i) => {
    if ((item.confidence_score ?? 0) >= OPEN_ITEM_AUTO_SELECT_THRESHOLD) selected.add(i)
  })
  return selected
}
