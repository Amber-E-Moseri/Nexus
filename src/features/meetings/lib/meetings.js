import { supabase } from '../../../lib/supabase'
import { getDefaultTaskStatusId, normalizeTaskRows } from '../../../lib/taskStatuses.js'
import { recordActivity } from '../../../lib/activityFeed'

export async function getDeptMeetings(departmentId) {
  if (!departmentId) return []

  let query = supabase
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
      attendance:meeting_attendance(user_id, status),
      agendas(id, title, start_time, end_time, location, moderator_name, theme, created_by, agenda_items(id, segment, notes, duration_minutes, sort_order, is_pinned))
    `)

  if (departmentId !== 'all') {
    query = query.eq('department_id', departmentId)
  }

  const { data, error } = await query
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

  recordActivity('meeting_created', {
    entity_type: 'meeting',
    entity_id: data.id,
    entity_title: data.title,
    department_id: data.department_id,
  })

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

  recordActivity('meeting_updated', {
    entity_type: 'meeting',
    entity_id: data.id,
    entity_title: data.title,
    department_id: data.department_id,
  })

  return data
}

export async function deleteMeeting(meetingId) {
  if (!meetingId) throw new Error('Meeting ID is required')

  // Delete related records first (cascade cleanup)
  const { error: attendanceError } = await supabase
    .from('meeting_attendance')
    .delete()
    .eq('meeting_id', meetingId)

  if (attendanceError) throw new Error(`Failed to delete attendance records: ${attendanceError.message}`)

  // Delete related agendas
  const { error: agendaError } = await supabase
    .from('agendas')
    .delete()
    .eq('meeting_id', meetingId)

  if (agendaError) throw new Error(`Failed to delete agenda: ${agendaError.message}`)

  // Delete the meeting itself
  const { error: meetingError } = await supabase
    .from('meetings')
    .delete()
    .eq('id', meetingId)

  if (meetingError) throw new Error(`Failed to delete meeting: ${meetingError.message}`)

  recordActivity('meeting_deleted', {
    entity_type: 'meeting',
    entity_id: meetingId,
  })

  return { success: true, deletedMeetingId: meetingId }
}

export async function createTasksFromActionItems(meetingId, departmentId, actionItems, createdBy) {
  if (!actionItems.length) return []

  // Look up each assignee's department so tasks appear in their own space
  const assigneeIds = [...new Set(actionItems.map((i) => i.assigneeId).filter(Boolean))]
  const assigneeDeptMap = {}
  if (assigneeIds.length > 0) {
    const { data: userRows } = await supabase
      .from('users')
      .select('id, department_id')
      .in('id', assigneeIds)
    for (const u of userRows ?? []) {
      if (u.department_id) assigneeDeptMap[u.id] = u.department_id
    }
  }

  // Get default status IDs for each unique destination department
  const uniqueDeptIds = [...new Set([departmentId, ...Object.values(assigneeDeptMap)])]
  const statusIdByDept = {}
  await Promise.all(
    uniqueDeptIds.map(async (deptId) => {
      statusIdByDept[deptId] = await getDefaultTaskStatusId({ departmentId: deptId })
    }),
  )

  const tasks = actionItems.map((item) => {
    const destDeptId = item.assigneeId ? (assigneeDeptMap[item.assigneeId] ?? departmentId) : departmentId
    return {
      title: item.title,
      description: item.description || null,
      assignee_id: item.assigneeId || null,
      due_date: item.dueDate || null,
      department_id: destDeptId,
      meeting_id: meetingId,
      source: 'meeting',
      status_id: statusIdByDept[destDeptId] ?? statusIdByDept[departmentId] ?? null,
      priority: 'medium',
      created_by: createdBy,
      is_personal: false,
    }
  })

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

export async function recalculateAttendanceTrends(meetingId) {
  if (!meetingId) return null

  try {
    // Get all attendance records for this meeting
    const { data: attendanceRecords, error: attendanceError } = await supabase
      .from('meeting_attendance')
      .select('user_id, status')
      .eq('meeting_id', meetingId)

    if (attendanceError) throw attendanceError

    // Get all unique user_ids from this meeting
    const userIds = [...new Set(attendanceRecords?.map((r) => r.user_id) || [])]

    if (userIds.length === 0) return null

    // For each user, calculate attendance percentage across all meetings
    const trendUpdates = []

    for (const userId of userIds) {
      const { data: allUserAttendance, error: userAttendanceError } = await supabase
        .from('meeting_attendance')
        .select('status')
        .eq('user_id', userId)

      if (userAttendanceError) throw userAttendanceError

      const total = allUserAttendance?.length || 0
      if (total === 0) continue

      const presentCount = allUserAttendance.filter((a) => a.status === 'present').length
      const attendancePercentage = Math.round((presentCount / total) * 100)

      // Track if on watch list (< 75%)
      const onWatchList = attendancePercentage < 75

      trendUpdates.push({
        userId,
        attendancePercentage,
        onWatchList,
      })
    }

    // Update user records with new attendance percentage
    if (trendUpdates.length > 0) {
      const { error: updateError } = await supabase.from('users').upsert(
        trendUpdates.map((update) => ({
          id: update.userId,
          attendance_percentage: update.attendancePercentage,
          on_attendance_watch_list: update.onWatchList,
        })),
        { onConflict: 'id' },
      )

      if (updateError) throw updateError
    }

    return {
      usersUpdated: trendUpdates.length,
      watchListCount: trendUpdates.filter((u) => u.onWatchList).length,
      avgAttendancePercentage: Math.round(
        trendUpdates.reduce((sum, u) => sum + u.attendancePercentage, 0) /
          (trendUpdates.length || 1),
      ),
    }
  } catch (err) {
    console.error('Failed to recalculate attendance trends:', err)
    throw err
  }
}
