import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// Tracks a meeting's AI-extraction bookkeeping columns and stays live via a
// postgres_changes subscription, so a result lands whenever the edge
// function finishes writing it — regardless of whether this is the
// component that kicked off the extraction, or the user navigated away and
// came back. Self-contained (own fetch + own subscription) so it doesn't
// depend on the parent's own fetch timing.
export function useExtractionStatus(meetingId) {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [completedAt, setCompletedAt] = useState(null)

  useEffect(() => {
    if (!meetingId) return
    let cancelled = false

    supabase
      .from('meetings')
      .select('extraction_status, extraction_result, extraction_error, extraction_completed_at')
      .eq('id', meetingId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return
        setStatus(data.extraction_status ?? 'idle')
        setResult(data.extraction_result ?? null)
        setError(data.extraction_error ?? null)
        setCompletedAt(data.extraction_completed_at ?? null)
      })

    const channel = supabase
      .channel(`meeting-extraction:${meetingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meetings', filter: `id=eq.${meetingId}` },
        (payload) => {
          const row = payload.new
          setStatus(row.extraction_status ?? 'idle')
          setResult(row.extraction_result ?? null)
          setError(row.extraction_error ?? null)
          setCompletedAt(row.extraction_completed_at ?? null)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [meetingId])

  return { status, result, error, completedAt, setStatus }
}
