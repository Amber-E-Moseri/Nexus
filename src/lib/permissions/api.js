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

const ROLE_BASELINE_PERMISSIONS = {
  super_admin: [
    'campus:approve', 'campus:edit',
    'meetings:manage', 'meetings:view',
    'calendar:write', 'calendar:view',
    'tasks:assign', 'reports:view',
    'users:manage', 'automations:manage', 'api:access',
  ],
  ors: [
    'campus:approve', 'campus:edit',
    'meetings:manage', 'meetings:view',
    'calendar:view', 'reports:view',
  ],
  dept_lead: [
    'calendar:write', 'calendar:view',
    'tasks:assign', 'reports:view',
    'automations:manage',
  ],
  pastor: [
    'calendar:view', 'tasks:assign', 'tasks:create', 'meetings:view',
  ],
  reg_sec: [
    'calendar:view', 'reports:view', 'flock:integrate',
  ],
  member: [
    'calendar:view', 'tasks:view', 'meetings:join',
  ],
}

/**
 * Check if a user has a specific permission
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

    console.log(`[userHasPermission] userId=${userId}, role=${user.role}, permissionKey=${permissionKey}`);

    // Super admin has everything
    if (user.role === 'super_admin') return true;

    // Check role_permissions table first
    const { data: permission, error: permError } = await supabase
      .from('role_permissions')
      .select('enabled')
      .eq('role', user.role)
      .eq('permission_key', permissionKey)
      .maybeSingle();

    if (permError) {
      console.log('[userHasPermission] role_permissions query error (expected if table missing):', permError);
    } else if (permission != null) {
      console.log('[userHasPermission] role_permissions found:', permission.enabled);
      return permission.enabled;
    }

    // Fallback to hardcoded baseline when role_permissions table is empty or missing
    const baseline = ROLE_BASELINE_PERMISSIONS[user.role];
    const hasPermission = baseline && baseline.includes(permissionKey);
    console.log(`[userHasPermission] baseline fallback: role=${user.role}, hasPermission=${hasPermission}`);

    return hasPermission || false;
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
