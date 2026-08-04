// RENAME: useTemplate → useYourFeature (e.g. useWins.js)
// React Query wrapper + realtime subscription.

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { getItems, createItem, updateItem, deleteItem } from '../lib/template'

// Export the key factory so other components can invalidate selectively.
export const templateKey = (departmentId) => ['template_items', departmentId]

export function useTemplate() {
  const { profile } = useAuth()
  const departmentId = profile?.department_id
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: templateKey(departmentId),
    queryFn: () => getItems(departmentId),
    enabled: Boolean(departmentId),
  })

  // Realtime: invalidate on any change to the table.
  useEffect(() => {
    if (!departmentId) return

    const channel = supabase
      .channel(`template_items:${departmentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'template_items', filter: `department_id=eq.${departmentId}` },
        () => queryClient.invalidateQueries({ queryKey: templateKey(departmentId) }),
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [departmentId, queryClient])

  // Mutations: call lib fn, then invalidate — no optimistic updates needed.
  async function handleCreate(payload) {
    await createItem({ ...payload, department_id: departmentId })
    await queryClient.invalidateQueries({ queryKey: templateKey(departmentId) })
  }

  async function handleUpdate(id, updates) {
    await updateItem(id, updates)
    await queryClient.invalidateQueries({ queryKey: templateKey(departmentId) })
  }

  async function handleDelete(id) {
    await deleteItem(id)
    await queryClient.invalidateQueries({ queryKey: templateKey(departmentId) })
  }

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: handleCreate,
    update: handleUpdate,
    remove: handleDelete,
  }
}
