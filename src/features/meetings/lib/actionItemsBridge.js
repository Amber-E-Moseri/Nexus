import { supabase } from '../../../lib/supabase'
import { recordActivity } from '../../../lib/activityFeed'

// ============================================================================
// Action Items Bridge — Link meeting action items to Tasks module
// ============================================================================

/**
 * Create a task from an action item
 * Called when action item is created in minutes
 *
 * @param {Object} actionItem - Action item from meeting_action_items
 * @param {string} meetingId - Reference to meeting
 * @returns {Object} Created task
 */
export async function createTaskFromActionItem(actionItem, meetingId) {
  try {
    // Create task in tasks table
    const { data: task, error } = await supabase
      .from('tasks')
      .insert([
        {
          title: actionItem.description,
          description: `From meeting action item\nMeeting ID: ${meetingId}`,
          assignee_id: actionItem.assigned_to || null,
          due_date: actionItem.due_date || null,
          status: 'open',
          priority: 'medium',
          tags: [`meeting:${meetingId}`],
          created_by: actionItem.created_by || null, // Will be null in many cases
        },
      ])
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create task: ${error.message}`)
    }

    // Link action item to task
    await linkActionItemToTask(actionItem.id, task.id)

    recordActivity('action_item_created_task', {
      entity_type: 'meeting_action_item',
      entity_id: actionItem.id,
      task_id: task.id,
      meeting_id: meetingId,
    })

    return task
  } catch (error) {
    console.error('Failed to create task from action item:', error)
    throw error
  }
}

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
 * Bulk link existing action items to tasks
 * Used for backfilling or one-time sync
 */
export async function bulkLinkActionItemsToTasks(actionItemIds) {
  const results = {
    successful: 0,
    failed: 0,
    alreadyLinked: 0,
    errors: [],
  }

  for (const actionItemId of actionItemIds) {
    try {
      const { data: actionItem, error: selectError } = await supabase
        .from('meeting_action_items')
        .select('id, task_id')
        .eq('id', actionItemId)
        .single()

      if (selectError) throw selectError

      // Skip if already linked
      if (actionItem.task_id) {
        results.alreadyLinked++
        continue
      }

      // Create task and link
      const task = await createTaskFromActionItem(actionItem, actionItem.id)
      results.successful++
    } catch (error) {
      results.failed++
      results.errors.push({
        actionItemId,
        error: error.message,
      })
    }
  }

  return results
}

/**
 * Get all tasks created from a meeting's action items
 */
export async function getTasksFromMeeting(meetingId) {
  try {
    const { data: actionItems, error: selectError } = await supabase
      .from('meeting_action_items')
      .select('task_id')
      .eq('segment_id.minutes_id.meeting_id', meetingId)
      .not('task_id', 'is', null)

    if (selectError) throw selectError

    if (!actionItems || actionItems.length === 0) {
      return []
    }

    const taskIds = actionItems.map(ai => ai.task_id)

    // Fetch full task details
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .in('id', taskIds)

    if (tasksError) throw tasksError

    return tasks || []
  } catch (error) {
    console.error('Failed to fetch tasks from meeting:', error)
    return []
  }
}

/**
 * Notify assignees of new action items
 * Called after action item created
 * (Future implementation - placeholder for Phase 3)
 */
export async function notifyActionItemAssignees(actionItem) {
  try {
    if (!actionItem.assigned_to) {
      return // No one to notify
    }

    // TODO: Phase 3 - implement notification
    // Could be email, Slack, push notification, or in-app notification

    recordActivity('action_item_assignee_notified', {
      entity_type: 'meeting_action_item',
      entity_id: actionItem.id,
      assigned_to: actionItem.assigned_to,
    })
  } catch (error) {
    console.error('Failed to notify assignees:', error)
    // Non-critical, don't throw
  }
}
