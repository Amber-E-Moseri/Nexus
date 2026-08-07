import { useQuery } from '@tanstack/react-query'
import { fetchAttendanceStats } from '../lib/miApi'

/**
 * Hook for fetching attendance statistics with frequency breakdown.
 * Depends on dateFrom, dateTo, eventType parameters.
 */
export function useMiAttendanceStats(params = {}) {
  const { dateFrom, dateTo, eventType = 'all', subgroupId, fellowshipId, cellId } = params

  // Build stable query key
  const queryKey = [
    'mi_attendance_stats',
    {
      dateFrom,
      dateTo,
      eventType,
      subgroupId,
      fellowshipId,
      cellId,
    },
  ]

  return useQuery({
    queryKey,
    queryFn: () =>
      fetchAttendanceStats({
        dateFrom,
        dateTo,
        eventType,
        subgroupId,
        fellowshipId,
        cellId,
      }),
    staleTime: 30 * 1000, // 30s
  })
}
