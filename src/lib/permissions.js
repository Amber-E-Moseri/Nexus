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

export const FLOCK_CRM_CONFIG = {
  enabled: import.meta.env.VITE_FLOCK_CRM_ENABLED === 'true',
  apiUrl: import.meta.env.VITE_FLOCK_CRM_API_URL,
  requiredRole: 'regional_secretary',
  permissionKey: 'can_access_flock_crm',

  checkAccess: (userRole, userPermissions = []) => {
    return (
      userRole === 'regional_secretary' ||
      userPermissions.includes('can_access_flock_crm')
    )
  }
}

export function canAccessFlockCRM(userRole) {
  return FLOCK_CRM_CONFIG.checkAccess(userRole)
}

