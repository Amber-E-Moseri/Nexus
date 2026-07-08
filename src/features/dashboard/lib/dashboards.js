import { supabase } from '../../../lib/supabase'

export async function getUserDashboardPreferences(userId) {
  const { data, error } = await supabase
    .from('dashboard_preferences')
    .select('widget_key, visible, sort_order, config')
    .eq('user_id', userId)
    .order('sort_order')

  if (error) throw error
  return data ?? []
}

export async function getRoleDashboardDefaults(role) {
  const { data, error } = await supabase
    .from('dashboard_role_defaults')
    .select('widget_key, visible, sort_order, config')
    .eq('role', role)
    .order('sort_order')

  if (error) throw error
  return data ?? []
}

export async function upsertDashboardPreferences(userId, preferences) {
  const { error } = await supabase
    .from('dashboard_preferences')
    .upsert(preferences.map((p) => ({
      user_id: userId,
      widget_key: p.widget_key,
      visible: p.visible,
      sort_order: p.sort_order,
      config: p.config ?? {},
    })), { onConflict: 'user_id,widget_key' })

  if (error) throw error
}

export async function deleteDashboardPreferences(userId) {
  const { error } = await supabase
    .from('dashboard_preferences')
    .delete()
    .eq('user_id', userId)

  if (error) throw error
}
