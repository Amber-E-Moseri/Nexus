export function selectActiveUsers(users) {
  return users.filter((user) => user.status === 'active')
}

export function selectInactiveUsers(users) {
  return users.filter((user) => user.status === 'inactive')
}

export function selectPendingInvitations(invitations) {
  return invitations.filter((invitation) => invitation.status === 'pending')
}

export function selectDepartmentUsers(users, departmentId) {
  if (!departmentId) return users
  return users.filter((user) => user.department_id === departmentId)
}

export function selectPastorMembers(users, pastorMembers, pastorId) {
  const memberIds = new Set(
    pastorMembers
      .filter((assignment) => assignment.pastor_id === pastorId)
      .map((assignment) => assignment.member_id),
  )

  return users.filter((user) => memberIds.has(user.id))
}

export function selectUserLifecycleStats({ users, invitations, pastorMembers, role, profile }) {
  let scopedUsers = users
  let scopedInvitations = invitations

  if (role === 'dept_lead') {
    scopedUsers = selectDepartmentUsers(users, profile?.department_id)
    scopedInvitations = invitations.filter((invitation) => invitation.department_id === profile?.department_id)
  }

  if (role === 'pastor') {
    scopedUsers = selectPastorMembers(users, pastorMembers, profile?.id)
    const memberEmails = new Set(scopedUsers.map((user) => user.email?.toLowerCase()))
    scopedInvitations = invitations.filter((invitation) => {
      const email = invitation.email?.toLowerCase()
      return invitation.assigned_pastor_id === profile?.id || memberEmails.has(email)
    })
  }

  const activeUsers = selectActiveUsers(scopedUsers)
  const inactiveUsers = selectInactiveUsers(scopedUsers)
  const pendingInvitations = selectPendingInvitations(scopedInvitations)
  const recentlyActivated = scopedUsers.filter((user) => {
    if (!user.activated_at) return false
    const ageMs = Date.now() - new Date(user.activated_at).getTime()
    return ageMs <= 1000 * 60 * 60 * 24 * 14
  })
  const usersNeedingAttention = scopedUsers.filter((user) =>
    ['inactive', 'pending_activation', 'archived'].includes(user.status),
  )

  return {
    activeUsers: activeUsers.length,
    inactiveUsers: inactiveUsers.length,
    pendingInvitations: pendingInvitations.length,
    recentlyActivated: recentlyActivated.length,
    usersNeedingAttention: usersNeedingAttention.length,
  }
}
