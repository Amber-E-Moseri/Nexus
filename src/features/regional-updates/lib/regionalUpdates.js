import { supabase } from '../../../lib/supabase'

// Post a new regional update
export async function postRegionalUpdate(content, expiresAt) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('regional_updates')
    .insert([{ content, expires_at: expiresAt, created_by: user.id }])
    .select()

  if (error) throw error
  return data?.[0]
}

// Get the most recent active update (for dashboard widget)
export async function getActiveRegionalUpdate() {
  const { data, error } = await supabase
    .rpc('get_active_regional_update')

  if (error) throw error
  return data?.[0] || null
}

// Get all updates for sidebar (active + expired)
export async function getRegionalUpdatesList() {
  const { data, error } = await supabase
    .rpc('get_regional_updates_list')

  if (error) throw error
  return data || []
}

// Delete an update (RS only)
export async function deleteRegionalUpdate(updateId) {
  const { error } = await supabase
    .from('regional_updates')
    .delete()
    .eq('id', updateId)

  if (error) throw error
}

// Update an update (RS only)
export async function updateRegionalUpdate(updateId, { content, expires_at }) {
  const { data, error } = await supabase
    .from('regional_updates')
    .update({ content, expires_at, updated_at: new Date().toISOString() })
    .eq('id', updateId)
    .select()

  if (error) throw error
  return data?.[0]
}
