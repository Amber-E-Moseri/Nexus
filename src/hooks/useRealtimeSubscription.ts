import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook to safely manage Supabase real-time subscriptions with automatic cleanup.
 * Prevents memory leaks by ensuring subscriptions are always unsubscribed when the component unmounts.
 *
 * Usage:
 * ```
 * useRealtimeSubscription({
 *   channel: `my-channel-${id}`,
 *   table: 'my_table',
 *   events: ['INSERT', 'UPDATE', 'DELETE'],
 *   filter: `id=eq.${id}`,
 *   onPayload: (payload) => { ... }
 * })
 * ```
 */
export function useRealtimeSubscription({
  channel,
  table,
  events = ['*'],
  filter = null,
  onPayload,
}: {
  channel: string
  table: string
  events?: string[] | '*'
  filter?: string | null
  onPayload: (payload: any) => void
}) {
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!channel || !table || !onPayload) return

    let sub = supabase.channel(channel)

    if (Array.isArray(events)) {
      events.forEach((event) => {
        sub = sub.on(
          'postgres_changes',
          {
            event,
            schema: 'public',
            table,
            ...(filter && { filter }),
          },
          onPayload,
        )
      })
    } else {
      sub = sub.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter && { filter }),
        },
        onPayload,
      )
    }

    const subscription = sub.subscribe()
    subscriptionRef.current = subscription

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current)
        subscriptionRef.current = null
      }
    }
  }, [channel, table, filter, onPayload, events])
}
