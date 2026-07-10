import { supabase } from '../../../lib/supabase'

const WIN_SELECT = `
  id, department_id, week_start, content, task_id, created_by, created_at, updated_at,
  author:users!created_by(id, name, avatar_url),
  task:tasks!task_id(id, title)
`

export async function listWins(departmentId, weekStartISO) {
  const { data, error } = await supabase
    .from('weekly_wins')
    .select(WIN_SELECT)
    .eq('department_id', departmentId)
    .eq('week_start', weekStartISO)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function addWin({ departmentId, weekStartISO, content, taskId = null, userId }) {
  const { data, error } = await supabase
    .from('weekly_wins')
    .insert({
      department_id: departmentId,
      week_start: weekStartISO,
      content: content.trim(),
      task_id: taskId,
      created_by: userId,
    })
    .select(WIN_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function updateWin(winId, patch) {
  const { data, error } = await supabase
    .from('weekly_wins')
    .update(patch)
    .eq('id', winId)
    .select(WIN_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function deleteWin(winId) {
  const { error } = await supabase.from('weekly_wins').delete().eq('id', winId)
  if (error) throw error
}

// Candidates for the optional "link a task" picker: department tasks
// completed during the sheet's week.
export async function listCompletedTasksForWeek(departmentId, weekStartISO, weekEndISO) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, completed_at')
    .eq('department_id', departmentId)
    .gte('completed_at', `${weekStartISO}T00:00:00`)
    .lte('completed_at', `${weekEndISO}T23:59:59`)
    .order('completed_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}
