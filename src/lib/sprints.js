import { supabase } from './supabase'
import { normalizeTaskRows } from './taskStatuses'

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
      .filter((member) => member.sprint)
      .map((member) => ({ ...member.sprint, memberRole: member.role })),
  )
}

export async function getAllSprints() {
  const { data, error } = await supabase
    .from('sprints')
    .select('id, name, description, goal, status, start_date, end_date, created_at, archived_at, is_archived, department_id, created_by')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getSprintDetail(sprintId) {
  const [sprintRes, teamsRes, membersRes, teamMembershipsRes, reviewRes] = await Promise.all([
    supabase.from('sprints').select('id, name, description, goal, status, start_date, end_date, created_at, archived_at, is_archived, department_id, created_by').eq('id', sprintId).single(),
    supabase
      .from('sprint_teams')
      .select('*, lead:users!lead_user_id(id, name, email, avatar_url, status)')
      .eq('sprint_id', sprintId)
      .order('created_at'),
    supabase
      .from('sprint_members')
      .select(`
        role,
        joined_at,
        user:users(id, name, email, avatar_url, role, department_id, status)
      `)
      .eq('sprint_id', sprintId)
      .order('joined_at'),
    supabase
      .from('sprint_team_members')
      .select(`
        user_id,
        sprint_team_id,
        sprint_team:sprint_teams(id, name)
      `)
      .eq('sprint_id', sprintId),
    supabase.from('sprint_reviews').select('id, sprint_id, completed_at, completed_by, overall_summary, team_feedback, lessons_learned, created_at').eq('sprint_id', sprintId).maybeSingle(),
  ])

  if (sprintRes.error) throw sprintRes.error
  if (teamsRes.error) throw teamsRes.error
  if (membersRes.error) throw membersRes.error
  if (teamMembershipsRes.error) throw teamMembershipsRes.error
  if (reviewRes.error) throw reviewRes.error

  const teamMembershipsByUser = (teamMembershipsRes.data ?? []).reduce((acc, membership) => {
    if (!acc[membership.user_id]) acc[membership.user_id] = []
    acc[membership.user_id].push(membership)
    return acc
  }, {})

  const members = (membersRes.data ?? []).map((member) => {
    const memberships = teamMembershipsByUser[member.user?.id] ?? []
    return {
      ...member,
      team_memberships: memberships,
      sprint_team_ids: memberships.map((membership) => membership.sprint_team_id),
      sprint_teams: memberships.map((membership) => membership.sprint_team).filter(Boolean),
    }
  })

  return {
    sprint: sprintRes.data,
    teams: teamsRes.data ?? [],
    members,
    review: reviewRes.data ?? null,
  }
}

export async function createSprint(data, createdBy) {
  const { data: sprint, error } = await supabase
    .from('sprints')
    .insert({ ...data, created_by: createdBy })
    .select()
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
    .select()
    .single()

  if (error) throw error
  return data
}

export async function advanceSprintStatus(sprintId, newStatus) {
  const validTransitions = {
    planning: ['active'],
    active: ['completed'],
    completed: ['review'],
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
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSprintTeam(teamId, updates) {
  const { data, error } = await supabase
    .from('sprint_teams')
    .update(updates)
    .eq('id', teamId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteSprintTeam(teamId) {
  const { error } = await supabase.from('sprint_teams').delete().eq('id', teamId)
  if (error) throw error
}

export async function addSprintMember(sprintId, userId, role = 'contributor', teamIds = []) {
  const normalizedTeamIds = uniqueTeamIds(teamIds)

  const { data, error } = await supabase
    .from('sprint_members')
    .insert({ sprint_id: sprintId, user_id: userId, role })
    .select()
    .single()

  if (error) throw error

  if (normalizedTeamIds.length > 0) {
    const { error: teamError } = await supabase.from('sprint_team_members').insert(
      normalizedTeamIds.map((teamId) => ({
        sprint_id: sprintId,
        sprint_team_id: teamId,
        user_id: userId,
      })),
    )

    if (teamError) throw teamError
  }

  return data
}

export async function removeSprintMember(sprintId, userId) {
  const { error: teamMembershipError } = await supabase
    .from('sprint_team_members')
    .delete()
    .eq('sprint_id', sprintId)
    .eq('user_id', userId)

  if (teamMembershipError) throw teamMembershipError

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
    .select()
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
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateSprintMemberTeams(sprintId, userId, teamIds = []) {
  const normalizedTeamIds = uniqueTeamIds(teamIds)

  const { error: deleteError } = await supabase
    .from('sprint_team_members')
    .delete()
    .eq('sprint_id', sprintId)
    .eq('user_id', userId)

  if (deleteError) throw deleteError

  if (normalizedTeamIds.length === 0) return []

  const { data, error } = await supabase
    .from('sprint_team_members')
    .insert(
      normalizedTeamIds.map((teamId) => ({
        sprint_id: sprintId,
        sprint_team_id: teamId,
        user_id: userId,
      })),
    )
    .select()

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
    .select()
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
