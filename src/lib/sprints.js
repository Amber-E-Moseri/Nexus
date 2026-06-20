import { supabase } from './supabase'
import { normalizeTaskRows } from './taskStatuses'
import { createNotification } from './notifications'

const SPRINT_TEAM_SELECT = 'id, sprint_id, name, description, lead_user_id, created_at'
const SPRINT_TEAM_MEMBERS_SELECT = 'id, team_id, user_id, role, joined_at, users:user_id(id, name, email, department_id, status)'
const SPRINT_MEMBER_SELECT = 'sprint_id, user_id, role, joined_at'
const SPRINT_MEMBER_WITH_TEMP_SELECT = 'sprint_id, user_id, role, joined_at, membership_end_date, is_temporary, invited_by'
const TEMP_MEMBER_SELECT = 'id, sprint_id, user_id, role, membership_end_date, is_temporary, invited_by, joined_at, users:user_id(id, name, email, status, is_temporary)'
const SPRINT_REVIEW_SELECT = 'id, sprint_id, completed_at, completed_by, lessons_learned, goals_achieved, outstanding_items, wins_testimonies, recommendations, final_decisions, created_at'
const VALID_SPRINT_STATUSES = ['planning', 'active', 'completed', 'review', 'archived']

function sortByCreatedAtDesc(items = []) {
  return [...items].sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
}

function uniqueTeamIds(teamIds = []) {
  return [...new Set((teamIds ?? []).filter(Boolean))]
}

export function calculateSprintTaskStats(tasks = []) {
  const total = tasks.length
  const done = tasks.filter((task) => task.status_definition?.category === 'completed').length
  return { done, total }
}

export function shouldAutoStartSprint(sprint) {
  if (sprint.status !== 'planning' || !sprint.start_date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDate = new Date(sprint.start_date)
  startDate.setHours(0, 0, 0, 0)
  return startDate <= today
}

export async function getMySprints() {
  const { data, error } = await supabase
    .from('sprint_members')
    .select(`
      role,
      sprint:sprints(
        id, name, description, goal, status,
        start_date, end_date, created_at, archived_at, is_archived
      )
    `)

  if (error) throw error

  return sortByCreatedAtDesc(
    (data ?? [])
      .filter((member) => member.sprint && VALID_SPRINT_STATUSES.includes(member.sprint.status))
      .map((member) => ({ ...member.sprint, memberRole: member.role })),
  )
}

export async function getAllSprints() {
  const { data, error } = await supabase
    .from('sprints')
    .select('id, name, description, goal, status, start_date, end_date, created_at, archived_at, is_archived, department_id, created_by')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).filter((sprint) => VALID_SPRINT_STATUSES.includes(sprint.status))
}

export async function getSprintDetail(sprintId) {
  const sprintRes = await supabase
    .from('sprints')
    .select('id, name, description, goal, status, start_date, end_date, created_at, archived_at, is_archived, department_id, created_by')
    .eq('id', sprintId)
    .single()

  if (sprintRes.error) throw sprintRes.error

  const [teamsRes, membersRes, reviewRes] = await Promise.all([
    supabase.from('sprint_teams').select(SPRINT_TEAM_SELECT).eq('sprint_id', sprintId).order('created_at'),
    supabase.from('sprint_members').select(`${SPRINT_MEMBER_WITH_TEMP_SELECT}, user:user_id(id, name, email, status, is_temporary)`).eq('sprint_id', sprintId).order('joined_at'),
    (async () => {
      try {
        return await supabase.from('sprint_reviews').select(SPRINT_REVIEW_SELECT).eq('sprint_id', sprintId).maybeSingle()
      } catch {
        return { data: null }
      }
    })(),
  ])

  if (teamsRes.error) throw teamsRes.error
  if (membersRes.error) throw membersRes.error
  if (reviewRes.error && reviewRes.error.code !== 'PGRST116') throw reviewRes.error

  const membersWithTeams = (membersRes.data ?? []).map((member) => ({
    ...member,
    sprint_team_ids: member.sprint_team_id ? [member.sprint_team_id] : [],
  }))

  return {
    sprint: sprintRes.data,
    teams: teamsRes.data ?? [],
    members: membersWithTeams,
    review: reviewRes.data ?? null,
  }
}

export async function createSprint(data, createdBy) {
  const { data: sprint, error } = await supabase
    .from('sprints')
    .insert({ ...data, created_by: createdBy })
    .select('id, name, description, goal, status, start_date, end_date, created_at, archived_at, is_archived, department_id, created_by')
    .single()

  if (error) throw error

  const { error: memberError } = await supabase
    .from('sprint_members')
    .insert({
      sprint_id: sprint.id,
      user_id: createdBy,
      role: 'owner',
    })

  if (memberError) throw memberError
  return sprint
}

export async function updateSprint(sprintId, updates) {
  const { data, error } = await supabase
    .from('sprints')
    .update(updates)
    .eq('id', sprintId)
    .select('id, name, description, goal, status, start_date, end_date, created_at, archived_at, is_archived, department_id, created_by')
    .single()

  if (error) throw error
  return data
}

export async function advanceSprintStatus(sprintId, newStatus) {
  const validTransitions = {
    planning: ['active', 'archived'],
    active: ['completed', 'archived'],
    completed: ['review', 'archived'],
    review: ['archived'],
    archived: [],
  }

  const { data: sprint, error } = await supabase
    .from('sprints')
    .select('status')
    .eq('id', sprintId)
    .single()

  if (error) throw error
  if (!validTransitions[sprint.status]?.includes(newStatus)) {
    throw new Error(`Cannot transition from ${sprint.status} to ${newStatus}`)
  }

  const updates = { status: newStatus }
  if (newStatus === 'archived') {
    updates.is_archived = true
    updates.archived_at = new Date().toISOString()
  }

  return updateSprint(sprintId, updates)
}

export async function deleteSprint(sprintId) {
  const { error } = await supabase.from('sprints').delete().eq('id', sprintId)
  if (error) throw error
}

export async function restoreSprint(sprintId, departmentId) {
  if (departmentId) {
    const { data: activeSprints, error: checkError } = await supabase
      .from('sprints')
      .select('id, name')
      .eq('department_id', departmentId)
      .eq('status', 'active')
      .limit(1)

    if (checkError) throw checkError

    if (activeSprints?.length > 0) {
      return {
        error: `Cannot restore: "${activeSprints[0].name}" is already active in this space. Complete or archive it first.`,
      }
    }
  }

  const result = await updateSprint(sprintId, {
    status: 'active',
    is_archived: false,
    archived_at: null,
  })

  return { success: true, data: result }
}

export async function duplicateSprint(sprintId, createdBy) {
  const { sprint, teams } = await getSprintDetail(sprintId)

  const newSprint = await createSprint(
    {
      name: `${sprint.name} (Copy)`,
      description: sprint.description,
      goal: sprint.goal,
      status: 'planning',
      start_date: null,
      end_date: null,
      department_id: sprint.department_id ?? null,
    },
    createdBy,
  )

  if (teams.length > 0) {
    const { error } = await supabase.from('sprint_teams').insert(
      teams.map((team) => ({
        sprint_id: newSprint.id,
        name: team.name,
        description: team.description,
        lead_user_id: team.lead_user_id ?? null,
      })),
    )
    if (error) throw error
  }

  return newSprint
}

export async function createSprintTeam(sprintId, name, description, leadUserId = null) {
  const { data, error } = await supabase
    .from('sprint_teams')
    .insert({ sprint_id: sprintId, name, description, lead_user_id: leadUserId })
    .select(SPRINT_TEAM_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function updateSprintTeam(teamId, updates) {
  const { data, error } = await supabase
    .from('sprint_teams')
    .update(updates)
    .eq('id', teamId)
    .select(SPRINT_TEAM_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function deleteSprintTeam(teamId) {
  const { error } = await supabase.from('sprint_teams').delete().eq('id', teamId)
  if (error) throw error
}

// ─────────────────────────────────────────────────────────────
// NEW: Independent Teams (decoupled from sprints)
// ─────────────────────────────────────────────────────────────

export async function createIndependentTeam(
  name,
  description = '',
  leadUserId = null,
  sprintId = null,
) {
  const { data: user } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('sprint_teams')
    .insert({
      name,
      description,
      lead_user_id: leadUserId,
      sprint_id: sprintId,
      is_archived: false,
      created_by: user.user.id,
    })
    .select(
      'id, name, description, lead_user_id, sprint_id, source_space_id, is_archived, created_by, created_at',
    )
    .single()

  if (error) throw error
  return data
}

export async function createTeamFromSpace(spaceId, sprintId = null) {
  const { data: user } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Get space details
  const { data: space, error: spaceError } = await supabase
    .from('spaces')
    .select('id, title')
    .eq('id', spaceId)
    .single()
  if (spaceError) throw spaceError

  // Get all space members
  const { data: spaceMembers, error: membersError } = await supabase
    .from('space_members')
    .select('user_id')
    .eq('space_id', spaceId)
  if (membersError) throw membersError

  // Create team
  const { data: team, error: teamError } = await supabase
    .from('sprint_teams')
    .insert({
      name: space.title,
      description: `Team created from space: ${space.title}`,
      sprint_id: sprintId,
      source_space_id: spaceId,
      is_archived: false,
      created_by: user.user.id,
    })
    .select(
      'id, name, description, lead_user_id, sprint_id, source_space_id, is_archived, created_by, created_at',
    )
    .single()
  if (teamError) throw teamError

  // Add all space members to team
  if (spaceMembers.length > 0) {
    const memberInserts = spaceMembers.map((member) => ({
      team_id: team.id,
      user_id: member.user_id,
      joined_at: new Date().toISOString(),
    }))
    const { error: insertError } = await supabase
      .from('sprint_team_members')
      .insert(memberInserts)
    if (insertError) throw insertError
  }

  return team
}

export async function getTeamDetail(teamId) {
  const { data, error } = await supabase
    .from('sprint_teams')
    .select(
      `
      id, name, description, lead_user_id, sprint_id, source_space_id,
      is_archived, created_by, created_at,
      sprint_team_members (${SPRINT_TEAM_MEMBERS_SELECT})
    `,
    )
    .eq('id', teamId)
    .single()

  if (error) throw error
  return data
}

export async function listAllTeams() {
  const { data, error } = await supabase
    .from('sprint_teams')
    .select(
      `
      id, name, description, sprint_id, source_space_id,
      lead_user_id, is_archived, created_at,
      sprint_team_members (
        id, user_id,
        users:user_id (id, name, email, department_id)
      )
    `,
    )
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function listSprintTeamsIndependent(sprintId) {
  const { data, error } = await supabase
    .from('sprint_teams')
    .select(
      `
      id, name, description, lead_user_id,
      sprint_team_members (
        id, user_id,
        users:user_id (id, name, email)
      )
    `,
    )
    .eq('sprint_id', sprintId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function addTeamMember(teamId, userId, role = null) {
  const { data, error } = await supabase
    .from('sprint_team_members')
    .insert({
      team_id: teamId,
      user_id: userId,
      role,
    })
    .select(SPRINT_TEAM_MEMBERS_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function removeTeamMember(teamId, userId) {
  const { error } = await supabase
    .from('sprint_team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function assignTeamToSprint(teamId, sprintId) {
  const { data, error } = await supabase
    .from('sprint_teams')
    .update({ sprint_id: sprintId })
    .eq('id', teamId)
    .select('id, name, sprint_id, is_archived, created_at, sprint_team_members (id, user_id)')
    .single()

  if (error) throw error
  return data
}

export async function unassignTeamFromSprint(teamId) {
  const { data, error } = await supabase
    .from('sprint_teams')
    .update({ sprint_id: null })
    .eq('id', teamId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function archiveTeam(teamId) {
  const { data, error } = await supabase
    .from('sprint_teams')
    .update({ is_archived: true, sprint_id: null })
    .eq('id', teamId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addSprintMember(sprintId, userId, role = 'contributor', teamIds = [], membershipEndDate = null) {
  const normalizedTeamIds = uniqueTeamIds(teamIds)
  const sprintTeamId = normalizedTeamIds.length > 0 ? normalizedTeamIds[0] : null

  const insertPayload = {
    sprint_id: sprintId,
    user_id: userId,
    role,
    sprint_team_id: sprintTeamId,
  }

  // Add optional membership end date if provided (for team-based temporary memberships)
  if (membershipEndDate) {
    insertPayload.membership_end_date = membershipEndDate
  }

  const { data, error } = await supabase
    .from('sprint_members')
    .insert(insertPayload)
    .select(SPRINT_MEMBER_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function removeSprintMember(sprintId, userId) {
  const { error } = await supabase
    .from('sprint_members')
    .delete()
    .eq('sprint_id', sprintId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function updateSprintMemberRole(sprintId, userId, role) {
  const { data, error } = await supabase
    .from('sprint_members')
    .update({ role })
    .eq('sprint_id', sprintId)
    .eq('user_id', userId)
    .select(SPRINT_MEMBER_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function updateSprintMember(sprintId, userId, updates) {
  const { data, error } = await supabase
    .from('sprint_members')
    .update(updates)
    .eq('sprint_id', sprintId)
    .eq('user_id', userId)
    .select(SPRINT_MEMBER_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function updateSprintMemberTeams(sprintId, userId, teamIds = []) {
  const normalizedTeamIds = uniqueTeamIds(teamIds)
  const newTeamId = normalizedTeamIds.length > 0 ? normalizedTeamIds[0] : null

  const { data, error } = await supabase
    .from('sprint_members')
    .update({ sprint_team_id: newTeamId })
    .eq('sprint_id', sprintId)
    .eq('user_id', userId)
    .select('sprint_id, user_id, sprint_team_id')

  if (error) throw error
  return data ?? []
}

export async function getSprintMembers(sprintId) {
  const { data, error } = await supabase
    .from('sprint_members')
    .select('user:users(id, name, avatar_url, role, status)')
    .eq('sprint_id', sprintId)

  if (error) throw error

  return (data ?? [])
    .map((item) => item.user)
    .filter(Boolean)
    .filter((user) => user.status === 'active' || user.status == null)
}

export async function getActiveUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, department_id, status')
    .eq('status', 'active')
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function getSprintTasks(sprintId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      status_id,
      status_definition:task_status_definitions!status_id(
        id, name, color, category, department_id, sort_order, is_default, active, legacy_key
      ),
      assignee:users!assignee_id(id, name, avatar_url),
      subtasks:tasks!parent_task_id(
        id, title, status, status_id, sprint_id, task_type,
        status_definition:task_status_definitions!status_id(
          id, name, color, category, department_id, sort_order, is_default, active, legacy_key
        )
      ),
      comments:task_comments(count),
      files:task_files(count),
      dependencies:task_dependencies!task_id(count)
    `)
    .eq('sprint_id', sprintId)
    .eq('task_type', 'sprint')
    .is('parent_task_id', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return normalizeTaskRows(data)
}

export async function saveSprintReview(sprintId, reviewData, completedBy) {
  const { data, error } = await supabase
    .from('sprint_reviews')
    .upsert(
      {
        sprint_id: sprintId,
        ...reviewData,
        completed_by: completedBy,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'sprint_id' },
    )
    .select(SPRINT_REVIEW_SELECT)
    .single()

  if (error) throw error
  return data
}

export async function getSprintReview(sprintId) {
  const { data, error } = await supabase
    .from('sprint_reviews')
    .select('id, sprint_id, completed_at, completed_by, overall_summary, team_feedback, lessons_learned, created_at')
    .eq('sprint_id', sprintId)
    .maybeSingle()

  if (error) throw error
  return data
}

// ─────────────────────────────────────────────────────────────
// Temporary Sprint Invites
// ─────────────────────────────────────────────────────────────

export async function inviteExternalToSprint(payload) {
  const {
    email,
    name,
    sprintId,
    role = 'contributor',
    membershipEndDate,
  } = payload

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: userId, error } = await supabase.rpc('invite_external_sprint_member', {
    p_email: email.trim().toLowerCase(),
    p_name: name?.trim() || '',
    p_sprint_id: sprintId,
    p_role: role,
    p_end_date: membershipEndDate || null,
  })

  if (error) throw error

  return { userId, isNewUser: true }
}

export async function getTemporarySprintMembers(sprintId) {
  const { data, error } = await supabase
    .from('sprint_members')
    .select(TEMP_MEMBER_SELECT)
    .eq('sprint_id', sprintId)
    .eq('is_temporary', true)
    .order('membership_end_date', { ascending: true })

  if (error) throw error
  return data
}

export async function updateSprintMembershipEndDate(sprintMemberId, newEndDate) {
  const { data: user } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Get member details
  const { data: member, error: fetchError } = await supabase
    .from('sprint_members')
    .select('sprint_id, user_id, is_temporary')
    .eq('sprint_id', sprintMemberId.split(':')[0])
    .eq('user_id', sprintMemberId.split(':')[1])
    .maybeSingle()

  // Try another approach - query by sprint and user
  const parts = sprintMemberId.split(':')
  if (parts.length === 2) {
    const [sprintId, userId] = parts

    const { data: sm } = await supabase
      .from('sprint_members')
      .select('sprint_id, user_id, is_temporary')
      .eq('sprint_id', sprintId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!sm?.is_temporary) {
      throw new Error('Can only update end date for temporary members')
    }

    const { data: sprint } = await supabase
      .from('sprints')
      .select('created_by')
      .eq('id', sprintId)
      .single()

    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.user.id)
      .single()

    const canUpdate = sprint.created_by === user.user.id || currentUser.role === 'super_admin'
    if (!canUpdate) {
      throw new Error('Only sprint owner or super admin can update end date')
    }

    const { data, error } = await supabase
      .from('sprint_members')
      .update({ membership_end_date: newEndDate })
      .eq('sprint_id', sprintId)
      .eq('user_id', userId)
      .select(SPRINT_MEMBER_WITH_TEMP_SELECT)
      .single()

    if (error) throw error
    return data
  }

  throw new Error('Invalid sprint member ID format')
}

export async function deactivateExpiredSprintMembers() {
  const today = new Date().toISOString().split('T')[0]

  // Step 1: Find all expired temporary members
  const { data: expiredMembers, error: fetchError } = await supabase
    .from('sprint_members')
    .select('user_id, membership_end_date, sprint_id')
    .eq('is_temporary', true)
    .lte('membership_end_date', today)

  if (fetchError) throw fetchError

  if (expiredMembers.length === 0) {
    return { deactivated: 0, message: 'No expired temporary members' }
  }

  // Step 2: Get unique user IDs
  const userIds = [...new Set(expiredMembers.map((m) => m.user_id))]

  // Step 3: Deactivate each user
  const { error: updateError } = await supabase
    .from('users')
    .update({
      status: 'inactive',
      inactivated_at: new Date().toISOString(),
    })
    .in('id', userIds)

  if (updateError) throw updateError

  // Step 4: Send notifications (create notification records)
  for (const userId of userIds) {
    try {
      await createNotification(userId, 'sprint_access_ended', {
        title: 'Sprint Access Ended',
        message: 'Your temporary sprint access has ended. Your account is now inactive.',
      })
    } catch (err) {
      console.error('Error creating notification:', err)
    }
  }

  return {
    deactivated: userIds.length,
    userIds,
    message: `Deactivated ${userIds.length} temporary member(s)`,
  }
}

export async function archiveSprintWithAutoDeactivation(sprintId) {
  // Step 1: Archive the sprint
  const { error: archiveError } = await supabase
    .from('sprints')
    .update({
      status: 'archived',
      is_archived: true,
      archived_at: new Date().toISOString(),
    })
    .eq('id', sprintId)

  if (archiveError) throw archiveError

  // Step 2: Immediately deactivate temporary members of THIS sprint
  const { data: tempMembers } = await supabase
    .from('sprint_members')
    .select('user_id')
    .eq('sprint_id', sprintId)
    .eq('is_temporary', true)

  if (tempMembers && tempMembers.length > 0) {
    const userIds = tempMembers.map((m) => m.user_id)
    await supabase
      .from('users')
      .update({
        status: 'inactive',
        inactivated_at: new Date().toISOString(),
      })
      .in('id', userIds)

    // Notify each
    for (const userId of userIds) {
      try {
        await createNotification(userId, 'sprint_archived', {
          title: 'Sprint Archived',
          message: 'The sprint you were working on has been archived. Your access is now inactive.',
        })
      } catch (err) {
        console.error('Error creating notification:', err)
      }
    }
  }

  return { archived: true, deactivated: tempMembers?.length || 0 }
}

export async function reactivateTemporaryMember(userId) {
  const { data: user } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify permission: must be super admin
  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.user.id)
    .single()

  const { data: targetUser } = await supabase
    .from('users')
    .select('is_temporary')
    .eq('id', userId)
    .single()

  if (!targetUser?.is_temporary) {
    throw new Error('Can only reactivate temporary members')
  }

  // Check if super admin or owner of a sprint with this user
  if (currentUser.role !== 'super_admin') {
    const { data: sprintsUserIsIn } = await supabase
      .from('sprint_members')
      .select('sprint_id')
      .eq('user_id', userId)

    const { data: ownedSprints } = await supabase
      .from('sprints')
      .select('id')
      .eq('created_by', user.user.id)
      .in(
        'id',
        sprintsUserIsIn?.map((m) => m.sprint_id) || [],
      )

    if (!ownedSprints || ownedSprints.length === 0) {
      throw new Error('Only super admin or sprint owner can reactivate temporary members')
    }
  }

  // Reactivate
  const { data, error } = await supabase
    .from('users')
    .update({
      status: 'active',
      activated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error

  // Notify
  try {
    await createNotification(userId, 'account_reactivated', {
      title: 'Account Reactivated',
      message: 'Your account has been reactivated. You can login again.',
    })
  } catch (err) {
    console.error('Error creating notification:', err)
  }

  return data
}

export async function sendSprintInvitationEmail(payload) {
  const { userId, email, name, sprintId, membershipEndDate, isNewAccount } = payload

  // Get sprint details
  const { data: sprint } = await supabase
    .from('sprints')
    .select('id, name, end_date')
    .eq('id', sprintId)
    .single()

  if (!sprint) throw new Error('Sprint not found')

  // Prepare email content
  const subject = isNewAccount ? `You're invited to ${sprint.name} sprint` : `You've been added to ${sprint.name} sprint`

  const actionUrl = isNewAccount
    ? `${import.meta.env.VITE_APP_URL || 'http://localhost:5173'}/auth/set-password?email=${encodeURIComponent(email)}`
    : `${import.meta.env.VITE_APP_URL || 'http://localhost:5173'}/sprints/${sprintId}`

  const expiresDate = new Date(membershipEndDate).toLocaleDateString()

  const body = isNewAccount
    ? `You've been invited to join the ${sprint.name} sprint (ends ${expiresDate}).\n\nThis is a temporary invitation. After the sprint ends, your access will be deactivated.\n\nTo get started, click the link below to set up your account:\n${actionUrl}\n\nYour temporary access expires: ${expiresDate}`
    : `You've been added to the ${sprint.name} sprint (ends ${expiresDate}).\n\nView the sprint: ${actionUrl}\n\nYour temporary access expires: ${expiresDate}`

  // Log email sending (since we might not have Resend configured)
  console.log('Email invitation sent:', {
    to: email,
    subject,
    body,
  })

  // Note: In production, integrate with Resend or your email service
  // For now, just logging the email
  return {
    success: true,
    message: 'Invitation email prepared (logging enabled)',
  }
}
