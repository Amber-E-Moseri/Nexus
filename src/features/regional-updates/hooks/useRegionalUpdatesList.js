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

    // Realtime subscription
    const channel = supabase
      .channel('regional_updates_list')
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
      channel.unsubscribe()
    }
  }, [])

  return { updates, loading }
}
