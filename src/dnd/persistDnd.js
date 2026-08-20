/**
 * Persists a board-column drop: updates status + sort_order for one task.
 */
export async function persistBoardDrop({ taskId, newStatus, newSortOrder, newStatusId = null, supabase }) {
  if (!supabase) return { error: new Error('supabase client required') }
  const patch = { status: newStatus, sort_order: newSortOrder }
  if (newStatusId) patch.status_id = newStatusId
  const { error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', taskId)
  return { error }
}

/**
 * Persists a reorder within a list or column.
 * updates: Array<{ id: string, sort_order: number }>
 * Fires all UPDATEs in parallel. Returns an array of any errors encountered.
 */
export async function persistListReorder({ updates, supabase }) {
  if (!supabase || !updates?.length) return []

  const results = await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from('tasks').update({ sort_order }).eq('id', id)
    )
  )
  return results.map(r => r.error).filter(Boolean)
}
