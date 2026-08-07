import { useQuery } from '@tanstack/react-query'
import { fetchSubgroups, fetchFellowships, fetchCells } from '../lib/miApi'

/**
 * Hook for fetching all subgroups (top-level dashboard entries)
 */
export function useMiSubgroups() {
  return useQuery({
    queryKey: ['mi_subgroups'],
    queryFn: fetchSubgroups,
    staleTime: 60 * 1000, // 60s — hierarchy changes less frequently
  })
}

/**
 * Hook for fetching fellowships in a subgroup
 */
export function useMiFellowships(subgroupId) {
  return useQuery({
    queryKey: ['mi_fellowships', subgroupId],
    queryFn: () => fetchFellowships(subgroupId),
    enabled: !!subgroupId,
    staleTime: 60 * 1000,
  })
}

/**
 * Hook for fetching cells in a fellowship
 */
export function useMiCells(fellowshipId) {
  return useQuery({
    queryKey: ['mi_cells', fellowshipId],
    queryFn: () => fetchCells(fellowshipId),
    enabled: !!fellowshipId,
    staleTime: 60 * 1000,
  })
}
