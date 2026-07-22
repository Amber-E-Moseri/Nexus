import { supabase } from '../../../lib/supabase'
import { getDefaultTaskStatusId, normalizeTaskRows } from '../../../lib/taskStatuses.js'
import { recordActivity } from '../../../lib/activityFeed'
import { addDays } from 'date-fns'
import { getNextOccurrenceDate } from './recurrence'

export const MEETINGS_PAGE_SIZE = 50

// Strip annotations like "2026-07-19 (before Saturday meeting)" that break new Date()
export function sanitizeMeetingDate(raw) {
  return (raw ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? new Date().toISOString().slice(0, 10)
}

// BLW-16: paged instead of a silent .limit(50) cap — returns the total count
// so callers can offer "load more" until every meeting is reachable.
export async function getDeptMeetings(departmentId, { limit = MEETINGS_PAGE_SIZE, offset = 0 } = {}) {
  if (!departmentId) return { meetings: [], totalCount: 0 }

  let query = supabase
    .from('meetings')
    .select(`
      id,
      title,
      department_id,
      date,
      meeting_type,
      status,
      agenda,
      minutes,
      transcript,
      summary,
      zoom_join_url,
      drive_url,
      visibility,
      allowed_viewers,
      created_by,
      created_at,
      recurrence_id,
      recurrence_rule,
      creator:users!created_by(id, name),
      attendance:meeting_attendance(user_id, status, attendee:users(id, name)),
      agendas(id, title, start_time, end_time, location, moderator_name, theme, created_by, agenda_items(id, segment, notes, duration_minutes, sort_order, is_pinned))
    `, { count: 'exact' })

  if (departmentId !== 'all') {
    query = query.eq('department_id', departmentId)
  }

  const { data, count, error } = await query
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error
  return { meetings: data ?? [], totalCount: count ?? 0 }
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
      visibility,
      allowed_viewers,
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

// Creates only the FIRST meeting of a recurring series. Future occurrences are
// NOT materialized here — they're generated progressively (~1 day ahead of
// when they occur) by the generate-recurring-meetings edge function, driven by
// `next_occurrence_scheduled`. This keeps the table from being bloated with
// dozens of far-future rows up front, and lets each occurrence be edited
// (time, attendees, agenda) independently before it's ever generated.
// Attendance rows use status: 'pending', matching ScheduleMeetingModal's
// convention for meetings that haven't happened yet.
export async function createRecurringMeeting({ baseMeeting, attendeeIds = [], recurrenceRule }) {
  const recurrenceId = crypto.randomUUID()

  // Schedule generation of occurrence #2 for one day before it's due to
  // happen. If the series ends after just one occurrence, nothing to schedule.
  const startDateTime = new Date(baseMeeting.date)
  const secondOccurrenceDate = recurrenceRule ? getNextOccurrenceDate(recurrenceRule, startDateTime, 1) : null
  const nextOccurrenceScheduled = secondOccurrenceDate ? addDays(secondOccurrenceDate, -1) : null

  const meeting = {
    ...baseMeeting,
    recurrence_rule: recurrenceRule,
    recurrence_id: recurrenceId,
    series_instance_num: 1,
    next_occurrence_scheduled: nextOccurrenceScheduled?.toISOString() ?? null,
  }

  const { data, error } = await supabase
    .from('meetings')
    .insert(meeting)
    .select(`
      id,
      title,
      department_id,
      date,
      meeting_type,
      agenda,
      visibility,
      recurrence_id,
      recurrence_rule,
      created_by,
      created_at
    `)
    .single()

  if (error) throw error

  if (attendeeIds.length > 0) {
    const { error: attendanceError } = await supabase.from('meeting_attendance').insert(
      attendeeIds.map((userId) => ({ meeting_id: data.id, user_id: userId, status: 'pending' })),
    )
    if (attendanceError) throw attendanceError
  }

  recordActivity('meeting_created', {
    entity_type: 'meeting',
    entity_id: data.id,
    entity_title: data.title,
    department_id: data.department_id,
  })

  return data
}

// Applies an edit to a meeting that belongs to a recurring series.
// editScope:
//  - 'this': updates only this occurrence; marks it as an exception so it's
//    no longer considered a "plain" generated instance.
//  - 'future': updates this occurrence and every future occurrence already
//    materialized in the same series (attendees/agenda/time-of-day changes
//    apply going forward; each occurrence keeps its own date).
//  - 'all': updates the series parent's `recurrence_rule`/fields so that
//    occurrences generated from now on reflect the change. Already-generated
//    future occurrences are also updated to match, mirroring 'future'.
export async function editRecurringMeeting(meetingId, updates, editScope = 'this') {
  const { data: current, error: fetchError } = await supabase
    .from('meetings')
    .select('id, date, recurrence_id')
    .eq('id', meetingId)
    .single()
  if (fetchError) throw fetchError

  if (editScope === 'this' || !current.recurrence_id) {
    return updateMeeting(meetingId, { ...updates, exception_date: new Date().toISOString().split('T')[0] })
  }

  // 'future' and 'all' both propagate the change to this occurrence and every
  // future occurrence already materialized in the series.
  const { data: futureMeetings, error: futureError } = await supabase
    .from('meetings')
    .select('id, date')
    .eq('recurrence_id', current.recurrence_id)
    .gte('date', current.date)
  if (futureError) throw futureError

  const { date: newDate, ...otherUpdates } = updates
  const targetIds = futureMeetings.map((m) => m.id)

  if (newDate) {
    // A date change on a multi-occurrence edit means "change the time of
    // day" — each occurrence keeps its own calendar date, only the
    // hours/minutes shift, so the series doesn't collapse onto one day.
    const newTime = new Date(newDate)
    const results = await Promise.all(
      futureMeetings.map((m) => {
        const own = new Date(m.date)
        own.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0)
        return supabase.from('meetings').update({ ...otherUpdates, date: own.toISOString() }).eq('id', m.id)
      }),
    )
    const failed = results.find((r) => r.error)
    if (failed) throw failed.error
  } else if (Object.keys(otherUpdates).length > 0) {
    const { error: updateError } = await supabase
      .from('meetings')
      .update(otherUpdates)
      .in('id', targetIds)
    if (updateError) throw updateError
  }

  if (editScope === 'all') {
    // Also persist the new recurrence_rule (if provided) on the series parent
    // so occurrences generated later follow the updated pattern.
    if (updates.recurrence_rule) {
      await supabase
        .from('meetings')
        .update({ recurrence_rule: updates.recurrence_rule })
        .eq('id', current.recurrence_id)
    }
  }

  recordActivity('meeting_updated', {
    entity_type: 'meeting',
    entity_id: meetingId,
    entity_title: updates.title,
  })

  return { updatedIds: targetIds }
}

// Grants/revokes note visibility for one attendee of a private (e.g. one-on-one)
// meeting. Meeting-level visibility (allowed_viewers) is separate — an attendee
// can see the meeting exists without seeing its notes.
export async function setNotesSharedWithAttendee(meetingId, userId, shared) {
  const { data: current, error: fetchError } = await supabase
    .from('meetings')
    .select('notes_shared_with')
    .eq('id', meetingId)
    .single()
  if (fetchError) throw fetchError

  const existing = current?.notes_shared_with ?? []
  const next = shared
    ? [...new Set([...existing, userId])]
    : existing.filter((id) => id !== userId)

  const { error } = await supabase
    .from('meetings')
    .update({ notes_shared_with: next })
    .eq('id', meetingId)
  if (error) throw error

  return next
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
      visibility,
      allowed_viewers,
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

  // meeting_attendance.meeting_id is ON DELETE CASCADE — no need to delete
  // it manually here; that was an extra round-trip on every meeting delete
  // for something the DB already does for free. agendas.meeting_id is only
  // ON DELETE SET NULL (not cascade), so that one still needs an explicit
  // delete below or agendas would be orphaned instead of removed.

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
  const explicitDeptIds = actionItems.map((i) => i.departmentId).filter(Boolean)
  const uniqueDeptIds = [...new Set([departmentId, ...Object.values(assigneeDeptMap), ...explicitDeptIds])]
  const statusIdByDept = {}
  await Promise.all(
    uniqueDeptIds.map(async (deptId) => {
      statusIdByDept[deptId] = await getDefaultTaskStatusId({ departmentId: deptId })
    }),
  )

  const tasks = actionItems.map((item) => {
    // Explicit space selection wins (user chose via dropdown); otherwise
    // fall back to assignee's own space, then the meeting's department.
    const destDeptId = item.departmentId
      || (item.assigneeId ? assigneeDeptMap[item.assigneeId] : null)
      || departmentId
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
      // Optional sprint linkage (from the extraction UI's per-item sprint picker).
      // A sprint-linked task must be task_type='sprint' for the sprint boards + RLS.
      sprint_id: item.sprintId || null,
      task_type: item.sprintId ? 'sprint' : 'space',
    }
  })

  // A space task with no department_id is orphaned — invisible on every board.
  // This can only happen when the meeting itself is org-wide (department_id
  // null) and neither the per-item picker nor the assignee's own department
  // resolved one. Sprint-linked tasks are exempt (task_type='sprint' doesn't
  // need a department). Fail loudly instead of silently creating a task no
  // one will ever see.
  const missingDept = actionItems.filter((item, i) => !tasks[i].department_id && !item.sprintId)
  if (missingDept.length > 0) {
    const titles = missingDept.map((item) => `"${item.title}"`).join(', ')
    throw new Error(
      `Please select a space for: ${titles}. This meeting is org-wide, so a space can't be inferred automatically.`
    )
  }

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

// Full-content search across title, minutes, AI notes, decisions, and transcript.
// Used by the meetings list search when the user types a query.
export async function searchMeetings(query, departmentId) {
  if (!query || !query.trim()) return []
  const q = `%${query.trim()}%`

  let req = supabase
    .from('meetings')
    .select(`
      id,
      title,
      department_id,
      date,
      meeting_type,
      status,
      minutes,
      meeting_notes,
      decisions,
      summary,
      created_by,
      created_at,
      recurrence_id,
      recurrence_rule,
      attendance:meeting_attendance(user_id, status, attendee:users(id, name))
    `)
    .or(
      `title.ilike.${q},minutes.ilike.${q},meeting_notes.ilike.${q},decisions.ilike.${q},summary.ilike.${q}`
    )
    .order('date', { ascending: false })
    .limit(50)

  if (departmentId && departmentId !== 'all') {
    req = req.eq('department_id', departmentId)
  }

  const { data, error } = await req
  if (error) throw error
  return data ?? []
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
