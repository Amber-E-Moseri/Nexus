import { supabase } from '../../../lib/supabase'
import { recordActivity } from '../../../lib/activityFeed'

// ============================================================================
// Action Items Bridge — Link meeting action items to Tasks module
// ============================================================================

// NOTE: Task creation from action items lives in
// `createTasksFromActionItems` (src/features/meetings/lib/meetings.js). That is
// the single source of truth — it sets department_id (to the assignee's space),
// meeting_id, source: 'meeting' and a valid status_id so the task shows up in
// the assignee's My Tasks / department board. The previous standalone
// createTaskFromActionItem here was removed: it omitted department_id and wrote
// to non-existent columns (`tags`) and the legacy `status` column.

/**
 * Link action item to task record
 * Stores task_id for two-way reference
 */
export async function linkActionItemToTask(actionItemId, taskId) {
  const { error } = await supabase
    .from('meeting_action_items')
    .update({
      task_id: taskId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', actionItemId)

  if (error) {
    throw new Error(`Failed to link action item to task: ${error.message}`)
  }
}

/**
 * Update action item status when task status changes
 * Called by task system when user updates task status
 *
 * Status mapping:
 * Task 'open' → Action Item 'open'
 * Task 'in_progress' → Action Item 'in_progress'
 * Task 'completed' → Action Item 'completed'
 * Task 'cancelled' → Action Item 'cancelled'
 */
export async function syncActionItemStatusFromTask(taskId, taskStatus) {
  try {
    const { data: actionItem, error: selectError } = await supabase
      .from('meeting_action_items')
      .select('id')
      .eq('task_id', taskId)
      .maybeSingle()

    if (selectError) throw selectError
    if (!actionItem) return // Not linked to action item

    // Map task status to action item status (same values, so direct mapping)
    const { error: updateError } = await supabase
      .from('meeting_action_items')
      .update({
        status: taskStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', actionItem.id)

    if (updateError) throw updateError

    recordActivity('action_item_status_synced', {
      entity_type: 'meeting_action_item',
      entity_id: actionItem.id,
      new_status: taskStatus,
    })
  } catch (error) {
    console.error('Failed to sync action item status:', error)
    // Don't throw - task system is primary
  }
}

/**
 * Notify assignees that meeting action items were converted to tasks.
 *
 * The `notifications` INSERT RLS policy only allows a user to insert rows for
 * themselves, so creating a notification for the *assignee* from the browser
 * (under the assigner's JWT) is blocked. Delivery is therefore delegated to the
 * `notify-action-item-assignees` edge function, which inserts with the service
 * role after honouring each assignee's opt-out preference.
 *
 * Fire-and-forget by design: notifications must never block or fail the
 * task-creation flow. Accepts an array of
 * `{ task_id, assignee_id, task_title, assigner_name }`.
 */
export function notifyActionItemAssignees(tasks) {
  const payload = (tasks ?? []).filter((t) => t && t.assignee_id && t.task_id)
  if (payload.length === 0) return

  // Do not await — non-blocking, swallow all errors.
  supabase.functions
    .invoke('notify-action-item-assignees', { body: { tasks: payload } })
    .then(() => {
      recordActivity('action_item_assignees_notified', {
        entity_type: 'task',
        count: payload.length,
      })
    })
    .catch(() => {})
}
