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
  appUrl: import.meta.env.VITE_FLOCK_CRM_APP_URL || import.meta.env.VITE_FLOCK_CRM_API_URL,
  requiredRole: 'regional_secretary',
  permissionKey: 'can_access_flock_crm',

  checkAccess: (userRole, userPermissions = []) => {
    return (
      userRole === 'regional_secretary' ||
      userRole === 'super_admin' ||
      userPermissions.includes('can_access_flock_crm')
    )
  }
}

export function canAccessFlockCRM(userRole) {
  return FLOCK_CRM_CONFIG.checkAccess(userRole)
}

/**
 * Check if user has a feature role in a specific space
 * Feature roles: 'ORS', 'programs', 'media'
 *
 * @param {Object} user - User object with feature_roles array
 * @param {string|null} spaceId - Space ID to check. If null, checks globally.
 * @param {string} featureRole - Feature role to check ('ORS', 'programs', 'media')
 * @returns {boolean}
 */
export function hasFeatureRole(user, spaceId, featureRole) {
  if (!user?.feature_roles) return false

  if (spaceId) {
    const spaceRoles = user.feature_roles.find(r => r.space_id === spaceId)
    return spaceRoles?.roles?.includes(featureRole) ?? false
  }

  return user.feature_roles.some(r => r.roles?.includes(featureRole))
}

/**
 * Get effective role for a user in a specific space
 *
 * @param {Object} user - User object
 * @param {string} spaceId - Space ID
 * @returns {string} - Effective role name
 */
export function getEffectiveRole(user, spaceId) {
  const ROLE_HIERARCHY = ['super_admin', 'regional_secretary', 'dept_lead', 'pastor', 'ors', 'programs', 'media', 'member']

  const roles = []

  if (user.role) roles.push(user.role)
  if (user.base_roles) roles.push(...user.base_roles)

  if (spaceId && user.feature_roles) {
    const spaceRoles = user.feature_roles.find(r => r.space_id === spaceId)
    if (spaceRoles?.roles) roles.push(...spaceRoles.roles.map(r => r.toLowerCase()))
  }

  for (const role of ROLE_HIERARCHY) {
    if (roles.includes(role)) return role
  }

  return 'member'
}

/**
 * Check if Ministry Calendar event is visible to user
 * ORS + programs + super_admin see all.
 * Everyone else filtered by tag visibility.
 */
export function canSeeCalendarEvent(user, event) {
  if (['super_admin', 'ors'].includes(user.role)) return true
  if (hasFeatureRole(user, null, 'programs')) return true

  if (!event.tags || event.tags.length === 0) return true

  return event.tags.some(tag => {
    const v = tag.visible_to
    if (!v) return true
    if (v.includes('everyone')) return true
    if (v.includes(user.role)) return true
    if (v.includes(user.department)) return true
    return false
  })
}
