import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

/**
 * BLW-02: single round-trip for the Dashboard's stat/count widgets.
 *
 * Returns the get_dashboard_data() payload, or null while loading / if the
 * RPC fails (e.g. migration not applied yet). Consumers treat null/missing
 * slices as "fetch it yourself" so the dashboard still renders either way.
 */
export function useDashboardData(userId, role, departmentId) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!userId) return
    let active = true

    supabase
      .rpc('get_dashboard_data', {
        p_user_id: userId,
        p_role: role ?? null,
        p_department_id: departmentId ?? null,
      })
      .then(({ data: payload, error }) => {
        if (!active) return
        if (error) {
          console.error('Failed to load dashboard data:', error)
          setData(null)
          return
        }
        setData(payload ?? null)
      })

    return () => {
      active = false
    }
  }, [userId, role, departmentId])

  return data
}
