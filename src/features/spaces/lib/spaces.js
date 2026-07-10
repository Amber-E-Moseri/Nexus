import { supabase } from '../../../lib/supabase'
import { normalizeTaskRow } from '../../../lib/taskStatuses'

export async function getMySpaces(userId, role, departmentId) {
  const { data, error } = await supabase
    .from('departments')
    .select('id, name, color, health_status, space_type, visibility, status, description, owner_id, start_date, end_date')
    .order('space_type')
    .order('name')

  if (error) throw error
  const spaces = data ?? []

  const isAdmin = role === 'super_admin' || role === 'dept_lead'

  return spaces.filter((space) => {
    if (space.space_type === 'personal') return space.owner_id === userId
    if (space.space_type === 'department') return role === 'super_admin' || space.id === departmentId
    if (isAdmin) return true
    // program / sandbox: enforce visibility for non-admins
    return space.visibility === 'org'
  })
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

  // Create default "General" folder
  const { data: generalFolder, error: folderError } = await supabase
    .from('folders')
    .insert({
      name: 'General',
      department_id: space.id,
      sort_order: 0,
      created_by: createdBy,
    })
    .select()
    .single()

  if (folderError) {
    console.warn(`Failed to create General folder for space ${space.id}:`, folderError)
  }

  // Create default "General" list inside that folder
  if (generalFolder) {
    const { error: listError } = await supabase
      .from('lists')
      .insert({
        name: 'General',
        department_id: space.id,
        folder_id: generalFolder.id,
        sort_order: 0,
        created_by: createdBy,
      })
    if (listError) {
      console.warn(`Failed to create General list for space ${space.id}:`, listError)
    }
  }

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

// Folders & Lists Management
export async function getFolders(departmentId) {
  const { data, error } = await supabase
    .from('folders')
    .select('id, name, sort_order, created_by, task_field_settings, visibility')
    .eq('department_id', departmentId)
    .order('sort_order')

  if (error) throw error
  return data ?? []
}

export async function getLists(departmentId, folderId = null) {
  let query = supabase
    .from('lists')
    .select('id, name, sort_order, folder_id, created_by, task_field_settings, visibility')
    .eq('department_id', departmentId)

  if (folderId) {
    query = query.eq('folder_id', folderId)
  }

  const { data, error } = await query.order('sort_order')

  if (error) throw error
  return data ?? []
}

export async function createFolder(departmentId, name, createdBy, extra = {}) {
  const { data: maxOrder } = await supabase
    .from('folders')
    .select('sort_order')
    .eq('department_id', departmentId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (maxOrder?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('folders')
    .insert({
      name: name.trim(),
      department_id: departmentId,
      sort_order: nextOrder,
      created_by: createdBy,
      ...(extra.description ? { description: extra.description } : {}),
      ...(extra.visibility ? { visibility: extra.visibility } : {}),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateFolder(folderId, updates) {
  const { data, error } = await supabase
    .from('folders')
    .update({ ...updates, name: updates.name?.trim?.() || updates.name })
    .eq('id', folderId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteFolder(folderId) {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', folderId)

  if (error) throw error
}

export async function createList(departmentId, name, folderId = null, createdBy, extra = {}) {
  let query = supabase.from('lists').select('sort_order')

  if (folderId) {
    query = query.eq('folder_id', folderId)
  } else {
    query = query.is('folder_id', null)
  }

  const { data: maxOrder } = await query.eq('department_id', departmentId).order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const nextOrder = (maxOrder?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('lists')
    .insert({
      name: name.trim(),
      department_id: departmentId,
      folder_id: folderId ?? null,
      sort_order: nextOrder,
      created_by: createdBy,
      ...(extra.visibility ? { visibility: extra.visibility } : {}),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateList(listId, updates) {
  const { data, error } = await supabase
    .from('lists')
    .update({ ...updates, name: updates.name?.trim?.() || updates.name })
    .eq('id', listId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteList(listId) {
  const { error } = await supabase
    .from('lists')
    .delete()
    .eq('id', listId)

  if (error) throw error
}

export async function getSpaceTasks(departmentId) {
  const { data: listRows } = await supabase
    .from('lists')
    .select('id')
    .eq('department_id', departmentId)

  const listIds = (listRows ?? []).map((l) => l.id)

  const filters = [`department_id.eq.${departmentId}`]
  if (listIds.length > 0) filters.push(`list_id.in.(${listIds.join(',')})`)

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id, title, status, status_id, priority, due_date, assignee_id, department_id, list_id, created_at, sprint_id,
      status_definition:task_status_definitions!status_id(id, name, color, category, department_id, sort_order, is_default, active, legacy_key)
    `)
    .or(filters.join(','))
    .is('parent_task_id', null)

  if (error) throw error
  return (data ?? []).map(normalizeTaskRow)
}

export async function getSpaceListsCount(departmentId) {
  const { count, error } = await supabase
    .from('lists')
    .select('id', { count: 'exact', head: true })
    .eq('department_id', departmentId)

  if (error) throw error
  return count ?? 0
}

export async function updateTaskDueDate(taskId, dueDate) {
  const { error } = await supabase
    .from('tasks')
    .update({ due_date: dueDate.toISOString().split('T')[0] })
    .eq('id', taskId)

  if (error) throw error
}

export async function getSpaceActivity(departmentId) {
  const { data: deptUserIds, error: usersError } = await supabase
    .from('users')
    .select('id')
    .eq('department_id', departmentId)

  if (usersError) throw usersError

  const ids = (deptUserIds || []).map((u) => u.id)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from('activity_log')
    .select('id, user_id, action, entity_type, entity_id, timestamp, user:users!user_id(id, name)')
    .gte('timestamp', thirtyDaysAgo)
    .order('timestamp', { ascending: false })
    .limit(50)

  if (ids.length > 0) {
    query = query.in('user_id', ids)
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

export async function updateFolderVisibility(folderId, visibility) {
  const { data, error } = await supabase
    .from('folders')
    .update({ visibility })
    .eq('id', folderId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateListVisibility(listId, visibility) {
  const { data, error } = await supabase
    .from('lists')
    .update({ visibility })
    .eq('id', listId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getFolderShares(folderId) {
  const { data, error } = await supabase
    .from('folder_shares')
    .select('id, user_id, user:users!user_id(id, name, email)')
    .eq('folder_id', folderId)

  if (error) throw error
  return data ?? []
}

export async function getListShares(listId) {
  const { data, error } = await supabase
    .from('list_shares')
    .select('id, user_id, user:users!user_id(id, name, email)')
    .eq('list_id', listId)

  if (error) throw error
  return data ?? []
}

export async function shareFolderWithUser(folderId, userId) {
  const { data, error } = await supabase
    .from('folder_shares')
    .insert({ folder_id: folderId, user_id: userId })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function shareListWithUser(listId, userId) {
  const { data, error } = await supabase
    .from('list_shares')
    .insert({ list_id: listId, user_id: userId })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function removeFolderShare(folderId, userId) {
  const { error } = await supabase
    .from('folder_shares')
    .delete()
    .eq('folder_id', folderId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function removeListShare(listId, userId) {
  const { error } = await supabase
    .from('list_shares')
    .delete()
    .eq('list_id', listId)
    .eq('user_id', userId)

  if (error) throw error
}
