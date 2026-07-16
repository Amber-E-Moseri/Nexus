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
  // Flock CRM is DB-backed (src/lib/flockSupabase.js) — always available;
  // access is purely role-based. The old VITE_FLOCK_CRM_* env gating applied
  // to the retired Google Apps Script integration.
  permissionKey: 'can_access_flock_crm',

  checkAccess: (userRole, userPermissions = []) => {
    return (
      userRole === 'regional_secretary' ||
      userRole === 'pastor' ||
      userRole === 'super_admin' ||
      userPermissions.includes('can_access_flock_crm')
    )
  }
}

export function canAccessFlockCRM(userRole) {
  return FLOCK_CRM_CONFIG.checkAccess(userRole)
}

/**
 * Space roles that can be granted per-space via the space_roles table
 * (Phase 3 permission model). users.role never holds these values anymore —
 * the 20261215000003 migration shrank the base-role set to
 * super_admin/dept_lead/pastor/regional_secretary/member, and dept_lead as a
 * base role is a label only (its authority comes from a space_roles row).
 */
export const SPACE_ROLES = ['ors', 'programs', 'media', 'dept_lead']

/**
 * Check if user holds a space role, per the profile's space_roles rows
 * (attached in AuthContext from the space_roles table; shape
 * [{ space_id, role }]).
 *
 * @param {Object} user - profile object carrying space_roles
 * @param {string|null} spaceId - space to check; null = "in any space"
 * @param {string} spaceRole - 'ors' | 'programs' | 'media' | 'dept_lead'
 */
export function hasSpaceRole(user, spaceId, spaceRole) {
  const rows = user?.space_roles
  if (!Array.isArray(rows) || rows.length === 0) return false

  const wanted = String(spaceRole).toLowerCase()
  return rows.some(
    (r) => r.role?.toLowerCase() === wanted && (!spaceId || r.space_id === spaceId)
  )
}

/**
 * Back-compat alias — call sites written against the dead feature_roles JSONB
 * (which was empty for every live user) keep working, now backed by the real
 * space_roles rows. Role names are matched case-insensitively so legacy 'ORS'
 * arguments still resolve.
 */
export function hasFeatureRole(user, spaceId, featureRole) {
  return hasSpaceRole(user, spaceId, featureRole)
}

/**
 * Check if user holds an ad-hoc grant (user_grants table; attached in
 * AuthContext as profile.grants, a flat array of grant_type strings). Used to
 * give a specific user a capability beyond their base role — e.g. a pastor
 * granted regional_secretary-level admin reach without changing their base
 * role (which would drop pastor-specific RLS/RPC checks elsewhere).
 *
 * @param {Object} user - profile object carrying grants
 * @param {string} grantType
 */
export function hasGrant(user, grantType) {
  const grants = user?.grants
  if (!Array.isArray(grants)) return false
  return grants.includes(grantType)
}

/**
 * Get effective role for a user in a specific space.
 * Space-role grants (space_roles rows) outrank the base role except for
 * super_admin/regional_secretary, which are org-wide by design.
 */
export function getEffectiveRole(user, spaceId) {
  const ROLE_HIERARCHY = ['super_admin', 'regional_secretary', 'dept_lead', 'pastor', 'ors', 'programs', 'media', 'member']

  const roles = []

  if (user.role) roles.push(user.role)

  if (Array.isArray(user.space_roles)) {
    for (const r of user.space_roles) {
      if (!spaceId || r.space_id === spaceId) roles.push(r.role?.toLowerCase())
    }
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
  if (user.role === 'super_admin') return true
  if (hasSpaceRole(user, null, 'ors') || hasSpaceRole(user, null, 'programs')) return true

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
