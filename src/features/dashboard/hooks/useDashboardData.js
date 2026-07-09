import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

/**
 * BLW-02/BLW-05: single round-trip for the Dashboard's stat/count widgets,
 * cached in the shared React Query client.
 *
 * Returns the get_dashboard_data() payload, or null while loading / if the
 * RPC fails (e.g. migration not applied yet). Consumers treat null/missing
 * slices as "fetch it yourself" so the dashboard still renders either way.
 */
export function useDashboardData(userId, role, departmentId) {
  const { data } = useQuery({
    queryKey: ['dashboard-data', userId, role ?? null, departmentId ?? null],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data: payload, error } = await supabase.rpc('get_dashboard_data', {
        p_user_id: userId,
        p_role: role ?? null,
        p_department_id: departmentId ?? null,
      })
      if (error) {
        console.error('Failed to load dashboard data:', error)
        return null
      }
      return payload ?? null
    },
  })

  return data ?? null
}
