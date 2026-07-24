import { supabase } from '../../../lib/supabase'
import { recordActivity } from '../../../lib/activityFeed'
import {
  STATUS_CATEGORIES,
  getCategoryStatusId,
  isTaskActionable,
  normalizeTaskRow,
  normalizeTaskRows,
} from '../../../lib/taskStatuses'

// Explicit column list for the tasks table — avoids "sprint_id is ambiguous" when
// tasks is self-joined for subtasks (PostgREST bug with SELECT * on self-joins).
const TASK_COLS = `
  id, title, description, is_personal, status, priority,
  assignee_id, department_id, parent_task_id, meeting_id, goal_id,
  source, source_name, source_type, external_unique_key,
  due_date, due_time, completed_at, created_by, created_at,
  sprint_id, task_type, status_id, list_id, sort_order, deleted_at
`

const TASK_STATUS_SELECT = `
  status,
  status_id,
  status_definition:task_status_definitions!status_id(
    id, name, color, category, department_id, sort_order, is_default, active, legacy_key
  )
`

const TASK_LIST_SELECT = `
  list:lists(
    id,
    name,
    folder:folders(
      id,
      name
    )
  )
`

const ASSIGNEES_SELECT = `assignees:task_assignees(user_id, user:users(id, name, avatar_url))`

const SUBTASK_SELECT = `
  id, title, description, status, status_id, priority, due_date, task_type, sprint_id,
  parent_task_id, assignee_id, sort_order,
  assignee:users!assignee_id(id, name, avatar_url),
  ${ASSIGNEES_SELECT},
  ${TASK_STATUS_SELECT}
`

const TASK_COMMENT_SELECT = `
  id,
  body,
  created_at,
  assigned_to,
  assigned_at,
  resolved_by,
  resolved_at,
  mentions,
  author:users!author_id(id, name, avatar_url),
  assigned_user:users!assigned_to(id, name, avatar_url, role),
  resolved_user:users!resolved_by(id, name, avatar_url)
`

// A task is "delegated" if the current user created it for someone else.
// Requires a real assignee — an unassigned task (assignee_id null) is not
// delegated to anyone yet, just unclaimed.
export function isDelegatedTask(task, userId) {
  return Boolean(task.assignee_id) && task.created_by === userId && task.assignee_id !== userId
}

function normalizeTaskResult(task) {
  return normalizeTaskRow(task)
}

function normalizeTaskResultList(tasks = []) {
  return normalizeTaskRows(tasks)
}

function buildTaskPayload(taskData = {}) {
  const payload = { ...taskData }

  if ('statusId' in payload) {
    payload.status_id = payload.statusId
    delete payload.statusId
  }

  if ('assigneeId' in payload) {
    payload.assignee_id = payload.assigneeId
    delete payload.assigneeId
  }

  if ('assigneeIds' in payload) {
    delete payload.assigneeIds
  }

  if ('dueDate' in payload) {
    payload.due_date = payload.dueDate
    delete payload.dueDate
  }

  if ('statusCategory' in payload) {
    delete payload.statusCategory
  }

  if ('statusName' in payload) {
    delete payload.statusName
  }

  if ('department' in payload) {
    delete payload.department
  }

  if ('list' in payload) {
    delete payload.list
  }

  return payload
}

function applyCompletionMetadata(payload, statusCategory, currentCompletedAt = null) {
  if (statusCategory === STATUS_CATEGORIES.COMPLETED) {
    payload.completed_at = currentCompletedAt ?? new Date().toISOString()
  }

  if (statusCategory && statusCategory !== STATUS_CATEGORIES.COMPLETED) {
    payload.completed_at = null
  }
}

export async function getDeptTasks(departmentId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      ${TASK_COLS},
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      department:departments(id, name, color),
      assignee:users!assignee_id(id, name, avatar_url),
      ${ASSIGNEES_SELECT},
      subtask_count:tasks!parent_task_id(count)
    `)
    .eq('department_id', departmentId)
    .eq('is_personal', false)
    .is('parent_task_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function getSprintTasks(sprintId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      ${TASK_COLS},
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      department:departments(id, name, color),
      assignee:users!assignee_id(id, name, avatar_url),
      subtask_count:tasks!parent_task_id(count)
    `)
    .eq('sprint_id', sprintId)
    .eq('task_type', 'sprint')
    .is('parent_task_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function getPersonalTasks(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`${TASK_COLS}, ${TASK_STATUS_SELECT}, ${TASK_LIST_SELECT}, department:departments(id, name, color), subtask_count:tasks!parent_task_id(count)`)
    .eq('assignee_id', userId)
    .eq('is_personal', true)
    .is('parent_task_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function getMyTasks(userId) {
  // Two-step: RPC returns all task IDs for primary + secondary assignees (task_assignees junction),
  // then fetch full rows with embeds. Falls back to empty on RPC error (migration may not be pushed yet).
  const { data: rpcIds, error: rpcError } = await supabase
    .rpc('get_my_task_ids', { p_user_id: userId })

  let taskIds = null
  if (!rpcError && rpcIds) {
    taskIds = rpcIds.map((r) => r.task_id ?? r)
  }

  const MY_TASK_SELECT = `
    ${TASK_COLS},
    ${TASK_STATUS_SELECT},
    ${TASK_LIST_SELECT},
    ${ASSIGNEES_SELECT},
    department:departments(id, name, color),
    assignee:users!assignee_id(id, name, avatar_url),
    subtask_count:tasks!parent_task_id(count)
  `

  if (taskIds !== null && taskIds.length > 0) {
    const { data, error } = await supabase
      .from('tasks')
      .select(MY_TASK_SELECT)
      .in('id', taskIds)
      .is('parent_task_id', null)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(200)

    if (error) throw error
    return normalizeTaskResultList(data ?? [])
  }

  if (taskIds !== null) return [] // RPC returned empty list

  // Fallback: direct assignee_id queries (pre-migration or RPC unavailable)
  const { data: sprintMemberships } = await supabase
    .from('sprint_members').select('sprint_id').eq('user_id', userId)
  const sprintIds = (sprintMemberships ?? []).map((m) => m.sprint_id)

  const queries = [
    supabase.from('tasks').select(MY_TASK_SELECT)
      .eq('assignee_id', userId).eq('is_personal', false)
      .is('sprint_id', null).is('parent_task_id', null).is('deleted_at', null),
    supabase.from('tasks').select(MY_TASK_SELECT)
      .eq('assignee_id', userId).eq('is_personal', true)
      .is('parent_task_id', null).is('deleted_at', null),
  ]
  if (sprintIds.length > 0) {
    queries.push(
      supabase.from('tasks').select(MY_TASK_SELECT)
        .in('sprint_id', sprintIds).eq('assignee_id', userId)
        .is('parent_task_id', null).is('deleted_at', null),
    )
  }

  const results = await Promise.all(queries)
  const allTasks = results.flatMap((r) => r.data ?? [])
  const uniqueMap = new Map()
  for (const task of allTasks) uniqueMap.set(task.id, task)
  const uniqueTasks = Array.from(uniqueMap.values())
  uniqueTasks.sort((a, b) => {
    const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity
    const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity
    return aDate - bDate
  })
  return normalizeTaskResultList(uniqueTasks.slice(0, 200))
}

export async function getFlockTasks(pastorId) {
  const { data, error } = await supabase
    .from('pastor_members')
    .select(`
      member:users!member_id(
        id,
        tasks:tasks!assignee_id(
          ${TASK_COLS},
          subtask_count:tasks!parent_task_id(count),
          ${TASK_STATUS_SELECT},
          ${TASK_LIST_SELECT},
          assignee:users!assignee_id(id, name, avatar_url),
          department:departments(id, name, color)
        )
      )
    `)
    .eq('pastor_id', pastorId)
    .order('due_date', { ascending: true, nullsFirst: false, foreignTable: 'member.tasks' })
    .limit(200, { foreignTable: 'member.tasks' })

  if (error) throw error

  // Preserve the member_id from each pastor_members row so the UI can
  // correctly bucket tasks per flock member without relying on assignee_id
  // (which may differ for sprint tasks or co-assigned tasks).
  const tasks = (data ?? [])
    .flatMap((assignment) =>
      (assignment.member?.tasks ?? []).map((t) => ({
        ...t,
        _flock_member_id: assignment.member?.id,
      }))
    )
    .filter((task) => !task.deleted_at && !task.parent_task_id)
  return normalizeTaskResultList(tasks)
}

export async function getTaskById(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      assignee:users!assignee_id(id, name, avatar_url),
      ${ASSIGNEES_SELECT},
      subtasks:tasks!parent_task_id(${SUBTASK_SELECT}),
      department:departments(id, name, color)
    `)
    .eq('id', taskId)
    .single()

  if (error) throw error
  return normalizeTaskResult(data)
}

// Lazy-load subtasks for a single task. List queries only return counts
// (subtask_count); detail views call this on open/expand.
export async function getSubtasks(parentTaskId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(SUBTASK_SELECT)
    .eq('parent_task_id', parentTaskId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function createTask(taskData) {
  const payload = buildTaskPayload(taskData)
  const subtasksToCreate = payload.subtasks || []
  delete payload.subtasks

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw authError
  if (!user) throw new Error('You must be signed in to create a task.')

  payload.created_by = payload.created_by ?? user.id

  if (!payload.status_id) {
    payload.status_id = await getCategoryStatusId({
      departmentId: payload.is_personal || payload.sprint_id ? null : payload.department_id ?? null,
      category: STATUS_CATEGORIES.OPEN,
    })
  }

  applyCompletionMetadata(payload, taskData.statusCategory)

  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select(`
      ${TASK_COLS},
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      department:departments(id, name, color),
      assignee:users!assignee_id(id, name, avatar_url),
      ${ASSIGNEES_SELECT},
      subtasks:tasks!parent_task_id(${SUBTASK_SELECT})
    `)
    .single()

  if (error) throw error

  // Sync junction table for multi-assignee. assigneeIds may be passed alongside
  // assignee_id; if absent, fall back to the single assignee_id.
  const assigneeIds = taskData.assigneeIds ?? (payload.assignee_id ? [payload.assignee_id] : [])
  if (assigneeIds.length > 0) {
    await supabase.from('task_assignees').upsert(
      assigneeIds.map((uid) => ({ task_id: data.id, user_id: uid })),
      { onConflict: 'task_id,user_id' },
    )
  }

  recordActivity('task_created', {
    entity_type: 'task',
    entity_id: data.id,
    entity_title: data.title,
    department_id: data.department_id,
    sprint_id: data.sprint_id,
  })

  if (subtasksToCreate.length > 0) {
    const subtaskPayloads = subtasksToCreate.map(title => ({
      title: title.trim(),
      parent_task_id: data.id,
      department_id: data.department_id,
      status: 'open',
      created_by: user.id,
    }))

    const { data: subtasksData, error: subtasksError } = await supabase
      .from('tasks')
      .insert(subtaskPayloads)
      .select(`*, ${TASK_STATUS_SELECT}`)

    if (!subtasksError && subtasksData) {
      data.subtasks = normalizeTaskResultList(subtasksData)
    }
  }

  return normalizeTaskResult(data)
}

export async function updateTask(taskId, updates, actorId = null) {
  const { data: existingTask, error: existingTaskError } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      assignee_id,
      created_by,
      due_date,
      status,
      department_id,
      sprint_id,
      parent_task_id,
      ${TASK_STATUS_SELECT}
    `)
    .eq('id', taskId)
    .single()

  if (existingTaskError) throw existingTaskError

  const patch = buildTaskPayload(updates)
  applyCompletionMetadata(patch, updates.statusCategory, updates.completed_at)

  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', taskId)
    .select(`
      ${TASK_COLS},
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      department:departments(id, name, color),
      assignee:users!assignee_id(id, name, avatar_url),
      ${ASSIGNEES_SELECT},
      subtasks:tasks!parent_task_id(${SUBTASK_SELECT})
    `)
    .single()

  if (error) throw error
  const normalized = normalizeTaskResult(data)

  // Sync junction table when assigneeIds is explicitly provided.
  if (Array.isArray(updates.assigneeIds)) {
    const ids = updates.assigneeIds
    await supabase.from('task_assignees').delete().eq('task_id', taskId)
    if (ids.length > 0) {
      await supabase.from('task_assignees').insert(ids.map((uid) => ({ task_id: taskId, user_id: uid })))
    }
  }

  // Item 7: notify parent-task assignees when a subtask is marked completed.
  const isNowCompleted = updates.statusCategory === STATUS_CATEGORIES.COMPLETED
  const wasAlreadyCompleted = existingTask.status_definition?.category === STATUS_CATEGORIES.COMPLETED
  if (isNowCompleted && !wasAlreadyCompleted && existingTask.parent_task_id && actorId) {
    const { createNotification } = await import('../../notifications/lib/notifications')
    const { data: parentAssignees } = await supabase
      .from('task_assignees')
      .select('user_id')
      .eq('task_id', existingTask.parent_task_id)
    const { data: parentTask } = await supabase.from('tasks').select('title').eq('id', existingTask.parent_task_id).single()
    for (const row of parentAssignees ?? []) {
      if (row.user_id !== actorId) {
        createNotification(row.user_id, 'subtask_completed', {
          taskId,
          parentTaskId: existingTask.parent_task_id,
          title: existingTask.title,
          parentTitle: parentTask?.title ?? '',
        }).catch(() => {})
      }
    }
  }

  if (actorId) {
    const nextAssigneeId = 'assignee_id' in updates ? updates.assignee_id ?? null : normalized.assignee_id ?? null
    if (nextAssigneeId && nextAssigneeId !== existingTask.assignee_id) {
      void recordActivity('task_assigned', {
        task_id: normalized.id,
        assignee_id: nextAssigneeId,
        actor_id: actorId,
        task_title: normalized.title,
        department_id: normalized.department_id,
        sprint_id: normalized.sprint_id ?? null,
      })
    }

    const oldStatus = existingTask.status_definition?.name ?? existingTask.status
    const newStatus = normalized.status_definition?.name ?? normalized.status
    if (oldStatus !== newStatus) {
      void recordActivity('task_status_changed', {
        task_id: normalized.id,
        assignee_id: normalized.assignee_id ?? null,
        actor_id: actorId,
        task_title: normalized.title,
        old_status: oldStatus,
        new_status: newStatus,
        department_id: normalized.department_id,
      })
    }

    const oldDue = existingTask.due_date ?? null
    const newDue = normalized.due_date ?? null
    if (oldDue !== newDue) {
      void recordActivity('task_due_changed', {
        task_id: normalized.id,
        assignee_id: normalized.assignee_id ?? null,
        actor_id: actorId,
        task_title: normalized.title,
        old_due: oldDue,
        new_due: newDue,
        department_id: normalized.department_id,
      })
    }
  }

  return normalized
}

export async function deleteTask(taskId, permanent = false) {
  if (permanent) {
    // Hard delete via RPC — requires the task already be in trash and
    // authorizes narrowly (super_admin/regional_secretary/dept_lead/creator).
    const { error } = await supabase.rpc('hard_delete_task', { p_task_id: taskId })
    if (error) throw error
  } else {
    // Soft delete via RPC — bypasses tasks_update WITH CHECK entirely.
    const { error } = await supabase.rpc('soft_delete_task', { p_task_id: taskId })
    if (error) throw error
  }
}

export async function hardDeleteTask(taskId) {
  // Permanently delete a task (requires task already be in trash; RPC authorizes)
  return deleteTask(taskId, true)
}

export async function restoreTask(taskId) {
  const { error } = await supabase.rpc('restore_task', { p_task_id: taskId })
  if (error) throw error
}

export async function getTrashTasks() {
  const { data, error } = await supabase.rpc('get_trash_tasks')
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return rows

  // get_trash_tasks() returns raw `tasks` rows (setof public.tasks, no
  // joins) — enrich with department/creator names in a couple of batched
  // follow-up queries so the Trash page doesn't have to show bare UUIDs.
  const departmentIds = [...new Set(rows.map((t) => t.department_id).filter(Boolean))]
  const userIds = [...new Set(rows.flatMap((t) => [t.created_by, t.assignee_id]).filter(Boolean))]

  const [{ data: departments }, { data: users }] = await Promise.all([
    departmentIds.length
      ? supabase.from('departments').select('id, name, color').in('id', departmentIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from('users').select('id, name, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [] }),
  ])

  const deptById = new Map((departments ?? []).map((d) => [d.id, d]))
  const userById = new Map((users ?? []).map((u) => [u.id, u]))

  return rows.map((t) => ({
    ...t,
    department: t.department_id ? deptById.get(t.department_id) ?? null : null,
    creator: t.created_by ? userById.get(t.created_by) ?? null : null,
    assignee: t.assignee_id ? userById.get(t.assignee_id) ?? null : null,
  }))
}

// --- Archive -------------------------------------------------------------
// Weekly (space tasks) / biweekly (personal tasks) auto-archive of
// completed tasks, plus manual archive/unarchive. Mirrors the Trash
// functions above: archived_at is RLS-hidden from normal reads (see
// 20270729000002_task_archive_rls.sql), so access goes through
// SECURITY DEFINER RPCs.

export async function archiveTask(taskId) {
  const { error } = await supabase.rpc('archive_task', { p_task_id: taskId })
  if (error) throw error
}

export async function unarchiveTask(taskId) {
  const { error } = await supabase.rpc('unarchive_task', { p_task_id: taskId })
  if (error) throw error
}

export async function getArchivedTasks() {
  const { data, error } = await supabase.rpc('get_archived_tasks')
  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return rows

  const departmentIds = [...new Set(rows.map((t) => t.department_id).filter(Boolean))]
  const userIds = [...new Set(rows.flatMap((t) => [t.created_by, t.assignee_id]).filter(Boolean))]

  const [{ data: departments }, { data: users }] = await Promise.all([
    departmentIds.length
      ? supabase.from('departments').select('id, name, color').in('id', departmentIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from('users').select('id, name, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [] }),
  ])

  const deptById = new Map((departments ?? []).map((d) => [d.id, d]))
  const userById = new Map((users ?? []).map((u) => [u.id, u]))

  return rows.map((t) => ({
    ...t,
    department: t.department_id ? deptById.get(t.department_id) ?? null : null,
    creator: t.created_by ? userById.get(t.created_by) ?? null : null,
    assignee: t.assignee_id ? userById.get(t.assignee_id) ?? null : null,
  }))
}

// --- Subtasks ----------------------------------------------------------------
// Subtasks are tasks with parent_task_id set. These helpers give them full
// property parity with parent tasks (assignee, due date, priority, status,
// description) while reusing the existing createTask/updateTask paths.

export async function createSubtask(parentTaskId, fields = {}) {
  const {
    title,
    description = null,
    assignee_id = null,
    due_date = null,
    priority = 'medium',
    statusId = null,
    statusCategory = STATUS_CATEGORIES.OPEN,
    departmentId = null,
    sprintId = null,
    taskType = 'space',
    sortOrder = null,
    createdBy = null,
  } = fields

  const resolvedStatusId =
    statusId ??
    (await getCategoryStatusId({
      departmentId: sprintId ? null : departmentId,
      category: STATUS_CATEGORIES.OPEN,
    }))

  return createTask({
    title: typeof title === 'string' ? title.trim() : title,
    description: typeof description === 'string' ? description.trim() || null : description,
    parent_task_id: parentTaskId,
    department_id: departmentId ?? null,
    sprint_id: sprintId ?? null,
    is_personal: false,
    task_type: sprintId ? 'sprint' : taskType,
    statusId: resolvedStatusId,
    statusCategory,
    priority: priority ?? 'medium',
    assignee_id,
    due_date: due_date || null,
    sort_order: sortOrder ?? Date.now(),
    source: 'manual',
    created_by: createdBy ?? null,
  })
}

export async function updateSubtask(subtaskId, fields = {}, actorId = null) {
  return updateTask(subtaskId, fields, actorId)
}

export async function reorderSubtasks(orderedIds = []) {
  if (!orderedIds.length) return
  const updates = orderedIds.map((id, index) =>
    supabase.from('tasks').update({ sort_order: index }).eq('id', id),
  )
  const results = await Promise.all(updates)
  const failure = results.find((result) => result.error)
  if (failure?.error) throw failure.error
}

export async function getDeptMembers(departmentId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, avatar_url, role')
    .eq('department_id', departmentId)
    .order('name')

  if (error) throw error
  return data ?? []
}

// Org-wide roles (super_admin, regional_secretary) can assign a task to
// anyone, not just the selected space's members.
export async function getAllOrgMembers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, avatar_url, role')
    .eq('status', 'active')
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function getSprintMembers(sprintId) {
  const { data, error } = await supabase
    .from('sprint_members')
    .select('user:users(id, name, avatar_url, role, status)')
    .eq('sprint_id', sprintId)

  if (error) throw error

  return (data ?? [])
    .map((item) => item.user)
    .filter(Boolean)
    .filter((user) => user.status === 'active' || user.status == null)
}

export async function getFlockMembers(pastorId) {
  const { data: assignments, error: assignmentError } = await supabase
    .from('pastor_members')
    .select('member_id')
    .eq('pastor_id', pastorId)

  if (assignmentError) throw assignmentError
  const ids = (assignments ?? []).map((assignment) => assignment.member_id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('users')
    .select('id, name, avatar_url, role, department_id')
    .in('id', ids)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function getTaskComments(taskId) {
  const { data, error } = await supabase
    .from('task_comments')
    .select(TASK_COMMENT_SELECT)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createComment(taskId, body, authorId, actorId = null) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, body: body.trim(), author_id: authorId })
    .select(TASK_COMMENT_SELECT)
    .single()

  if (error) throw error

  const { data: taskInfo } = await supabase
    .from('tasks')
    .select('id, title, assignee_id')
    .eq('id', taskId)
    .maybeSingle()

  void recordActivity('comment_added', {
    task_id: taskId,
    comment_id: data.id,
    author_id: authorId,
    actor_id: actorId ?? authorId,
    task_title: taskInfo?.title ?? null,
    body_preview: body.trim().slice(0, 100),
    assignee_id: taskInfo?.assignee_id ?? null,
  })

  return data
}

export async function deleteComment(commentId) {
  const { error } = await supabase.from('task_comments').delete().eq('id', commentId)
  if (error) throw error
}

export async function getTaskFiles(taskId) {
  const { data, error } = await supabase
    .from('task_files')
    .select('id, name, url, drive_file_id, mime_type, size_bytes, created_at, uploaded_by')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function attachFileLink(taskId, name, url, uploadedBy) {
  const { data, error } = await supabase
    .from('task_files')
    .insert({
      task_id: taskId,
      name: name.trim(),
      url: url.trim(),
      uploaded_by: uploadedBy,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function removeTaskFile(fileId) {
  const { error } = await supabase.from('task_files').delete().eq('id', fileId)
  if (error) throw error
}

export async function getTaskDependencies(taskId) {
  const { data, error } = await supabase
    .from('task_dependencies')
    .select(`
      id, type, created_at,
      depends_on:tasks!depends_on_id(
        id, title, status, status_id, priority,
        ${TASK_STATUS_SELECT}
      )
    `)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function getTaskBlockers(taskId) {
  const { data, error } = await supabase
    .from('task_dependencies')
    .select(`
      id, type,
      task:tasks!task_id(
        id, title, status, status_id, priority,
        ${TASK_STATUS_SELECT}
      )
    `)
    .eq('depends_on_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function getTaskSubtasks(taskId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`${SUBTASK_SELECT}`)
    .eq('parent_task_id', taskId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function addDependency(taskId, dependsOnId, type = 'blocking', createdBy, actorId = null) {
  const { data, error } = await supabase
    .from('task_dependencies')
    .insert({ task_id: taskId, depends_on_id: dependsOnId, type, created_by: createdBy })
    .select()
    .single()

  if (error) throw error

  void recordActivity('dependency_added', {
    task_id: taskId,
    depends_on_id: dependsOnId,
    actor_id: actorId ?? createdBy ?? null,
    task_title: null,
    depends_on_title: null,
  })

  return data
}

export async function removeDependency(dependencyId) {
  const { error } = await supabase.from('task_dependencies').delete().eq('id', dependencyId)
  if (error) throw error
}

// The 50-row cap is a picker default, not a hard wall: pass `search` to
// filter server-side so any task is reachable by title (BLW-16).
export async function getLinkableTasks({ departmentId = null, sprintId = null, excludeTaskId, search = '' }) {
  let query = supabase
    .from('tasks')
    .select(`
      id, title, status, status_id, priority,
      ${TASK_STATUS_SELECT}
    `)
    .eq('is_personal', false)
    .is('parent_task_id', null)
    .is('deleted_at', null)
    .neq('id', excludeTaskId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`)
  }

  if (sprintId) {
    query = query.eq('sprint_id', sprintId).eq('task_type', 'sprint')
  } else {
    query = query.eq('department_id', departmentId)
  }

  const { data, error } = await query
  if (error) throw error
  return normalizeTaskResultList(data).filter(isTaskActionable)
}
