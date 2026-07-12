import { supabase } from '../../../lib/supabase'

export async function getTaskFollowers(taskId) {
  const { data, error } = await supabase
    .from('task_follows')
    .select('user_id, user:users!user_id(id, name)')
    .eq('task_id', taskId)
  if (error) throw error
  return data ?? []
}

export async function isFollowingTask(taskId, userId) {
  const { data, error } = await supabase
    .from('task_follows')
    .select('task_id')
    .eq('task_id', taskId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function followTask(taskId, userId) {
  const { error } = await supabase
    .from('task_follows')
    .upsert({ task_id: taskId, user_id: userId }, { onConflict: 'user_id,task_id' })

  if (error) throw error
}

export async function unfollowTask(taskId, userId) {
  const { error } = await supabase
    .from('task_follows')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', userId)

  if (error) throw error
}
