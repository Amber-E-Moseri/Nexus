import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchOrgChartContent, updateOrgChartNode, updateOrgChartEdge } from '../lib/orgChart/api'

export const orgChartContentKey = ['org_chart_content']

export function useOrgChartContent() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: orgChartContentKey,
    queryFn: fetchOrgChartContent,
    staleTime: 60_000,
  })

  const nodeTextById = useMemo(
    () => Object.fromEntries((data?.nodes ?? []).map((n) => [n.id, n])),
    [data],
  )
  const edgeTextById = useMemo(
    () => Object.fromEntries((data?.edges ?? []).map((e) => [e.id, e])),
    [data],
  )

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: orgChartContentKey }),
    [queryClient],
  )

  const saveNode = useCallback(
    async (id, patch) => {
      const result = await updateOrgChartNode(id, patch)
      await invalidate()
      return result
    },
    [invalidate],
  )

  const saveEdge = useCallback(
    async (id, patch) => {
      const result = await updateOrgChartEdge(id, patch)
      await invalidate()
      return result
    },
    [invalidate],
  )

  return { nodeTextById, edgeTextById, isLoading, error, saveNode, saveEdge }
}
