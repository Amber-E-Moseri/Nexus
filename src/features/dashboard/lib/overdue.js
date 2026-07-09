// Group flat overdue-task rows into per-member buckets, most overdue first.
// Accepts rows from the get_dashboard_data RPC ({ assignee_id, assignee_name })
// or the legacy embedded shape ({ assignee_id, assignee: { name } }).
export function groupOverdueByMember(rows = []) {
  const map = {}
  for (const task of rows) {
    const id = task.assignee_id
    const name = task.assignee_name ?? task.assignee?.name ?? 'Unknown'
    if (!map[id]) map[id] = { id, name, tasks: [] }
    map[id].tasks.push(task)
  }
  return Object.values(map).sort((a, b) => b.tasks.length - a.tasks.length)
}
