// RENAME: template → yourFeatureName (e.g. wins.js, roster.js)
// Pure Supabase calls — no React, no hooks.
// Import this from your hook or directly from page components.

import { supabase } from '../../../lib/supabase'

// Define the select shape once so it's easy to extend.
const ITEM_SELECT = `
  id,
  title,
  created_at,
  created_by,
  users!created_by (id, name, avatar_url)
`

export async function getItems(departmentId) {
  const { data, error } = await supabase
    .from('template_items')              // RENAME: your table
    .select(ITEM_SELECT)
    .eq('department_id', departmentId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getItem(id) {
  const { data, error } = await supabase
    .from('template_items')
    .select(ITEM_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createItem(payload) {
  const { data, error } = await supabase
    .from('template_items')
    .insert(payload)
    .select(ITEM_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function updateItem(id, updates) {
  const { data, error } = await supabase
    .from('template_items')
    .update(updates)
    .eq('id', id)
    .select(ITEM_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function deleteItem(id) {
  const { error } = await supabase
    .from('template_items')
    .delete()
    .eq('id', id)

  if (error) throw error
}
