import { supabase } from '../../../lib/supabase'
import { normalizeTaskRows } from '../../../lib/taskStatuses'

// Personal List = private tasks (tasks.is_personal = true) + pins of team
// tasks (personal_list_tasks). A pin is a second location: the task keeps
// living in its original space/list, and its visibility still flows through
// the tasks RLS policies — losing access to the task empties the pin.

const TASK_SELECT = `
  id, title, description, priority, status, status_id, due_date, created_at,
  department_id, assignee_id, created_by, task_type, sprint_id, list_id,
  source, meeting_id, parent_task_id, completed_at, is_personal,
  subtask_count:tasks!parent_task_id(count),
  status_definition:task_status_definitions!status_id(
    id, name, color, category, legacy_key, department_id
  ),
  assignee:users!assignee_id(id, name, avatar_url),
  creator:users!created_by(id, name),
  space:departments(id, name, color)
`

// Private tasks the user owns (created or assigned). Unlike getPersonalTasks
// in tasks.js (assignee-only), this includes unassigned drafts the user
// created, which is the Personal List's staging-area use case.
export async function getPersonalTasks(userId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('is_personal', true)
    .or(`created_by.eq.${userId},assignee_id.eq.${userId}`)
    .is('parent_task_id', null)
    .is('deleted_at', null)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return normalizeTaskRows(data ?? [])
}

// Team tasks pinned into the Personal List. Pins whose task the user can no
// longer see (RLS) or that were soft-deleted come back with task = null /
// deleted_at set and are dropped.
export async function getPinnedTasks(userId) {
  const { data, error } = await supabase
    .from('personal_list_tasks')
    .select(`task_id, sort_order, created_at, task:tasks(${TASK_SELECT})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  const tasks = (data ?? [])
    .map((pin) => pin.task)
    .filter((task) => task && !task.deleted_at)
  return normalizeTaskRows(tasks)
}

export async function addTaskToPersonalList(userId, taskId) {
  const { error } = await supabase
    .from('personal_list_tasks')
    .upsert({ user_id: userId, task_id: taskId }, { onConflict: 'user_id,task_id' })

  if (error) throw error
}

export async function removeTaskFromPersonalList(userId, taskId) {
  const { error } = await supabase
    .from('personal_list_tasks')
    .delete()
    .eq('user_id', userId)
    .eq('task_id', taskId)

  if (error) throw error
}

// Search accessible team tasks to pin. RLS scopes the result to what the
// user can already see; personal tasks are excluded (they're in the list
// natively) as are subtasks.
export async function searchPinnableTasks(term) {
  let query = supabase
    .from('tasks')
    .select(`
      id, title, due_date,
      status_definition:task_status_definitions!status_id(name, color),
      space:departments(id, name, color)
    `)
    .eq('is_personal', false)
    .is('parent_task_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10)

  const trimmed = term?.trim()
  if (trimmed) {
    query = query.ilike('title', `%${trimmed.replace(/[%_]/g, '\\$&')}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}
