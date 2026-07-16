import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getRegionalUpdatesList } from '../lib/regionalUpdates'

export function useRegionalUpdatesList() {
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUpdates = async () => {
      setLoading(true)
      try {
        const data = await getRegionalUpdatesList()
        setUpdates(data)
      } catch (error) {
        console.error('Failed to fetch updates list:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUpdates()

    // Realtime subscription — unique topic per mount so simultaneous
    // consumers (e.g. the Sidebar compose widget and the Dashboard past-
    // updates modal) don't collide on Supabase's channel-name dedup, which
    // returns the same already-subscribed instance for a shared topic and
    // throws when a second .on() is added to it.
    const channel = supabase
      .channel(`regional_updates_list:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'regional_updates',
        },
        () => {
          fetchUpdates()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { updates, loading }
}
