import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.1'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function verifyUserRole(authToken: string): Promise<{ userId: string; role: string } | null> {
  try {
    // Get user from auth header
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken)
    if (authError || !user) return null

    // Get user profile with role
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) return null

    return {
      userId: profile.id,
      role: profile.role,
    }
  } catch (error) {
    console.error('Auth error:', error)
    return null
  }
}

async function userHasPermission(userId: string, permissionKey: string): Promise<boolean> {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (!user) return false
    if (user.role === 'super_admin') return true

    const { data: permission } = await supabase
      .from('role_permissions')
      .select('enabled')
      .eq('role', user.role)
      .eq('permission_key', permissionKey)
      .maybeSingle()

    return permission?.enabled || false
  } catch (err) {
    console.error('Permission check error:', err)
    return false
  }
}

Deno.serve(async (req) => {
  // Only POST allowed
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Parse request body
    const body = await req.json()
    const { edit_id, action, notes } = body

    // Validate input
    if (!edit_id || !action || !['approve', 'reject'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request. Required: edit_id, action (approve|reject)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get auth token from header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')

    // Verify user role
    const userInfo = await verifyUserRole(token)
    if (!userInfo) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if user has campus:approve permission
    const hasPermission = await userHasPermission(userInfo.userId, 'campus:approve')
    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: campus:approve permission required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get the edit record
    const { data: edit, error: editError } = await supabase
      .from('campus_edits')
      .select('*')
      .eq('id', edit_id)
      .single()

    if (editError || !edit) {
      return new Response(JSON.stringify({ error: 'Edit record not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const now = new Date().toISOString()

    if (action === 'approve') {
      // Update campuses table with new value
      const updatePayload: Record<string, unknown> = {}
      updatePayload[edit.field_name] = edit.new_value
      updatePayload['updated_at'] = now

      const { error: updateError } = await supabase
        .from('campuses')
        .update(updatePayload)
        .eq('id', edit.campus_id)

      if (updateError) {
        console.error('Error updating campus:', updateError)
        throw new Error(`Failed to update campus: ${updateError.message}`)
      }

      // Mark edit as approved
      const { error: approveError } = await supabase
        .from('campus_edits')
        .update({
          status: 'approved',
          reviewed_by: userInfo.userId,
          reviewed_at: now,
          notes: notes || null,
        })
        .eq('id', edit_id)

      if (approveError) {
        console.error('Error approving edit:', approveError)
        throw new Error(`Failed to approve edit: ${approveError.message}`)
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Edit approved and campus updated successfully',
          edit_id,
          campus_id: edit.campus_id,
          field_name: edit.field_name,
          new_value: edit.new_value,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    } else if (action === 'reject') {
      // Mark edit as rejected
      const { error: rejectError } = await supabase
        .from('campus_edits')
        .update({
          status: 'rejected',
          reviewed_by: userInfo.userId,
          reviewed_at: now,
          notes: notes || 'No reason provided',
        })
        .eq('id', edit_id)

      if (rejectError) {
        console.error('Error rejecting edit:', rejectError)
        throw new Error(`Failed to reject edit: ${rejectError.message}`)
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Edit rejected successfully',
          edit_id,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Edge function error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
