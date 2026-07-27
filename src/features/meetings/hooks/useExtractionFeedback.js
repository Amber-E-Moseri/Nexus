import { useEffect, useRef, useState } from 'react'
import { resolveExtractionToast, isAiResultUnseen } from '../lib/extractionFeedback'
import { CACHE_KEYS, getItemSafe, setItemSafe } from '../../../lib/cacheUtils'

// Wires extractionFeedback.js's pure decision functions up to real effect
// timing (ref sync via effect, not render-body mutation; localStorage
// persistence) — isolated from MeetingDetailView.jsx's own render tree so
// it's mountable on its own via renderHook in tests.
export function useExtractionFeedback({ meetingId, activeTab, status, error, completedAt, showToast, setAiExtracting, setAiError }) {
  // Ref synced via its own effect, not written during render. main.jsx:14
  // confirms this app runs under <React.StrictMode>, which double-invokes
  // the initial mount's render body (dev-only) without committing the first
  // pass — mutating a ref inside render is exactly what that guards
  // against, so the sync goes through an effect instead.
  const activeTabRef = useRef(activeTab)
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  const prevExtractingRef = useRef(false)

  // Reset on meetingId change. This page already reuses the same mounted
  // instance across meetings — MeetingDetailView.jsx:189 refetches on
  // meetingId change rather than relying on remount — so without this,
  // navigating away from a meeting mid-extraction into one that's already
  // 'complete' would leave prevExtractingRef.current === true from the OLD
  // meeting, and the very next status-effect run would read that stale
  // `true` as "was processing," misfiring a completion toast for a meeting
  // whose extraction the user never watched finish.
  //
  // Effect ordering matters here and is relied on: this effect is declared
  // before the status effect below, so on a render where both meetingId
  // and status change together, React runs this one first (per-component
  // effects fire in declaration order for a given commit).
  //
  // Derives aiExtracting/aiError/prevExtractingRef from the new meeting's
  // *current* status/error — deliberately not a blind reset to false/''.
  // Two cases:
  //  - status's value differs across the switch (e.g. A was 'processing',
  //    B is already 'complete'): the status effect's own [status, error]
  //    deps also changed, so it fires immediately after this one in the
  //    same commit and recomputes everything fresh anyway — this effect's
  //    output here is immediately superseded, and reading wasProcessing as
  //    (status === 'processing') for B ('complete' -> false) is what makes
  //    that follow-up run correctly suppress a phantom toast for a
  //    transition that isn't really B's.
  //  - status's value happens to be the SAME string across the switch
  //    (e.g. both A and B are genuinely, independently 'processing' at
  //    that moment): [status, error] does NOT change value, so the status
  //    effect does not re-run at all — whatever this effect sets is what
  //    persists until B's own real transition. A blind `false` here would
  //    leave the spinner/badge stuck showing "not extracting" for a
  //    meeting that genuinely is, until it eventually completes. Also,
  //    were prevExtractingRef hardcoded to false in this branch, B's real
  //    eventual processing -> complete transition would then read
  //    wasProcessing: false and silently swallow B's own legitimate
  //    completion toast. Deriving from current status handles both cases
  //    with one formula instead of two.
  //
  // status/error deliberately omitted from the dependency array: this
  // effect's purpose is to snapshot the new meeting's state at the moment
  // of the meetingId switch, not to re-run on every later status change —
  // that's the status effect's job.
  useEffect(() => {
    const isProcessing = status === 'processing'
    prevExtractingRef.current = isProcessing
    setAiExtracting(isProcessing)
    setAiError(status === 'failed' ? (error || 'AI extraction failed.') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId])

  // showToast/setAiExtracting/setAiError intentionally omitted from deps:
  // showToast is useCallback(..., [dismissToast]) where dismissToast is
  // itself useCallback(..., []) (ToastContext.jsx) — stable for the
  // lifetime of ToastProvider. setAiExtracting/setAiError are plain
  // useState setters, whose identity React guarantees is stable across
  // re-renders. meetingId is intentionally omitted too: it's handled by
  // the reset effect above, not this one.
  useEffect(() => {
    const { isProcessing, toast } = resolveExtractionToast({
      wasProcessing: prevExtractingRef.current,
      status, error, activeTab: activeTabRef.current,
    })
    setAiExtracting(isProcessing)
    if (status === 'failed') setAiError(error || 'AI extraction failed.')
    else if (status === 'complete') setAiError('')
    if (toast) showToast(toast.message, { tone: toast.tone })
    prevExtractingRef.current = isProcessing // unconditional — see idempotency note in extractionFeedback.js
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, error])

  // Lazy init = synchronous localStorage read on first render, so a
  // reopened already-completed meeting never has a tick where
  // isAiResultUnseen computes against a null seenCompletedAt and flashes
  // the badge on before flipping off.
  const [seenCompletedAt, setSeenCompletedAt] = useState(() => getItemSafe(CACHE_KEYS.AI_EXTRACT_SEEN_AT(meetingId)))
  // Resync if meetingId changes on an already-mounted instance — lazy
  // useState only runs once at true mount, so this covers the case the
  // lazy init can't. There's a one-render window after meetingId changes
  // where seenCompletedAt still reflects the previous meeting — this
  // mirrors useExtractionStatus's own state not resetting synchronously on
  // meetingId change either (useExtractionStatus.js:27-32), only
  // refetching, so both data sources go stale-then-correct together.
  useEffect(() => {
    setSeenCompletedAt(getItemSafe(CACHE_KEYS.AI_EXTRACT_SEEN_AT(meetingId)))
  }, [meetingId])
  useEffect(() => {
    if (activeTab === 'ai' && completedAt && completedAt !== seenCompletedAt) {
      setSeenCompletedAt(completedAt)
      setItemSafe(CACHE_KEYS.AI_EXTRACT_SEEN_AT(meetingId), completedAt)
    }
  }, [activeTab, completedAt, meetingId, seenCompletedAt])

  return { unseen: isAiResultUnseen({ status, completedAt, seenCompletedAt }) }
}
