import { supabase } from '../../../lib/supabase'

export async function getIdeaBankItems({ spaceId, status, parentItemId } = {}) {
  let query = supabase.from('idea_bank_items').select('*')

  if (spaceId !== undefined) query = query.eq('space_id', spaceId)
  if (status) query = query.eq('status', status)
  if (parentItemId !== undefined) {
    query = parentItemId === null
      ? query.is('parent_item_id', null)
      : query.eq('parent_item_id', parentItemId)
  }

  query = query.order('created_at', { ascending: true })

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createIdea({ spaceId, title, itemText, itemType, parentItemId, isPrivate }) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user) throw new Error('You must be signed in to create an idea.')

  const { data, error } = await supabase
    .from('idea_bank_items')
    .insert({
      space_id: spaceId ?? null,
      title,
      item_text: itemText,
      item_type: itemType || 'exploration',
      parent_item_id: parentItemId ?? null,
      is_private: isPrivate ?? false,
      user_id: user.id,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateIdea(id, patch) {
  const { data, error } = await supabase
    .from('idea_bank_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteIdea(id) {
  const { error } = await supabase
    .from('idea_bank_items')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getSubIdeas(parentItemId) {
  const { data, error } = await supabase
    .from('idea_bank_items')
    .select('*')
    .eq('parent_item_id', parentItemId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
