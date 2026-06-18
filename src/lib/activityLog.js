import { formatDistanceToNow, parseISO } from 'date-fns'

export const ACTIVITY_ACTION_LABELS = {
  task_created: 'created task',
  task_status_changed: 'updated task status',
  task_assigned: 'assigned task',
  meeting_created: 'created meeting',
  invitation_created: 'sent invitation',
  invitation_resent: 'resent invitation',
  invitation_cancelled: 'cancelled invitation',
  invitation_revoked: 'revoked invitation',
  invitation_accepted: 'accepted invitation',
  invitation_link_issued: 'issued invitation link',
  invitation_expiry_updated: 'updated invitation expiry',
  user_activated: 'activated user',
  user_status_changed: 'updated member status',
  department_membership_changed: 'changed department',
  pastor_assignment_changed: 'updated pastoral assignment',
  calendar_event_approved: 'approved calendar event',
  calendar_event_rejected: 'rejected calendar event',
}

export const ACTIVITY_ENTITY_LABELS = {
  user: 'User',
  user_invitation: 'Invitation',
  task: 'Task',
  meeting: 'Meeting',
  sprint: 'Sprint',
  calendar_event: 'Calendar Event',
}

export const ACTIVITY_ENTITY_OPTIONS = [
  { value: 'All', label: 'All' },
  { value: 'task', label: 'Task' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'user', label: 'User' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'calendar_event', label: 'Calendar Event' },
]

export function getActivityActionLabel(action) {
  return ACTIVITY_ACTION_LABELS[action] ?? action?.replaceAll('_', ' ') ?? ''
}

export function getActivityEntityLabel(entityType) {
  return ACTIVITY_ENTITY_LABELS[entityType] ?? entityType ?? 'Unknown'
}

export function getActivityInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

export function formatActivityDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const day = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${day} at ${time}`
}

export function formatActivityRelativeTime(value) {
  if (!value) return ''
  return formatDistanceToNow(typeof value === 'string' ? parseISO(value) : value, { addSuffix: true })
}

export function getActivityEntityPath(entry) {
  if (!entry?.entity_id) return null
  if (entry.entity_type === 'task') return `/my-tasks?task=${entry.entity_id}`
  if (entry.entity_type === 'meeting') return '/meetings'
  return null
}

export function getActivityEntityText(entry) {
  const label = getActivityEntityLabel(entry?.entity_type)
  if (!entry?.entity_id) return label
  return `${label} ${entry.entity_id}`
}
