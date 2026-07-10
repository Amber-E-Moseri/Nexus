const CATEGORY_ORDER = { open: 0, in_progress: 1, completed: 2, cancelled: 3 }

export function sortTaskStatuses(statuses = []) {
  return [...statuses].sort((left, right) => {
    const catDelta = (CATEGORY_ORDER[left.category] ?? 1) - (CATEGORY_ORDER[right.category] ?? 1)
    if (catDelta !== 0) return catDelta
    const orderDelta = (left.sort_order ?? 0) - (right.sort_order ?? 0)
    if (orderDelta !== 0) return orderDelta
    return String(left.name ?? '').localeCompare(String(right.name ?? ''))
  })
}

export function selectActiveTaskStatuses(statuses = []) {
  return sortTaskStatuses(statuses).filter((status) => status.active !== false)
}

// Org-wide statuses and their per-department children can share the same
// name/category (e.g. global "Cancelled" + a department's own "Cancelled"
// row), which would otherwise render as duplicate columns/sections. Collapse
// those into a single entry, tracking every underlying status id so tasks
// pointing at any of them still land in the merged group.
export function dedupeTaskStatuses(statuses = []) {
  const byKey = new Map()
  for (const status of statuses) {
    const key = `${status.category}|${(status.name ?? '').trim().toLowerCase()}`
    const existing = byKey.get(key)
    if (existing) {
      existing._mergedIds.push(status.id)
    } else {
      byKey.set(key, { ...status, _mergedIds: [status.id] })
    }
  }
  return [...byKey.values()]
}

export function selectDefaultStatus(statuses = [], preferredCategory = 'open') {
  const active = selectActiveTaskStatuses(statuses)
  return (
    active.find((status) => status.is_default) ??
    active.find((status) => status.category === preferredCategory) ??
    active[0] ??
    null
  )
}

export function selectCategoryStatus(statuses = [], category) {
  const active = selectActiveTaskStatuses(statuses)
  return active.find((status) => status.category === category) ?? null
}

export function selectTaskStatusUsageCounts(statuses = [], tasks = []) {
  const counts = Object.fromEntries(statuses.map((status) => [status.id, 0]))

  for (const task of tasks) {
    if (!task?.status_id) continue
    counts[task.status_id] = (counts[task.status_id] ?? 0) + 1
  }

  return counts
}

export function selectStatusWorkflowPreview(statuses = []) {
  return selectActiveTaskStatuses(statuses)
}

export function selectTaskCountsByCategory(tasks = []) {
  return tasks.reduce(
    (counts, task) => {
      const category = task.status_category ?? 'open'
      counts[category] = (counts[category] ?? 0) + 1
      return counts
    },
    { open: 0, in_progress: 0, completed: 0, cancelled: 0 },
  )
}

// Hierarchy-aware selectors

export function selectOrgStatuses(statuses = []) {
  return sortTaskStatuses(statuses).filter((status) => status.is_org_status === true)
}

export function selectDeptStatuses(statuses = []) {
  return sortTaskStatuses(statuses).filter((status) => status.is_org_status !== true)
}

export function selectStatusByOrgParent(statuses = [], orgStatusId) {
  return sortTaskStatuses(statuses).filter(
    (status) => status.org_status_id === orgStatusId && status.is_org_status !== true,
  )
}

export function selectHierarchyMap(statuses = []) {
  const orgStatuses = selectOrgStatuses(statuses)
  const deptStatuses = selectDeptStatuses(statuses)

  const map = {}
  for (const orgStatus of orgStatuses) {
    map[orgStatus.id] = {
      org: orgStatus,
      children: deptStatuses.filter((dept) => dept.org_status_id === orgStatus.id),
    }
  }
  return map
}
