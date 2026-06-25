import { supabase } from '../../services/supabase';

/**
 * Check if user can create meetings
 * Only ORS or designated creators can create
 */
export async function canUserCreateMeeting() {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    if (!userId) return false;

    // Get user role from users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || !user) return false;

    // Check if ORS
    if (user.role === 'ors') return true;

    // Check if designated creator
    const { data: designated } = await supabase
      .from('designated_creators')
      .select('id')
      .eq('user_id', userId)
      .single();

    return !!designated;
  } catch (err) {
    console.error('Error checking create permission:', err);
    return false;
  }
}

/**
 * Check if user can edit a meeting
 * Creator can edit own draft, ORS can edit any, invited editors can edit
 */
export function canUserEditMeeting(user, meeting) {
  if (!user || !meeting) return false;

  // ORS can edit any meeting
  if (user.role === 'ors') return true;

  // Creator can edit own draft meetings
  if (meeting.created_by === user.id && meeting.visibility === 'private') {
    return true;
  }

  // Invited editors can edit
  if (meeting.allowed_editors?.includes(user.id)) {
    return true;
  }

  return false;
}

/**
 * Check if user can delete a meeting
 * Only ORS can delete
 */
export function canUserDeleteMeeting(user) {
  return user?.role === 'ors';
}

/**
 * Check if user can view a meeting
 * Published visible to all, private only to creator/ORS/invited
 */
export function canUserViewMeeting(user, meeting) {
  if (!user || !meeting) return false;

  // Published meetings visible to everyone
  if (meeting.visibility === 'published') return true;

  // Creator can view own
  if (meeting.created_by === user.id) return true;

  // ORS can view all
  if (user.role === 'ors') return true;

  // Invited viewers can view
  if (meeting.allowed_viewers?.includes(user.id)) return true;

  // Invited editors can view
  if (meeting.allowed_editors?.includes(user.id)) return true;

  return false;
}

/**
 * Publish a meeting (make visible to everyone)
 */
export async function publishMeeting(meetingId) {
  const { data, error } = await supabase
    .from('meetings')
    .update({
      visibility: 'published',
      updated_at: new Date().toISOString(),
    })
    .eq('id', meetingId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Unpublish a meeting (revert to private, ORS only)
 */
export async function unpublishMeeting(meetingId) {
  const { data, error } = await supabase
    .from('meetings')
    .update({
      visibility: 'private',
      updated_at: new Date().toISOString(),
    })
    .eq('id', meetingId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get all designated creators (ORS only)
 */
export async function getDesignatedCreators() {
  const { data, error } = await supabase
    .from('designated_creators')
    .select(
      `
      id,
      user_id,
      granted_by,
      granted_at
    `
    )
    .order('granted_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Grant create permission to a user (ORS only)
 */
export async function grantCreatePermission(userId) {
  const { data: userData } = await supabase.auth.getUser();
  const grantedBy = userData?.user?.id;

  if (!grantedBy) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('designated_creators')
    .insert([
      {
        user_id: userId,
        granted_by: grantedBy,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Revoke create permission (ORS only)
 */
export async function revokeCreatePermission(userId) {
  const { error } = await supabase
    .from('designated_creators')
    .delete()
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Get user by email (for adding designated creators)
 */
export async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('email', email)
    .single();

  if (error) throw error;
  return data;
}
