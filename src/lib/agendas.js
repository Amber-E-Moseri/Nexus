import { supabase } from './supabase'

// ============================================================================
// Agenda CRUD Operations
// ============================================================================

export async function createAgenda(agendaData, agendaItems) {
  const { data: agendaRecord, error: agendaError } = await supabase
    .from('agendas')
    .insert([
      {
        title: agendaData.title,
        meeting_type: agendaData.meetingType,
        department_id: agendaData.departmentId,
        date: agendaData.date,
        start_time: agendaData.startTime,
        end_time: agendaData.endTime,
        location: agendaData.location || null,
        moderator_name: agendaData.moderator || null,
        theme: agendaData.theme,
        template_id: agendaData.templateId || null,
        created_by: agendaData.createdBy,
      },
    ])
    .select()
    .single()

  if (agendaError) {
    throw new Error(`Failed to create agenda: ${agendaError.message}`)
  }

  // Insert agenda items
  if (agendaItems && agendaItems.length > 0) {
    const itemsToInsert = agendaItems.map((item, index) => ({
      agenda_id: agendaRecord.id,
      segment: item.segment,
      notes: item.notes || null,
      duration_minutes: item.duration || 15,
      sort_order: index,
      is_pinned: item.isPinned || false,
    }))

    const { error: itemsError } = await supabase
      .from('agenda_items')
      .insert(itemsToInsert)

    if (itemsError) {
      // Clean up agenda if items fail
      await deleteAgenda(agendaRecord.id)
      throw new Error(`Failed to create agenda items: ${itemsError.message}`)
    }
  }

  return agendaRecord
}

export async function updateAgenda(agendaId, updates) {
  const updatePayload = {
    updated_at: new Date().toISOString(),
  }

  if (updates.title) updatePayload.title = updates.title
  if (updates.location !== undefined) updatePayload.location = updates.location || null
  if (updates.moderator !== undefined) updatePayload.moderator_name = updates.moderator || null
  if (updates.theme) updatePayload.theme = updates.theme
  if (updates.meeting_id) updatePayload.meeting_id = updates.meeting_id

  const { data, error } = await supabase
    .from('agendas')
    .update(updatePayload)
    .eq('id', agendaId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update agenda: ${error.message}`)
  }

  return data
}

export async function getAgenda(agendaId) {
  const { data: agenda, error: agendaError } = await supabase
    .from('agendas')
    .select('id, title, meeting_type, department_id, date, start_time, end_time, location, moderator_name, theme, template_id, created_by, meeting_id, is_archived, updated_at, created_at')
    .eq('id', agendaId)
    .single()

  if (agendaError) {
    throw new Error(`Failed to fetch agenda: ${agendaError.message}`)
  }

  const { data: items, error: itemsError } = await supabase
    .from('agenda_items')
    .select('id, agenda_id, segment, notes, duration_minutes, sort_order, is_pinned, created_at, updated_at')
    .eq('agenda_id', agendaId)
    .order('sort_order')

  if (itemsError) {
    throw new Error(`Failed to fetch agenda items: ${itemsError.message}`)
  }

  return { ...agenda, items }
}

export async function deleteAgenda(agendaId) {
  const { error } = await supabase
    .from('agendas')
    .delete()
    .eq('id', agendaId)

  if (error) {
    throw new Error(`Failed to delete agenda: ${error.message}`)
  }
}

export async function getDepartmentAgendas(departmentId) {
  const { data, error } = await supabase
    .from('agendas')
    .select('id, title, meeting_type, department_id, date, start_time, end_time, location, moderator_name, theme, template_id, created_by, meeting_id, is_archived, updated_at, created_at')
    .eq('department_id', departmentId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch agendas: ${error.message}`)
  }

  return data
}

// ============================================================================
// Agenda Items CRUD Operations
// ============================================================================

export async function updateAgendaItems(agendaId, items) {
  // Delete existing items
  const { error: deleteError } = await supabase
    .from('agenda_items')
    .delete()
    .eq('agenda_id', agendaId)

  if (deleteError) {
    throw new Error(`Failed to update agenda items: ${deleteError.message}`)
  }

  // Insert new items
  if (items && items.length > 0) {
    const itemsToInsert = items.map((item, index) => ({
      agenda_id: agendaId,
      segment: item.segment,
      notes: item.notes || null,
      duration_minutes: item.duration || 15,
      sort_order: index,
      is_pinned: item.isPinned || false,
    }))

    const { error: insertError } = await supabase
      .from('agenda_items')
      .insert(itemsToInsert)

    if (insertError) {
      throw new Error(`Failed to insert agenda items: ${insertError.message}`)
    }
  }
}

export async function getAgendaItems(agendaId) {
  const { data, error } = await supabase
    .from('agenda_items')
    .select('id, agenda_id, segment, notes, duration_minutes, sort_order, is_pinned, created_at, updated_at')
    .eq('agenda_id', agendaId)
    .order('sort_order')

  if (error) {
    throw new Error(`Failed to fetch agenda items: ${error.message}`)
  }

  return data
}

// ============================================================================
// Templates CRUD Operations
// ============================================================================

export async function getAgendaTemplates(departmentId = null) {
  let query = supabase
    .from('agenda_templates')
    .select('id, name, description, meeting_type, items, department_id, created_by, is_default, is_archived, created_at, updated_at')
    .eq('is_archived', false)

  // Get default templates + department templates
  if (departmentId) {
    query = supabase
      .from('agenda_templates')
      .select('id, name, description, meeting_type, items, department_id, created_by, is_default, is_archived, created_at, updated_at')
      .or(`is_default.eq.true,department_id.eq.${departmentId}`)
      .eq('is_archived', false)
  } else {
    query = query.eq('is_default', true)
  }

  const { data, error } = await query.order('name')

  if (error) {
    throw new Error(`Failed to fetch templates: ${error.message}`)
  }

  return data
}

export async function getTemplate(templateId) {
  const { data, error } = await supabase
    .from('agenda_templates')
    .select('id, name, description, meeting_type, items, department_id, created_by, is_default, is_archived, created_at, updated_at')
    .eq('id', templateId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch template: ${error.message}`)
  }

  return data
}

export async function createTemplate(templateData) {
  const { data, error } = await supabase
    .from('agenda_templates')
    .insert([
      {
        name: templateData.name,
        description: templateData.description || null,
        meeting_type: templateData.meetingType,
        items: templateData.items || [],
        department_id: templateData.departmentId || null,
        created_by: templateData.createdBy,
        is_default: false,
      },
    ])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create template: ${error.message}`)
  }

  return data
}

export async function updateTemplate(templateId, updates) {
  const { data, error } = await supabase
    .from('agenda_templates')
    .update({
      name: updates.name,
      description: updates.description || null,
      items: updates.items || [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', templateId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update template: ${error.message}`)
  }

  return data
}

export async function deleteTemplate(templateId) {
  const { error } = await supabase
    .from('agenda_templates')
    .delete()
    .eq('id', templateId)

  if (error) {
    throw new Error(`Failed to delete template: ${error.message}`)
  }
}

// ============================================================================
// Helper: Create Meeting with Agenda (atomic operation)
// ============================================================================

export async function createMeetingWithAgenda(meetingData, agendaData, agendaItems) {
  // First create the agenda
  const agenda = await createAgenda(agendaData, agendaItems)

  // Then create the meeting linked to the agenda
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .insert([
      {
        title: meetingData.title || agendaData.title,
        department_id: agendaData.departmentId,
        date: new Date(agendaData.date).toISOString(),
        meeting_type: agendaData.meetingType,
        summary: meetingData.summary || null,
        minutes: meetingData.minutes || null,
        created_by: agendaData.createdBy,
        zoom_join_url: meetingData.zoomJoinUrl || null,
        drive_url: meetingData.driveUrl || null,
      },
    ])
    .select()
    .single()

  if (meetingError) {
    // Clean up agenda if meeting creation fails
    await deleteAgenda(agenda.id)
    throw new Error(`Failed to create meeting: ${meetingError.message}`)
  }

  // Link agenda to meeting
  await updateAgenda(agenda.id, { meeting_id: meeting.id })

  return { meeting, agenda }
}
