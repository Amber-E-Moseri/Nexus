import { supabase } from '../../../lib/supabase'
import { createTask } from '../../tasks/lib/tasks'

export async function getOpenItemsByMeeting(meetingId) {
  const { data, error } = await supabase
    .from('meeting_open_items')
    .select('*, converted_task:tasks!converted_to_task_id(id, title, status_id)')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getOpenItemsBySpace(spaceId, { status, itemType, sortBy = 'last_mentioned' } = {}) {
  let query = supabase
    .from('meeting_open_items')
    .select(`
      *,
      meeting:meetings!meeting_id(id, title, date, meeting_type),
      converted_task:tasks!converted_to_task_id(id, title, status_id)
    `)
    .eq('space_id', spaceId)

  if (status) query = query.eq('status', status)
  if (itemType) query = query.eq('item_type', itemType)

  const ascending = sortBy === 'first_mentioned'
  query = query.order(sortBy, { ascending })

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createOpenItems(meetingId, spaceId, items, userId) {
  if (!items.length) return []

  const rows = items.map((item) => ({
    meeting_id: meetingId,
    space_id: spaceId || null,
    item_text: item.item_text,
    item_type: item.item_type || 'exploration',
    status: 'open',
    transcript_excerpt: item.transcript_excerpt || null,
    confidence_score: item.confidence_score ?? null,
    meeting_attendees: item.meeting_attendees || null,
    user_id: userId,
  }))

  const { data, error } = await supabase
    .from('meeting_open_items')
    .insert(rows)
    .select()
  if (error) throw error
  return data ?? []
}

export async function updateOpenItemStatus(itemId, status) {
  const { data, error } = await supabase
    .from('meeting_open_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateOpenItem(itemId, updates) {
  const { data, error } = await supabase
    .from('meeting_open_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteOpenItem(itemId) {
  const { error } = await supabase
    .from('meeting_open_items')
    .delete()
    .eq('id', itemId)
  if (error) throw error
}

export async function convertOpenItemToTask(item, { assigneeId, dueDate, spaceId }) {
  const task = await createTask({
    title: item.item_text,
    description: `From open item (${item.item_type}): ${item.transcript_excerpt || ''}`.trim(),
    assigneeId: assigneeId || null,
    dueDate: dueDate || null,
    departmentId: spaceId || item.space_id || null,
    source: 'meeting',
    meetingId: item.meeting_id,
    priority: 'medium',
  })

  await supabase
    .from('meeting_open_items')
    .update({
      converted_to_task_id: task.id,
      status: 'resolved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)

  return task
}
