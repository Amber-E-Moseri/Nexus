import { supabase } from './supabase'

export async function hasPermission(userId, permission) {
  if (!userId || !permission) return false

  const { data, error } = await supabase
    .from('user_permissions')
    .select('permission')
    .eq('user_id', userId)
    .eq('permission', permission)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}
