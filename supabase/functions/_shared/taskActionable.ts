// Whether a task is still worth reminding someone about. Pure (no Deno / network imports) so it is
// unit-tested under vitest and shared by reminder functions.
//
// A task is NOT actionable when it is deleted, archived, completed, or its status category is
// 'completed' or 'cancelled' (task_status_definitions.category: open | in_progress | completed | cancelled).
// A task with no resolvable status category is treated as actionable (it is open work with an unset status).

export interface TaskActionabilityRow {
  deleted_at?: string | null
  archived_at?: string | null
  completed_at?: string | null
  // PostgREST returns a many-to-one embed as an object; tolerate an array defensively.
  status_def?: { category?: string | null } | { category?: string | null }[] | null
}

export function taskCategory(t: TaskActionabilityRow): string | null {
  const d = Array.isArray(t.status_def) ? t.status_def[0] : t.status_def
  return d?.category ?? null
}

export function isActionableTask(t: TaskActionabilityRow): boolean {
  if (t.deleted_at || t.archived_at || t.completed_at) return false
  const c = taskCategory(t)
  return c !== 'completed' && c !== 'cancelled'
}
