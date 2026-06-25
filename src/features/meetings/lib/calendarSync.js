import { supabase } from '../../../lib/supabase'
import { createCalendarEvent } from '../../../lib/calendar/api'
import { recordActivity } from '../../../lib/activityFeed'

// ============================================================================
// Calendar Sync — One-way sync from Meetings to Calendar
// ============================================================================

/**
 * Sync meeting to calendar event
 * Called when meeting is finalized
 * Creates calendar event with meeting details
 *
 * @param {Object} meeting - Meeting record
 * @param {Array} agendaItems - Meeting agenda items
 * @returns {Object} Calendar event created
 */
export async function syncMeetingToCalendar(meeting, agendaItems) {
  try {
    // Format agenda items as description
    const agendaText = agendaItems
      .filter(item => !item.isPinned) // Skip intro music
      .map((item, idx) => `${idx + 1}. ${item.segment} (${item.duration} min)`)
      .join('\n')

    const description = `
Meeting Agenda:
${agendaText}

Location: ${meeting.location || 'TBD'}
Moderator: ${meeting.moderator || 'TBD'}
Meeting Type: ${meeting.meeting_type?.replace(/_/g, ' ')}
    `.trim()

    // Create calendar event
    const calendarEvent = await createCalendarEvent({
      title: meeting.title,
      description,
      event_type: 'meeting', // Tag for filtering
      start_date: `${meeting.date}T${meeting.start_time || '10:00'}:00`,
      end_date: `${meeting.date}T${meeting.end_time || '11:30'}:00`,
      location: meeting.location || null,
      priority: 'medium',
      space_id: null, // Generic event, not tied to space
    })

    // Link calendar event to meeting
    await linkCalendarEventToMeeting(meeting.id, calendarEvent.id)

    recordActivity('meeting_synced_to_calendar', {
      entity_type: 'meeting',
      entity_id: meeting.id,
      calendar_event_id: calendarEvent.id,
    })

    return calendarEvent
  } catch (error) {
    console.error('Failed to sync meeting to calendar:', error)
    throw new Error(`Calendar sync failed: ${error.message}`)
  }
}

/**
 * Link calendar event to meeting record
 * Stores calendar_event_id for reverse lookup
 */
export async function linkCalendarEventToMeeting(meetingId, calendarEventId) {
  const { error } = await supabase
    .from('meetings')
    .update({
      calendar_event_id: calendarEventId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', meetingId)

  if (error) {
    throw new Error(`Failed to link calendar event: ${error.message}`)
  }
}

/**
 * Remove calendar event when meeting is deleted
 * One-way: don't delete meeting if calendar deletion fails
 */
export async function removeCalendarEventFromMeeting(calendarEventId) {
  try {
    const { deleteCalendarEvent } = await import('../../../lib/calendar/api')
    await deleteCalendarEvent(calendarEventId)
  } catch (error) {
    console.error('Failed to delete calendar event:', error)
    // Don't throw - meeting deletion takes priority
  }
}

/**
 * Retry calendar sync for a meeting
 * Called when initial sync fails (network, API error, etc.)
 */
export async function retryCalendarSync(meetingId) {
  try {
    // Fetch meeting and agenda
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select(`
        id,
        title,
        date,
        meeting_type,
        start_time,
        end_time,
        location,
        moderator,
        agendas(id, meeting_id, agenda_items(id, segment, duration, is_pinned))
      `)
      .eq('id', meetingId)
      .single()

    if (meetingError || !meeting) {
      throw new Error('Meeting not found')
    }

    const agendaItems = meeting.agendas?.[0]?.agenda_items || []

    // If already synced, skip
    if (meeting.calendar_event_id) {
      throw new Error('Meeting already synced to calendar')
    }

    // Retry sync
    const calendarEvent = await syncMeetingToCalendar(meeting, agendaItems)

    return {
      success: true,
      calendarEventId: calendarEvent.id,
    }
  } catch (error) {
    console.error('Retry sync failed:', error)
    throw error
  }
}

/**
 * Get sync status for a meeting
 */
export async function getCalendarSyncStatus(meetingId) {
  try {
    const { data: meeting, error } = await supabase
      .from('meetings')
      .select('id, calendar_event_id, updated_at')
      .eq('id', meetingId)
      .single()

    if (error) throw error

    return {
      isSynced: !!meeting.calendar_event_id,
      calendarEventId: meeting.calendar_event_id,
      lastSyncedAt: meeting.updated_at,
    }
  } catch (error) {
    console.error('Failed to get sync status:', error)
    return {
      isSynced: false,
      calendarEventId: null,
      lastSyncedAt: null,
    }
  }
}

/**
 * Bulk sync meetings to calendar
 * Used for backfilling or recovering from sync failures
 */
export async function bulkSyncMeetingsToCalendar(meetingIds) {
  const results = {
    successful: 0,
    failed: 0,
    errors: [],
  }

  for (const meetingId of meetingIds) {
    try {
      await retryCalendarSync(meetingId)
      results.successful++
    } catch (error) {
      results.failed++
      results.errors.push({
        meetingId,
        error: error.message,
      })
    }
  }

  return results
}
