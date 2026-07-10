import { supabase } from './supabase'
import {
  selectActiveTaskStatuses,
  selectCategoryStatus,
  selectDefaultStatus,
  selectStatusWorkflowPreview,
  selectTaskCountsByCategory,
  selectTaskStatusUsageCounts,
  selectOrgStatuses,
  selectDeptStatuses,
  selectStatusByOrgParent,
  selectHierarchyMap,
  dedupeTaskStatuses,
} from './taskStatusSelectors'

export const STATUS_CATEGORIES = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

const LEGACY_STATUS_META = {
  to_do: { label: 'To Do', color: '#7A7D86', category: STATUS_CATEGORIES.OPEN },
  backlog: { label: 'Not Started', color: '#7A7D86', category: STATUS_CATEGORIES.OPEN },
  in_progress: { label: 'In Progress', color: '#378ADD', category: STATUS_CATEGORIES.IN_PROGRESS },
  review: { label: 'Review', color: '#C78512', category: STATUS_CATEGORIES.IN_PROGRESS },
  done: { label: 'Completed', color: '#639922', category: STATUS_CATEGORIES.COMPLETED },
  blocked: { label: 'Blocked', color: '#C65353', category: STATUS_CATEGORIES.IN_PROGRESS },
  cancelled: { label: 'Cancelled', color: '#7A7D86', category: STATUS_CATEGORIES.CANCELLED },
}

function toHex(color) {
  if (!color) return null
  return color.startsWith('#') ? color : `#${color}`
}

function formatStatusName(value = '') {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function normalizeTaskStatusDefinition(status) {
  if (!status) return null
  return {
    ...status,
    color: toHex(status.color) ?? LEGACY_STATUS_META[status.legacy_key]?.color ?? '#7A7D86',
  }
}

export function getTaskStatusDefinition(task) {
  return normalizeTaskStatusDefinition(task?.status_definition ?? task?.statusDefinition ?? null)
}

export function getTaskStatusId(task) {
  return task?.status_id ?? getTaskStatusDefinition(task)?.id ?? null
}

export function getTaskStatusCategory(task) {
  return (
    task?.status_category ??
    getTaskStatusDefinition(task)?.category ??
    LEGACY_STATUS_META[task?.status]?.category ??
    STATUS_CATEGORIES.OPEN
  )
}

export function getTaskStatusLabel(task) {
  return (
    task?.status_name ??
    getTaskStatusDefinition(task)?.name ??
    LEGACY_STATUS_META[task?.status]?.label ??
    formatStatusName(task?.status ?? 'not_started')
  )
}

export function getTaskStatusColor(task) {
  return (
    task?.status_color ??
    getTaskStatusDefinition(task)?.color ??
    LEGACY_STATUS_META[task?.status]?.color ??
    '#7A7D86'
  )
}

export function isTaskCompleted(task) {
  return getTaskStatusCategory(task) === STATUS_CATEGORIES.COMPLETED
}

export function isTaskCancelled(task) {
  return getTaskStatusCategory(task) === STATUS_CATEGORIES.CANCELLED
}

export function isTaskInProgress(task) {
  return getTaskStatusCategory(task) === STATUS_CATEGORIES.IN_PROGRESS
}

export function isTaskOpen(task) {
  return getTaskStatusCategory(task) === STATUS_CATEGORIES.OPEN
}

export function isTaskActionable(task) {
  return !isTaskCompleted(task) && !isTaskCancelled(task)
}

export function normalizeTaskRow(task) {
  if (!task) return task

  const statusDefinition = normalizeTaskStatusDefinition(task.status_definition)
  const normalized = {
    ...task,
    status_definition: statusDefinition,
    status_id: task.status_id ?? statusDefinition?.id ?? null,
    status_name: statusDefinition?.name ?? LEGACY_STATUS_META[task.status]?.label ?? formatStatusName(task.status ?? 'not_started'),
    status_color: statusDefinition?.color ?? LEGACY_STATUS_META[task.status]?.color ?? '#7A7D86',
    status_category: statusDefinition?.category ?? LEGACY_STATUS_META[task.status]?.category ?? STATUS_CATEGORIES.OPEN,
  }

  if (Array.isArray(task.subtasks)) {
    normalized.subtasks = task.subtasks.map((subtask) => normalizeTaskRow(subtask))
  }
  if (task.depends_on) {
    normalized.depends_on = normalizeTaskRow(task.depends_on)
  }
  if (task.task) {
    normalized.task = normalizeTaskRow(task.task)
  }

  return normalized
}

export function normalizeTaskRows(tasks = []) {
  return tasks.map((task) => normalizeTaskRow(task))
}

function applyStatusContextFilter(query, departmentId) {
  return departmentId ? query.eq('department_id', departmentId) : query.is('department_id', null)
}

export async function listTaskStatuses({ departmentId = null, includeInactive = false } = {}) {
  if (departmentId) {
    const { data, error } = await supabase.rpc('get_space_statuses', {
      p_department_id: departmentId,
    })

    if (error) throw error

    const statuses = (data ?? []).map((status) => normalizeTaskStatusDefinition(status))
    return includeInactive ? statuses : statuses.filter((status) => status.active !== false)
  }

  let query = supabase.from('task_status_definitions').select('id, name, color, category, department_id, sort_order, is_default, active, legacy_key').order('sort_order').order('name')
  query = applyStatusContextFilter(query, departmentId)

  if (!includeInactive) {
    query = query.eq('active', true)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []).map((status) => normalizeTaskStatusDefinition(status))
}

export async function getStatusUsageCounts({ departmentId = null } = {}) {
  const { data, error } = await supabase.rpc('get_status_usage_counts', {
    p_department_id: departmentId,
  })

  if (error) throw error
  return data ?? []
}

export async function getTaskStatusCatalog({ departmentId = null, includeInactive = true } = {}) {
  const [statuses, countRows] = await Promise.all([
    listTaskStatuses({ departmentId, includeInactive }),
    getStatusUsageCounts({ departmentId }),
  ])

  const usageCounts = Object.fromEntries(
    statuses.map((status) => [status.id, 0])
  )
  for (const row of countRows) {
    usageCounts[row.status_id] = row.count
  }

  return {
    statuses,
    usageCounts,
    preview: selectStatusWorkflowPreview(statuses),
  }
}

export async function getOrgStatusParent(deptStatus) {
  if (!deptStatus) return null
  if (deptStatus.is_org_status) return null // Org statuses have no parent

  // Pre-joined by get_task_status_hierarchy (BLW-08)
  if (deptStatus.org_parent !== undefined) {
    if (!deptStatus.org_parent) {
      console.error(
        `[Status Hierarchy] Dept status ${deptStatus.id} (${deptStatus.name}) has a broken org mapping: ${deptStatus.hierarchy_error ?? 'org parent missing'}`,
      )
      return null
    }
    return normalizeTaskStatusDefinition(deptStatus.org_parent)
  }

  if (!deptStatus.org_status_id) {
    console.error(
      `[Status Hierarchy] Dept status ${deptStatus.id} (${deptStatus.name}) is missing org_status_id — the CHECK constraint should prevent this row.`,
    )
    return null
  }

  const { data, error } = await supabase
    .from('task_status_definitions')
    .select('*')
    .eq('id', deptStatus.org_status_id)
    .single()

  if (error) {
    console.error(`[Status Hierarchy] Could not fetch org parent for ${deptStatus.id}:`, error)
    return null
  }

  return normalizeTaskStatusDefinition(data)
}

export async function getStatusHierarchy({ departmentId = null } = {}) {
  // Server-side join (BLW-08): one RPC returns org statuses plus dept
  // statuses pre-joined with their org parent. Broken mappings arrive as
  // hierarchy_error instead of silently resolving to null.
  const { data, error } = await supabase.rpc('get_task_status_hierarchy', {
    p_department_id: departmentId,
  })

  if (error) throw error

  const hierarchy = {
    orgStatuses: (data?.org_statuses ?? []).map(normalizeTaskStatusDefinition),
    deptStatuses: (data?.dept_statuses ?? []).map((status) => ({
      ...normalizeTaskStatusDefinition(status),
      org_parent: normalizeTaskStatusDefinition(status.org_parent),
    })),
    byOrgParent: {},
    errors: [],
  }

  for (const deptStatus of hierarchy.deptStatuses) {
    if (deptStatus.hierarchy_error) {
      console.error(
        `[Status Hierarchy] Dept status ${deptStatus.id} (${deptStatus.name}): ${deptStatus.hierarchy_error}`,
      )
      hierarchy.errors.push({ statusId: deptStatus.id, error: deptStatus.hierarchy_error })
      continue
    }
    const parentId = deptStatus.org_status_id
    if (!hierarchy.byOrgParent[parentId]) {
      hierarchy.byOrgParent[parentId] = []
    }
    hierarchy.byOrgParent[parentId].push(deptStatus)
  }

  return hierarchy
}

export function isOrgStatus(status) {
  return status?.is_org_status === true
}

export async function createTaskStatus(definition) {
  if (!definition.department_id && !definition.is_org_status) {
    throw new Error('Department-scoped status must specify org_status_id parent (or be org-wide)')
  }

  const payload = {
    name: definition.name?.trim(),
    color: toHex(definition.color ?? '#7A7D86'),
    category: definition.category,
    department_id: definition.department_id ?? null,
    sort_order: definition.sort_order ?? 0,
    is_default: Boolean(definition.is_default),
    active: definition.active ?? true,
    legacy_key: definition.legacy_key ?? null,
    is_org_status: Boolean(definition.is_org_status),
    org_status_id: definition.org_status_id ?? null,
  }

  // CHECK constraint will enforce: org_status_id must be present for non-org statuses
  const { data, error } = await supabase.from('task_status_definitions').insert(payload).select().single()
  if (error) {
    if (error.message?.includes('hierarchy_check')) {
      throw new Error('All non-org statuses must map to an org status parent. Provide org_status_id.')
    }
    throw error
  }
  return normalizeTaskStatusDefinition(data)
}

export async function updateTaskStatusDefinition(statusId, updates) {
  const payload = { ...updates }
  if (payload.color) payload.color = toHex(payload.color)

  const { data, error } = await supabase
    .from('task_status_definitions')
    .update(payload)
    .eq('id', statusId)
    .select()
    .single()

  if (error) throw error
  return normalizeTaskStatusDefinition(data)
}

export async function archiveTaskStatus(statusId) {
  return updateTaskStatusDefinition(statusId, { active: false })
}

export async function reorderTaskStatuses(statuses = []) {
  const updates = statuses.map((status, index) => ({
    id: status.id,
    sort_order: index + 1,
  }))
  const { error } = await supabase
    .rpc('reorder_task_statuses', { p_status_updates: JSON.stringify(updates) })

  if (error) throw error
}

export async function getDefaultTaskStatusId({ departmentId = null, preferredCategory = STATUS_CATEGORIES.OPEN } = {}) {
  const statuses = await listTaskStatuses({ departmentId, includeInactive: false })
  return selectDefaultStatus(statuses, preferredCategory)?.id ?? null
}

export async function getCategoryStatusId({ departmentId = null, category }) {
  const statuses = await listTaskStatuses({ departmentId, includeInactive: false })
  return selectCategoryStatus(statuses, category)?.id ?? selectDefaultStatus(statuses)?.id ?? null
}

export {
  selectActiveTaskStatuses,
  selectDefaultStatus,
  selectCategoryStatus,
  selectStatusWorkflowPreview,
  selectTaskCountsByCategory,
  selectTaskStatusUsageCounts,
  selectOrgStatuses,
  selectDeptStatuses,
  selectStatusByOrgParent,
  selectHierarchyMap,
  dedupeTaskStatuses,
}
