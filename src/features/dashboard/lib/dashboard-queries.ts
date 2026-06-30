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
