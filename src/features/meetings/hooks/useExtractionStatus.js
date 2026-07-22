import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// A run is considered stuck once it's been 'processing' longer than any
// legitimate extraction should take. The edge function bounds each Anthropic
// call to 4 minutes (long transcripts with near-verbatim detailed_notes can
// legitimately take a couple minutes to generate — an earlier, tighter 90s
// bound here started killing real in-progress runs, not just hung ones) —
// this needs headroom above that for multi-chunk fan-out (chunk extraction
// + a follow-up summary-synthesis call) plus DB write latency. This is a
// client-side safety net on top of the server-side fix (extract-meeting-data
// now always persists a terminal status, including on stream stalls/
// timeouts) — it exists specifically for the case the server-side fix can't
// close: the platform killing the edge function process outright (OOM, hard
// wall-clock kill) before it ever gets to run its own catch block. Without
// this, that failure mode left the UI spinning forever with nothing to
// recover from but a raw DB edit.
const STALE_PROCESSING_MS = 8 * 60 * 1000

// Tracks a meeting's AI-extraction bookkeeping columns and stays live via a
// postgres_changes subscription, so a result lands whenever the edge
// function finishes writing it — regardless of whether this is the
// component that kicked off the extraction, or the user navigated away and
// came back. Self-contained (own fetch + own subscription) so it doesn't
// depend on the parent's own fetch timing.
export function useExtractionStatus(meetingId) {
  const [rawStatus, setRawStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [completedAt, setCompletedAt] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!meetingId) return
    let cancelled = false

    supabase
      .from('meetings')
      .select('extraction_status, extraction_result, extraction_error, extraction_completed_at, extraction_started_at')
      .eq('id', meetingId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return
        setRawStatus(data.extraction_status ?? 'idle')
        setResult(data.extraction_result ?? null)
        setError(data.extraction_error ?? null)
        setCompletedAt(data.extraction_completed_at ?? null)
        setStartedAt(data.extraction_started_at ?? null)
        setStale(false)
      })

    const channel = supabase
      .channel(`meeting-extraction:${meetingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meetings', filter: `id=eq.${meetingId}` },
        (payload) => {
          const row = payload.new
          setRawStatus(row.extraction_status ?? 'idle')
          setResult(row.extraction_result ?? null)
          setError(row.extraction_error ?? null)
          setCompletedAt(row.extraction_completed_at ?? null)
          setStartedAt(row.extraction_started_at ?? null)
          setStale(false)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [meetingId])

  // While processing, schedule a one-shot check for whether it's overrun
  // STALE_PROCESSING_MS — nothing else would trigger a re-render at exactly
  // that moment since no new DB write happens for a genuinely stuck run.
  useEffect(() => {
    if (rawStatus !== 'processing' || !startedAt) return
    const elapsed = Date.now() - new Date(startedAt).getTime()
    const remaining = STALE_PROCESSING_MS - elapsed
    if (remaining <= 0) { setStale(true); return }
    const timer = setTimeout(() => setStale(true), remaining)
    return () => clearTimeout(timer)
  }, [rawStatus, startedAt])

  const status = stale && rawStatus === 'processing' ? 'failed' : rawStatus
  const effectiveError = stale && rawStatus === 'processing'
    ? 'Extraction timed out and may not have finished. Please try again.'
    : error

  return { status, result, error: effectiveError, completedAt, setStatus: setRawStatus }
}
