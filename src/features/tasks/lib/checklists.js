import { supabase } from '../../../lib/supabase'

function sortChecklists(rows = []) {
  return [...rows].sort((a, b) => {
    if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  })
}

function sortItems(rows = []) {
  return [...rows].sort((a, b) => {
    if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  })
}

export async function getChecklists(taskId) {
  if (!taskId) return []

  const { data: checklists, error: checklistError } = await supabase
    .from('task_checklists')
    .select('id, task_id, title, sort_order, created_at')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (checklistError) throw checklistError

  const checklistIds = (checklists ?? []).map((row) => row.id)
  if (!checklistIds.length) return []

  const { data: items, error: itemError } = await supabase
    .from('task_checklist_items')
    .select('id, checklist_id, title, is_checked, sort_order, created_at')
    .in('checklist_id', checklistIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (itemError) throw itemError

  const itemsByChecklistId = new Map()
  for (const item of items ?? []) {
    const current = itemsByChecklistId.get(item.checklist_id) ?? []
    current.push(item)
    itemsByChecklistId.set(item.checklist_id, current)
  }

  return sortChecklists(checklists ?? []).map((checklist) => ({
    ...checklist,
    items: sortItems(itemsByChecklistId.get(checklist.id) ?? []),
  }))
}

export async function getChecklistCounts(taskIds = []) {
  const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)))
  if (!uniqueTaskIds.length) return {}

  const { data: checklists, error: checklistError } = await supabase
    .from('task_checklists')
    .select('id, task_id')
    .in('task_id', uniqueTaskIds)

  if (checklistError) throw checklistError

  const counts = Object.fromEntries(uniqueTaskIds.map((taskId) => [taskId, { total: 0, checked: 0 }]))
  const checklistRows = checklists ?? []
  if (!checklistRows.length) return counts

  const checklistToTask = new Map(checklistRows.map((row) => [row.id, row.task_id]))

  const { data: items, error: itemError } = await supabase
    .from('task_checklist_items')
    .select('checklist_id, is_checked')
    .in('checklist_id', checklistRows.map((row) => row.id))

  if (itemError) throw itemError

  for (const item of items ?? []) {
    const taskId = checklistToTask.get(item.checklist_id)
    if (!taskId) continue
    counts[taskId].total += 1
    if (item.is_checked) counts[taskId].checked += 1
  }

  return counts
}

export async function createChecklist(taskId, title = 'Checklist') {
  const { data, error } = await supabase
    .from('task_checklists')
    .insert({
      task_id: taskId,
      title: title?.trim() || 'Checklist',
      sort_order: Date.now(),
    })
    .select('id, task_id, title, sort_order, created_at')
    .single()

  if (error) throw error
  return { ...data, items: [] }
}

export async function renameChecklist(id, title) {
  const { data, error } = await supabase
    .from('task_checklists')
    .update({ title: title?.trim() || 'Checklist' })
    .eq('id', id)
    .select('id, task_id, title, sort_order, created_at')
    .single()

  if (error) throw error
  return data
}

export async function deleteChecklist(id) {
  const { error } = await supabase.from('task_checklists').delete().eq('id', id)
  if (error) throw error
}

export async function addChecklistItem(checklistId, title) {
  const { data, error } = await supabase
    .from('task_checklist_items')
    .insert({
      checklist_id: checklistId,
      title: title?.trim() || 'New item',
      sort_order: Date.now(),
    })
    .select('id, checklist_id, title, is_checked, sort_order, created_at')
    .single()

  if (error) throw error
  return data
}

export async function toggleChecklistItem(id, isChecked) {
  const { data, error } = await supabase
    .from('task_checklist_items')
    .update({ is_checked: isChecked })
    .eq('id', id)
    .select('id, checklist_id, title, is_checked, sort_order, created_at')
    .single()

  if (error) throw error
  return data
}

export async function updateChecklistItemTitle(id, title) {
  const { data, error } = await supabase
    .from('task_checklist_items')
    .update({ title: title?.trim() || 'Untitled item' })
    .eq('id', id)
    .select('id, checklist_id, title, is_checked, sort_order, created_at')
    .single()

  if (error) throw error
  return data
}

export async function deleteChecklistItem(id) {
  const { error } = await supabase.from('task_checklist_items').delete().eq('id', id)
  if (error) throw error
}

export async function reorderChecklistItems(orderedIds = []) {
  if (!orderedIds.length) return
  const updates = orderedIds.map((id, index) =>
    supabase.from('task_checklist_items').update({ sort_order: index }).eq('id', id),
  )
  const results = await Promise.all(updates)
  const failure = results.find((result) => result.error)
  if (failure?.error) throw failure.error
}
