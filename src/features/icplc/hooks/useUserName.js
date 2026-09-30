import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'

/** Display name for a staff member id (used to show who set an exception or reviewed something). */
export function useUserName(userId) {
  const { data } = useQuery({
    queryKey: ['icplc_user_name', userId],
    queryFn: async () => {
      const { data: row, error } = await supabase.from('users').select('name').eq('id', userId).maybeSingle()
      if (error) throw error
      return row?.name || null
    },
    enabled: !!userId,
    staleTime: 10 * 60_000,
  })
  return data || null
}
