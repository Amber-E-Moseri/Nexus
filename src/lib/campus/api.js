import { supabase } from '../supabase'

/**
 * Submit a campus edit for ORS review
 * Compares current campus values with proposed changes and inserts rows to campus_edits table
 * @param {string} campusId - UUID of campus to edit
 * @param {Object} changes - Object with field names as keys and new values as values
 * @returns {Promise<Array>} Array of inserted edit records
 */
export async function submitCampusEdit(campusId, changes) {
  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('User not authenticated')

  // Fetch current campus data to compare old values
  const { data: campus, error: fetchError } = await supabase
    .from('campuses')
    .select('*')
    .eq('id', campusId)
    .single()

  if (fetchError || !campus) throw new Error('Campus not found')

  // Filter changes: only include fields that actually changed
  const validFields = ['name', 'institution', 'campus_name_alt', 'latitude', 'longitude', 'spotify_playlist_id']
  const changedFields = Object.entries(changes)
    .filter(([key, newVal]) => {
      const isValidField = validFields.includes(key)
      const hasChanged = String(campus[key] || '') !== String(newVal || '')
      return isValidField && hasChanged
    })
    .map(([field, newVal]) => ({
      campus_id: campusId,
      field_name: field,
      old_value: String(campus[field] || ''),
      new_value: String(newVal),
      submitted_by: user.id,
      status: 'pending',
    }))

  // Validation: at least one field must have changed
  if (changedFields.length === 0) {
    throw new Error('No changes detected. Please modify at least one field.')
  }

  // Insert all changed fields as separate rows
  const { data: inserted, error: insertError } = await supabase
    .from('campus_edits')
    .insert(changedFields)
    .select()

  if (insertError) throw insertError

  return inserted
}

/**
 * Get pending campus edits (ORS dashboard)
 * @returns {Promise<Array>} Array of pending edit records with submitted user info
 */
export async function getPendingCampusEdits() {
  const { data, error } = await supabase
    .from('campus_edits')
    .select(`
      *,
      campus:campus_id (name, institution),
      submitted_user:submitted_by (id, name, email)
    `)
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false })

  if (error) throw error
  return data || []
}

/**
 * Approve a campus edit and apply it to the campuses table
 * @param {string} editId - UUID of the campus_edit record
 * @param {Object} options - { notes?: string }
 * @returns {Promise<void>}
 */
export async function approveCampusEdit(editId, options = {}) {
  // Get the edit record
  const { data: edit, error: fetchError } = await supabase
    .from('campus_edits')
    .select('*')
    .eq('id', editId)
    .single()

  if (fetchError || !edit) throw new Error('Edit record not found')

  // Get current user (reviewer)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('User not authenticated')

  // Update the campuses table with the new value
  const updatePayload = {
    [edit.field_name]: edit.new_value,
    updated_at: new Date().toISOString(),
  }

  const { error: updateError } = await supabase
    .from('campuses')
    .update(updatePayload)
    .eq('id', edit.campus_id)

  if (updateError) throw updateError

  // Mark the edit as approved
  const { error: approveError } = await supabase
    .from('campus_edits')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      notes: options.notes || null,
    })
    .eq('id', editId)

  if (approveError) throw approveError
}

/**
 * Reject a campus edit
 * @param {string} editId - UUID of the campus_edit record
 * @param {Object} options - { notes?: string }
 * @returns {Promise<void>}
 */
export async function rejectCampusEdit(editId, options = {}) {
  // Get current user (reviewer)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('User not authenticated')

  const { error } = await supabase
    .from('campus_edits')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      notes: options.notes || null,
    })
    .eq('id', editId)

  if (error) throw error
}
