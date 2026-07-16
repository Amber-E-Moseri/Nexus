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
  due_date, completed_at, created_by, created_at,
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

const SUBTASK_SELECT = `
  id, title, description, status, status_id, priority, due_date, task_type, sprint_id,
  parent_task_id, assignee_id, sort_order,
  assignee:users!assignee_id(id, name, avatar_url),
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
      meeting:meetings!meeting_id(id, title),
      subtask_count:tasks!parent_task_id(count),
      comments:task_comments(count),
      files:task_files(count),
      dependencies:task_dependencies!task_id(count)
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
      subtask_count:tasks!parent_task_id(count),
      comments:task_comments(count),
      files:task_files(count),
      dependencies:task_dependencies!task_id(count)
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
  // Get sprint IDs for which user is a member
  const { data: sprintMemberships, error: sprintError } = await supabase
    .from('sprint_members')
    .select('sprint_id')
    .eq('user_id', userId)

  if (sprintError) throw sprintError

  const sprintIds = (sprintMemberships ?? []).map((m) => m.sprint_id)

  // Get space tasks (assigned to user, not personal, not in sprint)
  const { data: spaceTasks, error: spaceError } = await supabase
    .from('tasks')
    .select(`
      ${TASK_COLS},
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      department:departments(id, name, color),
      assignee:users!assignee_id(id, name, avatar_url),
      subtask_count:tasks!parent_task_id(count),
      comments:task_comments(count),
      files:task_files(count)
    `)
    .eq('assignee_id', userId)
    .eq('is_personal', false)
    .is('sprint_id', null)
    .is('parent_task_id', null)
    .is('deleted_at', null)

  if (spaceError) throw spaceError

  // Get personal tasks (assigned to user)
  const { data: personalTasks, error: personalError } = await supabase
    .from('tasks')
    .select(`
      ${TASK_COLS},
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      department:departments(id, name, color),
      assignee:users!assignee_id(id, name, avatar_url),
      subtask_count:tasks!parent_task_id(count),
      comments:task_comments(count),
      files:task_files(count)
    `)
    .eq('assignee_id', userId)
    .eq('is_personal', true)
    .is('parent_task_id', null)
    .is('deleted_at', null)

  if (personalError) throw personalError

  // Get sprint tasks (if user is a sprint member)
  let sprintTasks = []
  if (sprintIds.length > 0) {
    const { data: tasks, error: error2 } = await supabase
      .from('tasks')
      .select(`
        ${TASK_COLS},
        ${TASK_STATUS_SELECT},
        ${TASK_LIST_SELECT},
        department:departments(id, name, color),
        assignee:users!assignee_id(id, name, avatar_url),
        subtask_count:tasks!parent_task_id(count),
        comments:task_comments(count),
        files:task_files(count)
      `)
      .in('sprint_id', sprintIds)
      .eq('assignee_id', userId)
      .is('parent_task_id', null)
      .is('deleted_at', null)

    if (error2) throw error2
    sprintTasks = tasks ?? []
  }

  // Merge and deduplicate tasks (by ID) and sort by due_date
  const allTasks = [...(spaceTasks ?? []), ...(personalTasks ?? []), ...sprintTasks]
  const uniqueMap = new Map()
  for (const task of allTasks) {
    uniqueMap.set(task.id, task)
  }
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

  // deleted_at can't be filtered inside the nested member.tasks embed via
  // .is(), so drop soft-deleted rows client-side after the flatMap.
  const tasks = (data ?? [])
    .flatMap((assignment) => assignment.member?.tasks ?? [])
    .filter((task) => !task.deleted_at)
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
      subtasks:tasks!parent_task_id(${SUBTASK_SELECT})
    `)
    .single()

  if (error) throw error

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
      subtasks:tasks!parent_task_id(${SUBTASK_SELECT})
    `)
    .single()

  if (error) throw error
  const normalized = normalizeTaskResult(data)

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
  // Get current user's role
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = userData?.role

  // Only dept_lead and super_admin can do permanent delete
  if (permanent && !['dept_lead', 'super_admin'].includes(userRole)) {
    throw new Error('Only department leads and admins can permanently delete tasks. Your task has been soft-deleted instead.')
  }

  if (permanent) {
    // Hard delete - permanently remove from database
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    if (error) throw error
  } else {
    // Soft delete - mark as deleted
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId)
    if (error) throw error
  }
}

export async function hardDeleteTask(taskId) {
  // Permanently delete a task (requires permission check in deleteTask)
  return deleteTask(taskId, true)
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
