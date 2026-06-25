import { supabase } from '../../../lib/supabase'
import { recordActivity } from '../../../lib/activityFeed'

// ============================================================================
// Minutes CRUD Operations
// ============================================================================

/**
 * Create a new minutes record for a meeting
 */
export async function createMinutes(meetingId, createdBy) {
  const { data, error } = await supabase
    .from('meeting_minutes')
    .insert([
      {
        meeting_id: meetingId,
        created_by: createdBy,
        status: 'draft',
      },
    ])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create minutes: ${error.message}`)
  }

  recordActivity('minutes_created', {
    entity_type: 'meeting_minutes',
    entity_id: data.id,
    meeting_id: meetingId,
  })

  return data
}

/**
 * Fetch minutes for a specific meeting
 */
export async function getMinutesByMeeting(meetingId) {
  const { data: minutes, error: minutesError } = await supabase
    .from('meeting_minutes')
    .select(`
      id,
      meeting_id,
      status,
      summary,
      created_by,
      created_at,
      updated_at,
      segments:meeting_minutes_segments(
        id,
        segment_id,
        segment_name,
        notes,
        decisions,
        key_points,
        actions:meeting_action_items(
          id,
          description,
          assigned_to,
          due_date,
          status,
          user:users!assigned_to(id, name, email)
        )
      )
    `)
    .eq('meeting_id', meetingId)
    .maybeSingle()

  if (minutesError) {
    throw new Error(`Failed to fetch minutes: ${minutesError.message}`)
  }

  return minutes
}

/**
 * Update minutes summary
 */
export async function updateMinutesSummary(minutesId, summary) {
  const { data, error } = await supabase
    .from('meeting_minutes')
    .update({
      summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', minutesId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update minutes: ${error.message}`)
  }

  return data
}

/**
 * Submit minutes (change status from draft to submitted)
 */
export async function submitMinutes(minutesId) {
  const { data, error } = await supabase
    .from('meeting_minutes')
    .update({
      status: 'submitted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', minutesId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to submit minutes: ${error.message}`)
  }

  recordActivity('minutes_submitted', {
    entity_type: 'meeting_minutes',
    entity_id: minutesId,
  })

  return data
}

// ============================================================================
// Segment Notes Operations
// ============================================================================

/**
 * Create or update segment notes
 */
export async function upsertSegmentNotes(minutesId, segmentId, segmentName, notes) {
  const { data, error } = await supabase
    .from('meeting_minutes_segments')
    .upsert(
      [
        {
          minutes_id: minutesId,
          segment_id: segmentId,
          segment_name: segmentName,
          notes,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'minutes_id,segment_id' }
    )
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to save segment notes: ${error.message}`)
  }

  return data
}

/**
 * Add decisions to a segment
 */
export async function updateSegmentDecisions(segmentId, decisions) {
  const { data, error } = await supabase
    .from('meeting_minutes_segments')
    .update({
      decisions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', segmentId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update segment decisions: ${error.message}`)
  }

  return data
}

/**
 * Add key points to a segment
 */
export async function updateSegmentKeyPoints(segmentId, keyPoints) {
  const { data, error } = await supabase
    .from('meeting_minutes_segments')
    .update({
      key_points: keyPoints,
      updated_at: new Date().toISOString(),
    })
    .eq('id', segmentId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update segment key points: ${error.message}`)
  }

  return data
}

// ============================================================================
// Action Items Operations
// ============================================================================

/**
 * Create an action item
 */
export async function createActionItem(segmentId, description, assignedTo, dueDate) {
  const { data, error } = await supabase
    .from('meeting_action_items')
    .insert([
      {
        segment_id: segmentId,
        description,
        assigned_to: assignedTo || null,
        due_date: dueDate || null,
        status: 'open',
      },
    ])
    .select(`
      id,
      description,
      assigned_to,
      due_date,
      status,
      user:users!assigned_to(id, name, email)
    `)
    .single()

  if (error) {
    throw new Error(`Failed to create action item: ${error.message}`)
  }

  recordActivity('action_item_created', {
    entity_type: 'meeting_action_item',
    entity_id: data.id,
    assigned_to: assignedTo,
  })

  return data
}

/**
 * Update action item
 */
export async function updateActionItem(actionItemId, updates) {
  const { data, error } = await supabase
    .from('meeting_action_items')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', actionItemId)
    .select(`
      id,
      description,
      assigned_to,
      due_date,
      status,
      user:users!assigned_to(id, name, email)
    `)
    .single()

  if (error) {
    throw new Error(`Failed to update action item: ${error.message}`)
  }

  return data
}

/**
 * Delete action item
 */
export async function deleteActionItem(actionItemId) {
  const { error } = await supabase
    .from('meeting_action_items')
    .delete()
    .eq('id', actionItemId)

  if (error) {
    throw new Error(`Failed to delete action item: ${error.message}`)
  }
}

/**
 * Update action item status
 */
export async function updateActionItemStatus(actionItemId, status) {
  return updateActionItem(actionItemId, { status })
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Create all segment notes at once (from agenda items)
 */
export async function initializeSegmentNotes(minutesId, agendaItems) {
  const segmentRows = agendaItems
    .filter(item => !item.isPinned) // Skip intro music
    .map((item, index) => ({
      minutes_id: minutesId,
      segment_id: item.id,
      segment_name: item.segment,
      notes: '',
      created_at: new Date().toISOString(),
    }))

  if (segmentRows.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('meeting_minutes_segments')
    .insert(segmentRows)
    .select()

  if (error) {
    throw new Error(`Failed to initialize segment notes: ${error.message}`)
  }

  return data
}

/**
 * Get all action items for a meeting
 */
export async function getActionItemsByMeeting(meetingId) {
  const { data, error } = await supabase
    .from('meeting_action_items')
    .select(`
      id,
      description,
      assigned_to,
      due_date,
      status,
      segment_id,
      user:users!assigned_to(id, name, email),
      segment:meeting_minutes_segments!segment_id(
        id,
        segment_name,
        minutes_id
      )
    `)
    .eq('segment.minutes_id.meeting_id', meetingId)
    .order('due_date', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch action items: ${error.message}`)
  }

  return data || []
}
