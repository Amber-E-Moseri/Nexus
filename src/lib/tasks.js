import { supabase } from './supabase'
import { recordActivity } from './activityFeed'
import {
  STATUS_CATEGORIES,
  getCategoryStatusId,
  isTaskActionable,
  normalizeTaskRow,
  normalizeTaskRows,
} from './taskStatuses'

const TASK_STATUS_SELECT = `
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
  id, title, status, status_id, priority, due_date, task_type, sprint_id,
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
      *,
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      department:departments(id, name, color),
      assignee:users!assignee_id(id, name, avatar_url),
      subtasks:tasks!parent_task_id(${SUBTASK_SELECT}),
      comments:task_comments(count),
      files:task_files(count),
      dependencies:task_dependencies!task_id(count)
    `)
    .eq('department_id', departmentId)
    .eq('is_personal', false)
    .is('parent_task_id', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function getSprintTasks(sprintId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      department:departments(id, name, color),
      assignee:users!assignee_id(id, name, avatar_url),
      subtasks:tasks!parent_task_id(${SUBTASK_SELECT}),
      comments:task_comments(count),
      files:task_files(count),
      dependencies:task_dependencies!task_id(count)
    `)
    .eq('sprint_id', sprintId)
    .eq('task_type', 'sprint')
    .is('parent_task_id', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function getPersonalTasks(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`*, ${TASK_STATUS_SELECT}, ${TASK_LIST_SELECT}, department:departments(id, name, color), subtasks:tasks!parent_task_id(${SUBTASK_SELECT})`)
    .eq('assignee_id', userId)
    .eq('is_personal', true)
    .is('parent_task_id', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function getMyTasks(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      ${TASK_STATUS_SELECT},
      ${TASK_LIST_SELECT},
      department:departments(id, name, color),
      assignee:users!assignee_id(id, name, avatar_url),
      subtasks:tasks!parent_task_id(${SUBTASK_SELECT}),
      comments:task_comments(count),
      files:task_files(count)
    `)
    .eq('assignee_id', userId)
    .eq('is_personal', false)
    .is('parent_task_id', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(200)

  if (error) throw error
  return normalizeTaskResultList(data)
}

export async function getFlockTasks(pastorId) {
  const { data, error } = await supabase
    .from('pastor_members')
    .select(`
      member:users!member_id(
        tasks:actionable_tasks!assignee_id(
          *,
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

  const tasks = (data ?? []).flatMap((assignment) => assignment.member?.tasks ?? [])
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

export async function createTask(taskData) {
  const payload = buildTaskPayload(taskData)
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
      *,
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
      *,
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

export async function deleteTask(taskId) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
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

export async function getLinkableTasks({ departmentId = null, sprintId = null, excludeTaskId }) {
  let query = supabase
    .from('tasks')
    .select(`
      id, title, status, status_id, priority,
      ${TASK_STATUS_SELECT}
    `)
    .eq('is_personal', false)
    .is('parent_task_id', null)
    .neq('id', excludeTaskId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (sprintId) {
    query = query.eq('sprint_id', sprintId).eq('task_type', 'sprint')
  } else {
    query = query.eq('department_id', departmentId)
  }

  const { data, error } = await query
  if (error) throw error
  return normalizeTaskResultList(data).filter(isTaskActionable)
}
