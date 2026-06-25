import { supabase } from '../supabase'

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

export async function getUserPermissions(userId) {
  const { data, error } = await supabase
    .from('api_permissions')
    .select('*')
    .eq('user_id', userId)

  if (error) throw error
  return data || []
}

export async function hasPermission(userId, permission) {
  const { data, error } = await supabase
    .from('api_permissions')
    .select('id')
    .eq('user_id', userId)
    .eq('permission', permission)
    .is('expires_at', null)
    .or(`expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function grantPermission(userId, permission, expiresAt = null, metadata = {}) {
  const { data: currentUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single()

  if (!currentUser) throw new Error('User not found')

  const { data: grantedBy } = await supabase.auth.getSession()

  const { data, error } = await supabase
    .from('api_permissions')
    .upsert(
      {
        user_id: userId,
        permission,
        granted_by: grantedBy?.session?.user?.id,
        expires_at: expiresAt,
        metadata,
      },
      { onConflict: 'user_id,permission' }
    )
    .select()
    .single()

  if (error) throw error

  // Log the action
  await logPermissionChange(userId, permission, 'granted', grantedBy?.session?.user?.id)

  return data
}

export async function revokePermission(userId, permission) {
  const { data: grantedBy } = await supabase.auth.getSession()

  const { error } = await supabase
    .from('api_permissions')
    .delete()
    .eq('user_id', userId)
    .eq('permission', permission)

  if (error) throw error

  // Log the action
  await logPermissionChange(userId, permission, 'revoked', grantedBy?.session?.user?.id)
}

export async function getPermissionAuditLog(filters = {}) {
  let query = supabase.from('permission_audit_log').select('*')

  if (filters.userId) {
    query = query.eq('user_id', filters.userId)
  }

  if (filters.permission) {
    query = query.eq('permission', filters.permission)
  }

  if (filters.action) {
    query = query.eq('action', filters.action)
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100)

  if (error) throw error
  return data || []
}

async function logPermissionChange(userId, permission, action, grantedBy) {
  const { error } = await supabase
    .from('permission_audit_log')
    .insert({
      user_id: userId,
      permission,
      action,
      granted_by: grantedBy,
    })

  if (error) {
    console.error('Failed to log permission change:', error)
  }
}

export async function getUsers(search = '') {
  let query = supabase.from('users').select('id, name, email, role')

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  const { data, error } = await query.limit(20)
  if (error) throw error
  return data || []
}
