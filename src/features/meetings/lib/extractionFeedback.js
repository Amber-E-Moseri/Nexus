// Pure decision logic for the AI Extract tab's completion feedback (spinner
// -> toast -> tab badge). Factored out so the transition/timestamp logic —
// the part most prone to firing twice, reading a stale value, or getting
// suppressed by an unrelated status collision — is unit-testable without
// Supabase/realtime plumbing. See useExtractionFeedback.js for how this
// wires into real effect timing.

// Decides the one-time toast to fire on a genuine processing -> terminal
// transition. `wasProcessing` must come from the caller's own tracking of
// the previous call's `isProcessing` (see useExtractionFeedback.js) — this
// function has no memory of its own.
export function resolveExtractionToast({ wasProcessing, status, error, activeTab }) {
  const isProcessing = status === 'processing'
  if (!wasProcessing || isProcessing) return { isProcessing, toast: null }
  if (status === 'complete') {
    if (activeTab === 'ai') return { isProcessing, toast: null } // already looking at it
    return { isProcessing, toast: { tone: 'success', message: 'AI extraction finished — review it in the AI Extract tab.' } }
  }
  if (status === 'failed') {
    return { isProcessing, toast: { tone: 'error', message: error || 'AI extraction failed.' } }
  }
  return { isProcessing, toast: null }
}

// Durable (not session-only) "is there a completed result the user hasn't
// looked at yet" check, keyed on the DB's own extraction_completed_at
// timestamp rather than local-only component state.
export function isAiResultUnseen({ status, completedAt, seenCompletedAt }) {
  return status === 'complete' && !!completedAt && completedAt !== seenCompletedAt
}
