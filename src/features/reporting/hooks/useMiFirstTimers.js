import { useQuery } from '@tanstack/react-query'
import { fetchFirstTimers } from '../lib/miApi'

/**
 * Hook for fetching first-timer statistics
 */
export function useMiFirstTimers(params = {}) {
  const { monthsBack = 1 } = params

  const queryKey = ['mi_first_timers', monthsBack]

  return useQuery({
    queryKey,
    queryFn: () => fetchFirstTimers({ monthsBack }),
    staleTime: 30 * 1000,
  })
}
