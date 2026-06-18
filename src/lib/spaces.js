import { supabase } from './supabase'

export async function getMySpaces(userId, role, departmentId) {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, color, health_status, space_type, visibility, status, description, owner_id, start_date, end_date')
    .order('space_type')
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function getSpacesByType(userId, role, departmentId) {
  const spaces = await getMySpaces(userId, role, departmentId)
  return {
    department: spaces.filter((space) => space.space_type === 'department' && space.status === 'active'),
    program: spaces.filter((space) => space.space_type === 'program' && space.status === 'active'),
    personal: spaces.filter((space) => space.space_type === 'personal' && space.status === 'active'),
    sandbox: spaces.filter((space) => space.space_type === 'sandbox' && space.status === 'active'),
    archived: spaces.filter((space) => space.status === 'archived'),
  }
}

export async function getSpaceDetail(spaceId) {
  const spaceRes = await supabase.from('departments').select('id, name, color, health_status, space_type, visibility, status, description, owner_id, start_date, end_date, task_field_settings').eq('id', spaceId).single()

  if (spaceRes.error) throw spaceRes.error

  return {
    space: spaceRes.data,
  }
}

export async function createSpace(data, createdBy) {
  const { data: space, error } = await supabase
    .from('departments')
    .insert({
      name: data.name,
      description: data.description ?? null,
      space_type: data.space_type ?? 'program',
      visibility: data.visibility ?? 'org',
      status: 'active',
      color: data.color ?? '534AB7',
      owner_id: data.owner_id ?? createdBy,
      start_date: data.start_date ?? null,
      end_date: data.end_date ?? null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw error

  await supabase.from('space_lists').insert({
    space_id: space.id,
    name: 'General',
    sort_order: 0,
    created_by: createdBy,
  })

  const { error: statusError } = await supabase.rpc('clone_global_statuses_for_space', {
    p_department_id: space.id,
  })
  if (statusError) {
    console.warn(`Failed to create default task statuses for space ${space.id}:`, statusError)
  }

  return space
}

export async function updateSpace(spaceId, updates) {
  const { data, error } = await supabase
    .from('departments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', spaceId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function archiveSpace(spaceId) {
  return updateSpace(spaceId, { status: 'archived' })
}

export async function restoreSpace(spaceId) {
  return updateSpace(spaceId, { status: 'active' })
}

export async function getSpaceSprints(spaceId) {
  const { data, error } = await supabase
    .from('sprints')
    .select('id, name, description, goal, status, start_date, end_date, created_at, archived_at, is_archived, department_id')
    .eq('department_id', spaceId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getSpaceMeetings(spaceId) {
  const { data, error } = await supabase
    .from('meetings')
    .select('id, title, description, date, location, organizer_id, department_id, created_at, status')
    .eq('department_id', spaceId)
    .order('date', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getSpaceMembers(space) {
  if (!space?.id) return []

  if (space.space_type === 'department') {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, department_id, status')
      .eq('department_id', space.id)
      .order('name')

    if (error) throw error
    return data ?? []
  }

  const { data, error } = await supabase
    .from('space_members')
    .select(`
      role,
      created_at,
      user:users(id, name, email, role, department_id, status)
    `)
    .eq('space_id', space.id)

  if (error) throw error

  return (data ?? [])
    .filter((member) => member.user?.id)
    .map((member) => ({
      ...member.user,
      space_role: member.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function canManageSpace(spaceId) {
  const { data, error } = await supabase.rpc('can_manage_space', { space_uuid: spaceId })
  if (error) throw error
  return Boolean(data)
}

export const SPACE_TYPE_LABELS = {
  department: 'Department',
  program: 'Program',
  personal: 'Personal',
  sandbox: 'Sandbox',
}

export const SPACE_TYPE_ICONS = {
  department: '🏢',
  program: '⚡',
  personal: '👤',
  sandbox: '🧪',
}

export const VISIBILITY_LABELS = {
  private: 'Private',
  department: 'Department only',
  org: 'Everyone',
}
