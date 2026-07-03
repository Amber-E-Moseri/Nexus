import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getActiveRegionalUpdate } from '../lib/regionalUpdates'

export function useRegionalUpdate() {
  const [update, setUpdate] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial fetch
    const fetchUpdate = async () => {
      setLoading(true)
      try {
        const data = await getActiveRegionalUpdate()
        setUpdate(data)
      } catch (error) {
        console.error('Failed to fetch regional update:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUpdate()

    // Realtime subscription
    const channel = supabase
      .channel('regional_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'regional_updates',
        },
        () => {
          // Refetch when new update posted
          fetchUpdate()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [])

  return { update, loading }
}
