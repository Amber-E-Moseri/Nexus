import { supabase } from '../supabase';

// Permission types available in the system
export const PERMISSION_TYPES = {
  EXPORT_DATA: 'export_data',
  MANAGE_AUTOMATIONS: 'manage_automations',
  VIEW_ANALYTICS: 'view_analytics',
  MANAGE_INTEGRATIONS: 'manage_integrations',
  MANAGE_USERS: 'manage_users',
  CREATE_TEAMS: 'create_teams',
  MANAGE_SPRINTS: 'manage_sprints',
  MANAGE_MEETINGS: 'manage_meetings',
  API_ACCESS: 'api_access',
}

const PERMISSION_LABELS = {
  export_data: 'Export Data',
  manage_automations: 'Manage Automations',
  view_analytics: 'View Analytics',
  manage_integrations: 'Manage Integrations',
  manage_users: 'Manage Users',
  create_teams: 'Create Teams',
  manage_sprints: 'Manage Sprints',
  manage_meetings: 'Manage Meetings',
  api_access: 'API Access',
}

export function getPermissionLabel(permission) {
  return PERMISSION_LABELS[permission] || permission
}

/**
 * Check if a user has a specific permission.
 *
 * role_permissions is the single source of truth as of the Phase 3
 * permission revamp (2026-07-09) — there is deliberately no hardcoded
 * fallback here. The previous ROLE_BASELINE_PERMISSIONS object (which
 * still carried a dead 'reg_sec' key, superseded by 'regional_secretary'
 * back in the 20261001000000 migration) was removed rather than kept in
 * sync: two copies of the same matrix can silently drift, one copy
 * cannot. If a role_permissions row is missing for a role/permission
 * pair, this now fails closed (denies) instead of falling back to a
 * possibly-stale hardcoded copy.
 *
 * This only resolves base-role permissions (role_scope='base'); it does
 * not yet check space_roles/role_scope='space' grants or
 * user_permission_overrides — that resolution layering is follow-up
 * work once the RLS-swap pass wires has_space_role() into policies.
 */
export async function userHasPermission(userId, permissionKey) {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('userHasPermission: user fetch error', userError);
      return false;
    }

    // Super admin has everything
    if (user.role === 'super_admin') return true;

    // Space roles union in their role_scope='space' permissions (Phase 3):
    // e.g. a user whose base role is 'member' but who holds 'ors' in a space
    // gets the ors permission set. Space-scoped *narrowing* (only counting a
    // grant when acting inside that space) is a resolution-layer refinement
    // deferred with user_permission_overrides; for now any space grant
    // enables its permissions, matching the old base-role behavior.
    const { data: spaceRoleRows, error: srError } = await supabase
      .from('space_roles')
      .select('role')
      .eq('user_id', userId);

    if (srError) {
      console.error('userHasPermission: space_roles query error', srError);
    }

    const spaceRoles = [...new Set((spaceRoleRows ?? []).map((r) => r.role))];

    const orFilter = [
      `and(role.eq.${user.role},role_scope.eq.base)`,
      ...spaceRoles.map((r) => `and(role.eq.${r},role_scope.eq.space)`),
    ].join(',');

    const { data: permissions, error: permError } = await supabase
      .from('role_permissions')
      .select('enabled')
      .eq('permission_key', permissionKey)
      .or(orFilter);

    if (permError) {
      console.error('userHasPermission: role_permissions query error', permError);
      return false;
    }

    return (permissions ?? []).some((p) => p.enabled);
  } catch (err) {
    console.error('userHasPermission error:', err);
    return false;
  }
}

/**
 * Get all permissions for a role
 */
export async function getRolePermissions(role) {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('*')
    .eq('role', role)
    .order('category')
    .order('permission_key');

  if (error) {
    console.error('getRolePermissions error:', error);
    return [];
  }

  return data || [];
}

/**
 * Toggle a permission for a role
 */
export async function toggleRolePermission(role, permissionKey, enabled) {
  const { error } = await supabase
    .from('role_permissions')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('role', role)
    .eq('permission_key', permissionKey);

  if (error) {
    console.error('toggleRolePermission error:', error);
    throw new Error(`Failed to update permission: ${error.message}`);
  }

  return true;
}

/**
 * Get all unique permission categories
 */
export async function getPermissionCategories() {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('category')
    .neq('category', null)
    .order('category');

  if (error) return [];

  const categories = [...new Set(data.map(p => p.category))];
  return categories;
}

/**
 * Get all permissions for a specific user
 */
export async function getUserPermissions(userId) {
  const { data, error } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getUserPermissions error:', error);
    return [];
  }

  return data || [];
}

/**
 * Grant a permission to a user
 */
export async function grantPermission(userId, permissionKey, expiresAt = null) {
  const { error } = await supabase
    .from('user_permissions')
    .insert([
      {
        user_id: userId,
        permission: permissionKey,
        expires_at: expiresAt,
      },
    ]);

  if (error) {
    console.error('grantPermission error:', error);
    throw new Error(`Failed to grant permission: ${error.message}`);
  }

  return true;
}

/**
 * Revoke a permission from a user
 */
export async function revokePermission(userId, permissionKey) {
  const { error } = await supabase
    .from('user_permissions')
    .delete()
    .eq('user_id', userId)
    .eq('permission', permissionKey);

  if (error) {
    console.error('revokePermission error:', error);
    throw new Error(`Failed to revoke permission: ${error.message}`);
  }

  return true;
}

/**
 * Get audit log for permission changes
 */
export async function getPermissionAuditLog(filters = {}) {
  let query = supabase.from('permission_audit_log').select('*');

  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('getPermissionAuditLog error:', error);
    return [];
  }

  return data || [];
}

/**
 * Search for users by name or email
 */
export async function getUsers(searchTerm) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email')
    .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
    .limit(10);

  if (error) {
    console.error('getUsers error:', error);
    return [];
  }

  return data || [];
}
