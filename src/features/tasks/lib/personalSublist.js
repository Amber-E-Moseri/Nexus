import { supabase } from '../../../lib/supabase'

/**
 * Fetch all sublists for a user with their associated tasks
 */
export async function getPersonalSublists(userId) {
  const { data, error } = await supabase
    .from('personal_lists')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Fetch a single sublist by ID
 */
export async function getPersonalSublist(userId, listId) {
  const { data, error } = await supabase
    .from('personal_lists')
    .select('*')
    .eq('user_id', userId)
    .eq('id', listId)
    .single()

  if (error) throw error
  return data
}

/**
 * Get or create the user's default sublist ("All Tasks")
 * Used for lazy backfill on first load
 */
export async function getOrCreateDefaultSublist(userId) {
  // Try to fetch existing default
  const { data: existing, error: fetchError } = await supabase
    .from('personal_lists')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .single()

  if (existing) return existing

  // If 404, create the default sublist
  if (fetchError?.code === 'PGRST116') {
    const { data: created, error: createError } = await supabase
      .from('personal_lists')
      .insert({
        user_id: userId,
        name: 'All Tasks',
        is_default: true,
        sort_order: 0,
      })
      .select()
      .single()

    if (createError) {
      // Handle race condition: another tab created it first
      if (createError.code === 'PGRST409') {
        const { data: raced, error: raceError } = await supabase
          .from('personal_lists')
          .select('*')
          .eq('user_id', userId)
          .eq('is_default', true)
          .single()

        if (raceError) throw raceError
        return raced
      }
      throw createError
    }

    return created
  }

  if (fetchError) throw fetchError
}

/**
 * Create a new sublist for a user
 */
export async function createPersonalSublist(userId, name, isDefault = false) {
  if (!name?.trim()) throw new Error('Sublist name is required')

  const { data, error } = await supabase
    .from('personal_lists')
    .insert({
      user_id: userId,
      name: name.trim(),
      is_default: isDefault,
      sort_order: 0,
    })
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST409' && error.message?.includes('unique')) {
      throw new Error(`A sublist named "${name}" already exists`)
    }
    throw error
  }

  return data
}

/**
 * Update a sublist (name, sort_order, etc.)
 * Cannot update is_default or user_id
 */
export async function updatePersonalSublist(userId, listId, updates) {
  const { name, sort_order } = updates
  const payload = {}

  if (name !== undefined) {
    if (!name?.trim()) throw new Error('Sublist name is required')
    payload.name = name.trim()
  }

  if (sort_order !== undefined) {
    payload.sort_order = sort_order
  }

  if (Object.keys(payload).length === 0) return

  payload.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('personal_lists')
    .update(payload)
    .eq('user_id', userId)
    .eq('id', listId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST409' && error.message?.includes('unique')) {
      throw new Error(`A sublist named "${name}" already exists`)
    }
    throw error
  }

  return data
}

/**
 * Delete a sublist
 * Trigger automatically reassigns tasks to user's default sublist
 * Prevents deletion of is_default = true sublist
 */
export async function deletePersonalSublist(userId, listId) {
  const { error } = await supabase
    .from('personal_lists')
    .delete()
    .eq('user_id', userId)
    .eq('id', listId)

  if (error) {
    if (error.message?.includes('Cannot delete the default sublist')) {
      throw new Error('Cannot delete the default sublist')
    }
    throw error
  }
}

/**
 * Assign a personal task to a sublist
 */
export async function moveTaskToSublist(taskId, listId) {
  const { error } = await supabase
    .from('tasks')
    .update({ personal_sublist_id: listId })
    .eq('id', taskId)
    .eq('is_personal', true)

  if (error) throw error
}

/**
 * Backfill NULL personal tasks into the user's default sublist
 * Called on first PersonalListPage load if user has personal tasks but no sublists
 */
export async function backfillPersonalTasksToDefaultSublist(userId) {
  // Get or create default sublist
  const defaultSublist = await getOrCreateDefaultSublist(userId)

  // Backfill all personal tasks without a sublist assignment
  const { error } = await supabase
    .from('tasks')
    .update({ personal_sublist_id: defaultSublist.id })
    .eq('is_personal', true)
    .or(`created_by.eq.${userId},assignee_id.eq.${userId}`)
    .is('personal_sublist_id', null)

  if (error) throw error
  return defaultSublist
}
