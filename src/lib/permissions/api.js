import { supabase } from '../../services/supabase';

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

    if (userError || !user) return false;

    // Super admin has everything
    if (user.role === 'super_admin') return true;

    // Check role_permissions
    const { data: permission, error: permError } = await supabase
      .from('role_permissions')
      .select('enabled')
      .eq('role', user.role)
      .eq('permission_key', permissionKey)
      .maybeSingle();

    if (permError) return false;
    return permission?.enabled || false;
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
