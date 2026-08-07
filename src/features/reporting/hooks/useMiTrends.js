import { useQuery } from '@tanstack/react-query'
import { fetchWeeklyTrends } from '../lib/miApi'

export function useMiTrends(params = {}) {
  const { dateFrom, dateTo } = params

  return useQuery({
    queryKey: ['mi_weekly_trends', { dateFrom, dateTo }],
    queryFn: () => fetchWeeklyTrends({ dateFrom, dateTo }),
    staleTime: 30 * 1000,
  })
}
