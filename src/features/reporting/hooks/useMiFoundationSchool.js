import { useQuery } from '@tanstack/react-query'
import { fetchFoundationSchoolStats } from '../lib/miApi'

/**
 * Hook for fetching Foundation School completion statistics
 */
export function useMiFoundationSchool(params = {}) {
  const { subgroupId, fellowshipId, cellId } = params

  const queryKey = ['mi_foundation_school', { subgroupId, fellowshipId, cellId }]

  return useQuery({
    queryKey,
    queryFn: () => fetchFoundationSchoolStats(params),
    staleTime: 30 * 1000,
  })
}
