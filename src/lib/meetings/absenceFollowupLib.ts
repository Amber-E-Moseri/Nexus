import { supabase } from '../supabase'

export interface AbsenceFollowup {
  id?: string
  meeting_id: string
  user_id: string
  department_id: string
  email_subject?: string
  email_body?: string
  email_status?: 'draft' | 'scheduled' | 'sent' | 'failed'
  scheduled_send_at?: string
  sent_at?: string
  reason?: 'absent' | 'late' | 'excused' | 'no_show'
  notes?: string
  created_by?: string
  created_at?: string
  updated_at?: string
}

/**
 * Log an absence follow-up to the database
 * Called when an email is drafted or sent
 */
export async function logAbsenceFollowup(
  meetingId: string,
  userId: string,
  departmentId: string,
  emailData: {
    subject: string
    body: string
    status: 'draft' | 'scheduled' | 'sent' | 'failed'
    scheduledSendAt?: string
    sentAt?: string
    reason: 'absent' | 'late' | 'excused' | 'no_show'
    notes?: string
  },
  createdBy?: string,
): Promise<AbsenceFollowup> {
  const { data, error } = await supabase
    .from('absence_follow_ups')
    .upsert(
      {
        meeting_id: meetingId,
        user_id: userId,
        department_id: departmentId,
        email_subject: emailData.subject,
        email_body: emailData.body,
        email_status: emailData.status,
        scheduled_send_at: emailData.scheduledSendAt || null,
        sent_at: emailData.sentAt || null,
        reason: emailData.reason,
        notes: emailData.notes || null,
        created_by: createdBy || null,
      },
      {
        onConflict: 'meeting_id,user_id',
      },
    )
    .select()
    .single()

  if (error) throw error
  return data as AbsenceFollowup
}

/**
 * Get all absence follow-ups for a meeting
 */
export async function getAbsenceFollowupsByMeeting(meetingId: string): Promise<AbsenceFollowup[]> {
  const { data, error } = await supabase
    .from('absence_follow_ups')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as AbsenceFollowup[]) || []
}

/**
 * Get all absence follow-ups for a user across all meetings
 */
export async function getAbsenceFollowupsByUser(userId: string): Promise<AbsenceFollowup[]> {
  const { data, error } = await supabase
    .from('absence_follow_ups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as AbsenceFollowup[]) || []
}

/**
 * Get all absence follow-ups for a department
 */
export async function getAbsenceFollowupsByDepartment(
  departmentId: string,
  filters?: {
    status?: 'draft' | 'scheduled' | 'sent' | 'failed'
    reason?: 'absent' | 'late' | 'excused' | 'no_show'
  },
): Promise<AbsenceFollowup[]> {
  let query = supabase
    .from('absence_follow_ups')
    .select('*')
    .eq('department_id', departmentId)

  if (filters?.status) {
    query = query.eq('email_status', filters.status)
  }

  if (filters?.reason) {
    query = query.eq('reason', filters.reason)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error
  return (data as AbsenceFollowup[]) || []
}

/**
 * Get pending follow-ups (draft or scheduled) for a department
 */
export async function getPendingFollowups(departmentId: string): Promise<AbsenceFollowup[]> {
  const { data, error } = await supabase
    .from('absence_follow_ups')
    .select('*')
    .eq('department_id', departmentId)
    .in('email_status', ['draft', 'scheduled'])
    .order('scheduled_send_at', { ascending: true, nullsFirst: true })

  if (error) throw error
  return (data as AbsenceFollowup[]) || []
}

/**
 * Update an absence follow-up
 */
export async function updateAbsenceFollowup(
  id: string,
  updates: Partial<AbsenceFollowup>,
): Promise<AbsenceFollowup> {
  const { data, error } = await supabase
    .from('absence_follow_ups')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as AbsenceFollowup
}

/**
 * Mark a follow-up as sent
 */
export async function markFollowupAsSent(id: string): Promise<AbsenceFollowup> {
  return updateAbsenceFollowup(id, {
    email_status: 'sent',
    sent_at: new Date().toISOString(),
  })
}

/**
 * Mark a follow-up as failed
 */
export async function markFollowupAsFailed(id: string): Promise<AbsenceFollowup> {
  return updateAbsenceFollowup(id, {
    email_status: 'failed',
  })
}

/**
 * Delete an absence follow-up
 */
export async function deleteAbsenceFollowup(id: string): Promise<void> {
  const { error } = await supabase.from('absence_follow_ups').delete().eq('id', id)

  if (error) throw error
}

/**
 * Delete all follow-ups for a meeting
 */
export async function deleteAbsenceFollowupsByMeeting(meetingId: string): Promise<void> {
  const { error } = await supabase
    .from('absence_follow_ups')
    .delete()
    .eq('meeting_id', meetingId)

  if (error) throw error
}

/**
 * Get follow-up statistics for a department
 */
export async function getFollowupStats(departmentId: string): Promise<{
  total: number
  draft: number
  scheduled: number
  sent: number
  failed: number
  byReason: Record<string, number>
}> {
  const followups = await getAbsenceFollowupsByDepartment(departmentId)

  const stats = {
    total: followups.length,
    draft: 0,
    scheduled: 0,
    sent: 0,
    failed: 0,
    byReason: {} as Record<string, number>,
  }

  for (const followup of followups) {
    if (followup.email_status === 'draft') stats.draft++
    if (followup.email_status === 'scheduled') stats.scheduled++
    if (followup.email_status === 'sent') stats.sent++
    if (followup.email_status === 'failed') stats.failed++

    if (followup.reason) {
      stats.byReason[followup.reason] = (stats.byReason[followup.reason] || 0) + 1
    }
  }

  return stats
}
