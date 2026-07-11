import { supabase } from '../supabase'

export async function listUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, department_id, first_name, last_name, status, invited_at, activated_at, archived_at, last_active_at, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function listDepartments() {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, color, health_status')
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function listPastorMembers() {
  const { data, error } = await supabase
    .from('pastor_members')
    .select('pastor_id, member_id, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function listInvitations() {
  const { data, error } = await supabase
    .from('user_invitations')
    .select('id, first_name, last_name, email, department_id, role, assigned_pastor_id, invited_by, status, expires_at, accepted_at, revoked_at, resent_at, accepted_user_id, sent_at, last_sent_at, send_count, delivery_status, delivery_error, invite_message, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function listDepartmentAssignmentHistory() {
  const { data, error } = await supabase
    .from('department_assignment_history')
    .select('id, user_id, from_department_id, to_department_id, changed_by, effective_at, created_at')
    .order('effective_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createInvitation(payload) {
  const { data, error } = await supabase.rpc('create_user_invitation', {
    p_first_name: payload.firstName,
    p_last_name: payload.lastName,
    p_email: payload.email,
    p_department_id: payload.departmentId,
    p_role: payload.role,
    p_assigned_pastor_id: payload.assignedPastorId || null,
    p_message: payload.message || null,
    p_group_name: payload.groupName || null,
  })

  if (error) throw error
  return data
}

export async function resendInvitation(invitationId) {
  const { data, error } = await supabase.rpc('resend_user_invitation', {
    p_invitation_id: invitationId,
  })

  if (error) throw error
  return data
}

export async function sendInvitationEmail(invitationId, mode = 'send') {
  const { data, error } = await supabase.functions.invoke('send-user-invitation', {
    body: {
      invitation_id: invitationId,
      mode,
    },
  })

  if (error) {
    throw error
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export async function sendPasswordReset(userId) {
  const { data, error } = await supabase.functions.invoke('send-password-reset', {
    body: { user_id: userId },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function cancelInvitation(invitationId) {
  const { data, error } = await supabase.rpc('cancel_user_invitation', {
    p_invitation_id: invitationId,
  })

  if (error) throw error
  return data
}

export async function updateInvitationExpiry(invitationId, expiresAt) {
  const { data, error } = await supabase.rpc('update_user_invitation_expiry', {
    p_invitation_id: invitationId,
    p_expires_at: expiresAt,
  })

  if (error) throw error
  return data
}

export async function copyInvitationLink(invitationId) {
  const { data, error } = await supabase.rpc('issue_user_invitation_token', {
    p_invitation_id: invitationId,
    p_extend_expiry: false,
  })

  if (error) throw error
  const payload = Array.isArray(data) ? data[0] ?? null : data
  if (!payload?.invitation_token) {
    throw new Error('Unable to generate invitation link')
  }

  return {
    invitationId: payload.invitation_id,
    expiresAt: payload.expires_at,
    activationUrl: `${window.location.origin}/accept-invite?token=${payload.invitation_token}`,
  }
}

export async function updateUserMembership(payload) {
  const { data, error } = await supabase.rpc('update_user_membership', {
    p_user_id: payload.userId,
    p_role: payload.role ?? null,
    p_department_id: payload.departmentId ?? null,
    p_status: payload.status ?? null,
    p_assigned_pastor_id: payload.assignedPastorId ?? null,
    p_reason: payload.reason ?? null,
  })

  if (error) throw error
  return data
}

export async function assignPastorMember(pastorId, memberId) {
  const { error } = await supabase.rpc('assign_pastor_member', {
    p_pastor_id: pastorId,
    p_member_id: memberId,
  })

  if (error) throw error
}

export async function removePastorMember(memberId) {
  const { error } = await supabase.rpc('remove_pastor_member', {
    p_member_id: memberId,
  })

  if (error) throw error
}

export async function createBulkInvitations(rows) {
  const { data, error } = await supabase.rpc('create_bulk_user_invitations', {
    p_rows: rows,
  })

  if (error) throw error
  return data
}

export async function previewInvitation(token) {
  const { data, error } = await supabase.rpc('preview_user_invitation', {
    p_token: token,
  })

  if (error) throw error
  return Array.isArray(data) ? data[0] ?? null : data
}

export async function acceptInvitation(token) {
  const { data, error } = await supabase.rpc('accept_user_invitation', {
    p_token: token,
  })

  if (error) throw error
  return data
}

export async function touchLastActive() {
  const { error } = await supabase.rpc('touch_last_active')
  if (error) throw error
}

export async function requestSprintAccess(sprintId) {
  const { data, error } = await supabase.rpc('request_sprint_access', {
    p_sprint_id: sprintId,
  })

  if (error) throw error
  return data
}

export async function getMySprintAccessRequests() {
  const { data, error } = await supabase
    .from('sprint_access_requests')
    .select('sprint_id, status, requested_at, response_message')
    .order('requested_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getSprintAccessRequests(sprintId) {
  const { data, error } = await supabase
    .from('sprint_access_requests')
    .select(`
      id,
      user_id,
      status,
      requested_at,
      responded_at,
      response_message,
      user:users!user_id(id, name, email)
    `)
    .eq('sprint_id', sprintId)
    .order('requested_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function approveSprintAccessRequest(requestId) {
  const { error } = await supabase.rpc('approve_sprint_access_request', {
    p_request_id: requestId,
  })

  if (error) throw error
}

export async function rejectSprintAccessRequest(requestId, message = null) {
  const { error } = await supabase.rpc('reject_sprint_access_request', {
    p_request_id: requestId,
    p_message: message,
  })

  if (error) throw error
}

export async function resetUserPassword(userId) {
  const { data, error } = await supabase.functions.invoke('reset-user-password', {
    body: {
      user_id: userId,
    },
  })

  if (error) {
    throw error
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}
