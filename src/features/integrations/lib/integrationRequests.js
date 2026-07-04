import { supabase } from '../../../lib/supabase'
import { createNotification } from '../../notifications'

export async function requestIntegration({ departmentId, integrationType, displayName, description, requestedByName, requestedByEmail }) {
  const { data, error } = await supabase
    .from('integration_requests')
    .insert({
      department_id: departmentId,
      integration_type: integrationType,
      display_name: displayName,
      description: description || null,
    })
    .select()
    .single()

  if (error) throw error

  // Notify dept leads and super admins about the new request
  try {
    const { data: leads } = await supabase
      .from('users')
      .select('id')
      .or(`role.eq.super_admin,and(role.eq.dept_lead,department_id.eq.${departmentId})`)

    if (leads && leads.length > 0) {
      const notificationPromises = leads.map((lead) =>
        createNotification(lead.id, 'integration_requested', {
          integration_name: displayName,
          integration_type: integrationType,
          requester_name: requestedByName,
          requester_email: requestedByEmail,
          department_id: departmentId,
          request_id: data.id,
        }).catch(() => null) // Silently fail if notification fails
      )
      await Promise.all(notificationPromises)
    }
  } catch (notifError) {
    console.warn('Failed to send notifications:', notifError)
    // Don't fail the whole operation if notifications fail
  }

  return data
}

export async function getIntegrationRequests({ departmentId = null, status = null } = {}) {
  let query = supabase
    .from('integration_requests')
    .select(`
      *,
      requested_by:users!requested_by(id, name, email),
      reviewed_by:users!reviewed_by(id, name, email)
    `)
    .order('created_at', { ascending: false })

  if (departmentId) {
    query = query.eq('department_id', departmentId)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) throw error
  return data || []
}

export async function getPendingIntegrationRequests(departmentId) {
  return getIntegrationRequests({ departmentId, status: 'pending' })
}

export async function approveIntegrationRequest(requestId, reviewedBy) {
  const { data, error } = await supabase
    .from('integration_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function rejectIntegrationRequest(requestId, reviewedBy, rejectionReason) {
  const { data, error } = await supabase
    .from('integration_requests')
    .update({
      status: 'rejected',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectionReason || null,
    })
    .eq('id', requestId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getUserIntegrationRequests() {
  const { data, error } = await supabase
    .from('integration_requests')
    .select(`
      *,
      department:departments(id, name)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}
