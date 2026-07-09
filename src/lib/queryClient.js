import { QueryClient } from '@tanstack/react-query'

/**
 * BLW-05: shared query cache. Widgets and pages that request the same data
 * (same query key) within staleTime share one network call and one cache
 * entry instead of each firing their own Supabase query.
 *
 * Realtime note: subscriptions that need to push fresh data into the cache
 * should call queryClient.invalidateQueries({ queryKey }) from their
 * postgres_changes handler rather than refetching directly.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
