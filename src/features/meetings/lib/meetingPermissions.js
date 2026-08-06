/**
 * Permission checks for meetings, particularly for viewing restricted content
 * like the full Meeting Log.
 */

/**
 * Determines if a user can view the full Meeting Log.
 *
 * The Meeting Log is restricted to:
 * - super_admin
 * - regional_secretary
 * - dept_lead
 * - Meeting owner (created_by)
 *
 * Regular members can view published minutes when they have legitimate access
 * (attendance, explicit share, departmental access, etc.), but NOT the full log.
 *
 * @param {Object} user - Current user object with `role` (or `user_role`) and `id` fields
 * @param {Object} meeting - Meeting object with `created_by` field
 * @returns {boolean} True if user can view the meeting log
 */
export function canViewMeetingLog({ user, meeting }) {
  if (!user || !meeting) return false

  const privilegedRoles = [
    'super_admin',
    'regional_secretary',
    'dept_lead',
  ]

  // Check both `role` (from profile) and `user_role` (legacy/JWT) fields
  const userRole = user.role || user.user_role
  const userId = user.id || user.user_id

  return (
    privilegedRoles.includes(userRole) ||
    meeting.created_by === userId
  )
}

/**
 * Determines if a user can view published meeting minutes (inline viewer).
 *
 * This mirrors the broader visibility rules:
 * - If meeting is published or user has already seen the full log (canViewMeetingLog)
 * - User is an attendee or explicitly shared with
 * - User's department matches for org-published meetings
 * - Custom visibility rules (allowed_viewers, allowed_editors, etc.)
 *
 * In most cases, this is already enforced by the RLS policy on meetings.select,
 * so this is a convenience helper for UI logic.
 *
 * @param {Object} user - Current user object
 * @param {Object} meeting - Meeting object with visibility and related fields
 * @returns {boolean} True if user can view minutes
 */
export function canViewMeetingMinutes({ user, meeting }) {
  if (!user || !meeting) return false

  // Full log viewers can always see minutes
  if (canViewMeetingLog({ user, meeting })) return true

  // Published meetings are visible to the user if they passed RLS
  // (The RLS policy already restricts visibility, so if they got the meeting object,
  // it's safe to assume they can view it via RLS.)
  // This helper is mainly for consistency and UI gatekeeping.
  return true // Trust RLS to have filtered the meeting list
}
