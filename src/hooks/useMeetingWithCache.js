import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook that loads meeting data with:
 * - SessionStorage cache (fast re-navigation)
 * - Realtime subscriptions (live updates across tabs)
 * - Proper error handling + logging
 *
 * Usage:
 *   const { meeting, isLoading } = useMeetingWithCache(meetingId)
 */
export function useMeetingWithCache(meetingId) {
  const [meeting, setMeeting] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!meetingId) return

    // Try sessionStorage first (fast navigation)
    const cached = sessionStorage.getItem(`meeting_${meetingId}`)
    if (cached) {
      try {
        setMeeting(JSON.parse(cached))
        console.log(`[meeting.cache] session_hit meeting_id=${meetingId}`)
      } catch (e) {
        console.warn(`[meeting.cache] session_parse_error meeting_id=${meetingId}`, e)
        sessionStorage.removeItem(`meeting_${meetingId}`)
        setIsLoading(true)
      }
    } else {
      setIsLoading(true)
      console.log(`[meeting.cache] session_miss meeting_id=${meetingId}`)
    }

    // Subscribe to realtime updates on this meeting
    const subscription = supabase
      .channel(`meeting:${meetingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meetings',
          filter: `id=eq.${meetingId}`,
        },
        (payload) => {
          console.log(
            `[meeting.realtime] update meeting_id=${meetingId} event=${payload.eventType}`
          )
          // Clear stale sessionStorage before updating
          sessionStorage.removeItem(`meeting_${meetingId}`)
          setMeeting(payload.new)
        }
      )
      .subscribe(
        (status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[meeting.realtime] subscribed meeting_id=${meetingId}`)
          }
        },
        (error) => {
          console.error(
            `[meeting.realtime] subscription_error meeting_id=${meetingId}`,
            error
          )
          setError(error)
        }
      )

    // Fetch if not in cache
    if (!cached) {
      supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single()
        .then(({ data, error: fetchErr }) => {
          if (fetchErr) {
            console.error(
              `[meeting.cache] fetch_error meeting_id=${meetingId} error="${fetchErr.message}"`
            )
            setError(fetchErr)
            return
          }
          if (data) {
            sessionStorage.setItem(`meeting_${meetingId}`, JSON.stringify(data))
            setMeeting(data)
            console.log(`[meeting.cache] fetched meeting_id=${meetingId}`)
          }
        })
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }

    // Cleanup on unmount
    return () => {
      subscription.unsubscribe()
    }
  }, [meetingId])

  return { meeting, isLoading, error }
}
