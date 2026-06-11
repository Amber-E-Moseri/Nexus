import { supabase } from './supabase'
import { getDefaultTaskStatusId, normalizeTaskRows } from './taskStatuses'

export async function getDeptMeetings(departmentId) {
  if (!departmentId) return []

  const { data, error } = await supabase
    .from('meetings')
    .select(`
      id,
      title,
      department_id,
      date,
      meeting_type,
      agenda,
      minutes,
      transcript,
      summary,
      zoom_join_url,
      drive_url,
      created_by,
      created_at,
      creator:users!created_by(id, name),
      attendance:meeting_attendance(user_id, status)
    `)
    .eq('department_id', departmentId)
    .order('date', { ascending: false })
    .limit(50)

  if (error) throw error
  return data ?? []
}

export async function createMeeting(meetingData) {
  const { attendanceUserIds = [], ...payload } = meetingData

  const { data, error } = await supabase
    .from('meetings')
    .insert(payload)
    .select(`
      id,
      title,
      department_id,
      date,
      meeting_type,
      agenda,
      minutes,
      transcript,
      summary,
      zoom_join_url,
      drive_url,
      created_by,
      created_at,
      creator:users!created_by(id, name)
    `)
    .single()

  if (error) throw error

  if (attendanceUserIds.length > 0) {
    const { error: attendanceError } = await supabase.from('meeting_attendance').insert(
      attendanceUserIds.map((userId) => ({
        meeting_id: data.id,
        user_id: userId,
        status: 'present',
      })),
    )

    if (attendanceError) throw attendanceError
  }

  return {
    ...data,
    attendance: attendanceUserIds.map((userId) => ({ user_id: userId, status: 'present' })),
  }
}

export async function updateMeeting(meetingId, updates) {
  const { data, error } = await supabase
    .from('meetings')
    .update(updates)
    .eq('id', meetingId)
    .select(`
      id,
      title,
      department_id,
      date,
      meeting_type,
      agenda,
      minutes,
      transcript,
      summary,
      zoom_join_url,
      drive_url,
      created_by,
      created_at,
      creator:users!created_by(id, name)
    `)
    .single()

  if (error) throw error
  return data
}

export async function createTasksFromActionItems(meetingId, departmentId, actionItems, createdBy) {
  if (!actionItems.length) return []
  const defaultStatusId = await getDefaultTaskStatusId({ departmentId })

  const tasks = actionItems.map((item) => ({
    title: item.title,
    description: item.description || null,
    assignee_id: item.assigneeId || null,
    due_date: item.dueDate || null,
    department_id: departmentId,
    meeting_id: meetingId,
    source: 'meeting',
    status_id: defaultStatusId,
    priority: 'medium',
    created_by: createdBy,
    is_personal: false,
  }))

  const { data, error } = await supabase
    .from('tasks')
    .insert(tasks)
    .select(`
      *,
      status_id,
      status_definition:task_status_definitions!status_id(
        id, name, color, category, department_id, sort_order, is_default, active, legacy_key
      ),
      assignee:users!assignee_id(id, name, avatar_url)
    `)

  if (error) throw error
  return normalizeTaskRows(data)
}

export async function getMeetingTasks(meetingId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      status,
      status_id,
      status_definition:task_status_definitions!status_id(
        id, name, color, category, department_id, sort_order, is_default, active, legacy_key
      ),
      priority,
      due_date,
      completed_at,
      created_at,
      assignee:users!assignee_id(id, name, avatar_url)
    `)
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return normalizeTaskRows(data)
}
