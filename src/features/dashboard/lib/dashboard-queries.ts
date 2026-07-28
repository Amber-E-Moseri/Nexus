import { supabase } from '../../../lib/supabase'

export interface DashboardPreset {
  widgets: string[]
}

export interface ActionItem {
  task_id: string
  task_title: string
  due_date: string | null
  priority: string | null
  status: string | null
  status_id: string | null
  meeting_id: string | null
  meeting_title: string | null
  assigner_name: string | null
  created_at: string
  is_overdue: boolean
}

export interface TeamWorkloadMember {
  user_id: string
  name: string
  task_count: number
  capacity: number
  utilization_percent: number
}

export interface PastoralMember {
  member_id: string
  name: string
  email: string
  attendance_percent: number
  last_meeting_date: string
  status: string
}

export interface AbsentMember {
  member_id: string
  name: string
  meetings_missed: number
  last_meeting_date: string
}

export interface ActivityHeatmapEntry {
  user_id: string
  name: string
  day_offset: number
  activity_count: number
}

export interface SprintVelocity {
  sprint_id: string
  sprint_name: string
  start_date: string
  end_date: string
  completed_count: number
  total_count: number
  completion_rate_percent: number
}

export interface TeamAvailabilityEntry {
  member_id: string
  name: string
  until: string | null
  reason: string | null
}

export interface PersonalReminder {
  id: string
  user_id: string
  note: string
  remind_at: string | null
  done: boolean
  created_at: string
  task_id: string | null
  task_title?: string | null
}

export async function getDashboardPresets(role: string): Promise<DashboardPreset> {
  const { data, error } = await supabase.rpc('get_dashboard_presets', { p_role: role })

  if (error) throw error
  return { widgets: data ?? [] }
}

export async function getUserActionItems(): Promise<ActionItem[]> {
  const { data, error } = await supabase.rpc('get_user_action_items')

  if (error) throw error
  return data ?? []
}

export async function getTeamWorkload(deptId: string): Promise<TeamWorkloadMember[]> {
  const { data, error } = await supabase.rpc('get_team_workload', { p_dept_id: deptId })

  if (error) throw error
  return data ?? []
}

export async function getPastoralMembers(pastorId: string): Promise<PastoralMember[]> {
  const { data, error } = await supabase.rpc('get_pastoral_members', { p_pastor_id: pastorId })

  if (error) throw error
  return data ?? []
}

export async function getAbsentMembers(deptId: string, days: number = 7): Promise<AbsentMember[]> {
  const { data, error } = await supabase.rpc('get_absent_members', {
    p_dept_id: deptId,
    p_days: days,
  })

  if (error) throw error
  return data ?? []
}

export async function getTeamActivityHeatmap(deptId: string): Promise<ActivityHeatmapEntry[]> {
  const { data, error } = await supabase.rpc('get_team_activity_heatmap', { p_dept_id: deptId })

  if (error) throw error
  return data ?? []
}

export async function getTeamVelocity(deptId: string, sprintCount: number = 4): Promise<SprintVelocity[]> {
  const { data, error } = await supabase.rpc('get_team_velocity', {
    p_dept_id: deptId,
    p_sprint_count: sprintCount,
  })

  if (error) throw error
  return data ?? []
}

export async function getTeamAvailability(deptId: string): Promise<TeamAvailabilityEntry[]> {
  const { data, error } = await supabase.rpc('get_team_availability', { p_dept_id: deptId })

  if (error) throw error
  return data ?? []
}

export async function getPersonalReminders(userId: string): Promise<PersonalReminder[]> {
  const { data, error } = await supabase
    .from('personal_reminders')
    .select('id, note, remind_at, task_id')
    .eq('user_id', userId)
    .order('remind_at', { ascending: true, nullsFirst: false })

  if (error) throw error

  const reminders = (data ?? []) as PersonalReminder[]
  const withTaskIds = reminders.filter(r => r.task_id)
  if (withTaskIds.length > 0) {
    const taskIds = [...new Set(withTaskIds.map(r => r.task_id as string))]
    const { data: tasks } = await supabase.from('tasks').select('id, title').in('id', taskIds)
    const taskMap = new Map((tasks ?? []).map(t => [t.id, t.title]))
    return reminders.map(r => ({ ...r, task_title: r.task_id ? taskMap.get(r.task_id) ?? null : null }))
  }

  return reminders.map(r => ({ ...r, task_title: null }))
}

export async function createPersonalReminder(userId: string, note: string, remindAt: string | null, taskId?: string | null): Promise<PersonalReminder> {
  const { data, error } = await supabase
    .from('personal_reminders')
    .insert({ user_id: userId, note, remind_at: remindAt, task_id: taskId ?? null })
    .select()

  if (error) throw error
  return data?.[0]
}

export async function completePersonalReminder(reminderId: string): Promise<void> {
  const { error } = await supabase
    .from('personal_reminders')
    .delete()
    .eq('id', reminderId)

  if (error) throw error
}
