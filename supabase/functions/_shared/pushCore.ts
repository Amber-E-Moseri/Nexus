// Pure (no Deno / network imports) core of the push dispatcher so it can be
// unit-tested under vitest. The Edge Function wires real dependencies in.
//
// SECURITY CONTRACT (Phase 0, 2026-10)
//   A push is dispatched ONLY for a stored `notifications` row, identified by
//   `notification_id`, and ONLY when the caller proves it is a trusted internal
//   caller (service-role key or CRON_SHARED_SECRET as the Bearer token).
//   Recipient, title, body and deep link are derived server-side from the stored
//   row. Nothing the caller supplies (userId/title/message/url/...) is used.
//   Possession of the public anon key, or any user JWT, is NOT sufficient.

import { classifyCaller, type InternalSecrets } from './internalAuth.ts'
export { classifyCaller, safeEqual, type InternalSecrets, type CallerClass } from './internalAuth.ts'

// ── Deep-link validation ──────────────────────────────────────────────────────
// Only approved internal Nexus destinations (mirrors routes in src/App.jsx).
// The service worker carries an identical copy (public/service-worker.js,
// <safe-link> region); src/tests/push-link-parity.test.ts asserts they agree.

const ID = '[A-Za-z0-9_-]{1,64}'
const PATHS: RegExp[] = [
  /^\/inbox$/,
  /^\/notifications$/,
  /^\/dashboard$/,
  /^\/my-tasks$/,
  new RegExp(`^/my-tasks/${'[a-z-]{1,32}'}$`),
  /^\/personal-list$/,
  /^\/meetings$/,
  new RegExp(`^/meetings/${ID}$`),
  /^\/sprints$/,
  new RegExp(`^/sprints/${ID}$`),
  /^\/spaces$/,
  new RegExp(`^/spaces/${ID}$`),
  new RegExp(`^/dept/${'[A-Za-z0-9_%-]{1,64}'}$`),
  /^\/calendar$/,
  /^\/calendar\/review$/,
  /^\/growth-tracking$/,
  /^\/icplc$/,
  /^\/registration$/,
]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const QUERY: Record<string, RegExp> = {
  task: UUID,
  participant: UUID,
  week: /^\d{4}-\d{2}-\d{2}$/,
  tab: /^[a-z-]{1,32}$/,
}

/** Returns a normalized internal path (+query) or null if not approved. */
export function validateInternalLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > 300) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  // reject backslashes, whitespace and control characters
  if (raw.includes('\\') || [...raw].some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127)) return null
  let u: URL
  try {
    u = new URL(raw, 'https://nexus.invalid')
  } catch {
    return null
  }
  if (u.origin !== 'https://nexus.invalid' || u.hash) return null
  if (u.pathname.includes('//')) return null
  if (!PATHS.some((p) => p.test(u.pathname))) return null
  const out = new URLSearchParams()
  for (const [k, v] of u.searchParams) {
    const rule = QUERY[k]
    if (!rule || !rule.test(v) || out.has(k)) return null
    out.set(k, v)
  }
  const qs = out.toString()
  return qs ? `${u.pathname}?${qs}` : u.pathname
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** Server-side deep-link derivation from the stored type + payload. */
export function resolveDeepLink(type: string, payload: Record<string, unknown>): string {
  const taskId = str(payload.task_id)
  const sprintId = str(payload.sprint_id)
  const meetingId = str(payload.meeting_id)
  let candidate: string | null = null
  if (type.startsWith('growth_')) {
    const wk = str(payload.week)
    candidate = wk && /^\d{4}-\d{2}-\d{2}$/.test(wk) ? `/growth-tracking?week=${wk}` : '/growth-tracking'
  } else if (taskId && UUID.test(taskId)) {
    candidate = `/my-tasks?task=${taskId}`
  } else if (type.startsWith('meeting') && meetingId) {
    candidate = `/meetings/${meetingId}`
  } else if (type.startsWith('sprint') && sprintId) {
    candidate = `/sprints/${sprintId}`
  } else if (type.startsWith('calendar') || type.startsWith('event_')) {
    candidate = '/calendar'
  }
  return (candidate && validateInternalLink(candidate)) || '/inbox'
}

// ── Message construction (server-side templates; payload values sanitised) ────

function clean(v: unknown, fallback: string, max = 120): string {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v) : ''
  // strip control characters
  const t = [...s].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').trim()
  return (t || fallback).slice(0, max)
}

export function getNotificationLabel(type: string): string {
  const labels: Record<string, string> = {
    task_assigned: 'Task Assigned',
    task_comment: 'New Comment',
    comment_added: 'New Comment',
    task_due_soon: 'Task Due Soon',
    sprint_added: 'Added to Sprint',
    sprint_status: 'Sprint Update',
    sprint_access_requested: 'Sprint Access Requested',
    sprint_access_approved: 'Sprint Access Approved',
    sprint_access_rejected: 'Sprint Access Rejected',
    mention: 'You were mentioned',
    invitation_accepted: 'Invitation Accepted',
    meeting_created: 'New Meeting',
    meeting_scheduled: 'Meeting Scheduled',
    meeting_reminder: 'Meeting Reminder',
    subtask_completed: 'Subtask Completed',
    dependency_cleared: 'Blocker Cleared',
    event_approval_pending: 'Event Awaiting Approval',
    event_approved: 'Event Approved',
    event_rejected: 'Event Rejected',
    calendar_event_reminder: 'Upcoming Event',
    calendar_sprint_prompt: 'Sprint Needed?',
    campus_edit_approved: 'Map Edit Approved',
    campus_edit_rejected: 'Map Edit Rejected',
    calendar_sync_failure: 'Calendar Sync Needs Attention',
    support_ticket_submitted: 'New Support Ticket',
    support_ticket_reply: 'Support Ticket Reply',
    task_completed: 'Task Completed',
    system: 'BLW CAN NEXUS',
  }
  return labels[type] ?? 'BLW CAN NEXUS'
}

export function formatMessage(type: string, payload: Record<string, unknown>): string {
  const s = (key: string, fallback = 'Someone') => clean(payload[key], fallback)
  switch (type) {
    case 'task_assigned':
      return `${s('actor_name')} assigned you "${s('task_title', 'a task')}"`
    case 'task_comment':
    case 'comment_added':
      return `${s('author_name')} commented on "${s('task_title', 'your task')}"`
    case 'task_status_changed':
      return `"${s('task_title', 'A task')}" was moved to ${s('new_status_name', 'a new status')}`
    case 'task_due_soon':
      return `"${s('task_title', 'A task')}" is ${payload.is_overdue ? 'overdue' : 'due soon'}`
    case 'sprint_added':
      return `You were added to sprint "${s('sprint_name', 'a sprint')}"`
    case 'sprint_status':
      return `Sprint "${s('sprint_name', 'a sprint')}" moved to ${s('new_status', 'a new status')}`
    case 'sprint_access_requested':
      return `${s('requester_name')} requested access to "${s('sprint_name', 'a sprint')}"`
    case 'sprint_access_approved':
      return `Your request to join "${s('sprint_name', 'a sprint')}" was approved`
    case 'sprint_access_rejected':
      return `Your request to join "${s('sprint_name', 'a sprint')}" was rejected`
    case 'mention':
      return payload.is_new_assignment
        ? `${s('actor_name')} assigned you to "${s('task_title', 'a task')}"`
        : `${s('actor_name')} mentioned you in "${s('task_title', 'a task')}"`
    case 'invitation_accepted':
      return `${s('user_name', 'A user')} accepted their invitation`
    case 'meeting_created':
      return `New meeting: "${s('meeting_title', 'Untitled')}"`
    case 'meeting_scheduled':
      return `You have been added to "${s('title', 'a meeting')}" on ${s('date', '')}`
    case 'meeting_reminder':
      return `"${s('title', 'A meeting')}" starts in 1 hour`
    case 'subtask_completed':
      return `"${s('title', 'A subtask')}" was completed on "${s('parentTitle', 'your task')}"`
    case 'dependency_cleared':
      return `"${s('blockerTaskTitle', 'A blocker')}" is now complete — "${s('blockedTaskTitle', 'your task')}" can proceed`
    case 'event_approved':
      return `Your event "${s('event_title', 'Untitled')}" was approved`
    case 'event_rejected':
      return `Your event "${s('event_title', 'Untitled')}" was rejected`
    case 'calendar_event_reminder':
      return `"${s('event_title', 'Untitled')}" is in ${s('days_before', '?')} days`
    case 'calendar_sprint_prompt':
      return `"${s('event_title', 'Untitled')}" is in ${s('days_before', '?')} days — time to start a sprint?`
    case 'campus_edit_approved':
      return `Your edit to "${s('campus_name', 'a campus')}" was approved`
    case 'campus_edit_rejected':
      return `Your edit to "${s('campus_name', 'a campus')}" was rejected`
    case 'calendar_sync_failure':
      // Never place provider/internal error text on a lock screen.
      return 'Google Calendar sync needs attention. Tap to review in Nexus.'
    case 'support_ticket_submitted':
      return `${s('submitter_name')} submitted a support request: "${s('title', 'Untitled')}"`
    case 'support_ticket_reply':
      return `Admin replied to your request: "${s('title', 'Untitled')}"`
    case 'task_completed':
      return `"${s('task_title', 'A task')}" you were watching has been completed`
    case 'system':
      return clean(payload.message, 'System notification', 160)
    default:
      return getNotificationLabel(type)
  }
}

// ── Dispatch handler (dependency-injected) ────────────────────────────────────

export interface StoredNotification {
  id: string
  user_id: string
  type: string
  payload: Record<string, unknown> | null
}
export interface PushSubscriptionJson {
  endpoint: string
  keys: { p256dh: string; auth: string }
}
export interface PushDeps {
  secrets: InternalSecrets
  loadNotification(id: string): Promise<StoredNotification | null>
  /** true only if the recipient opted in to mobile push for this type */
  mobilePrefEnabled(userId: string, type: string): Promise<boolean>
  loadSubscription(userId: string): Promise<PushSubscriptionJson | null>
  send(sub: PushSubscriptionJson, json: string): Promise<{ gone?: boolean }>
  onGone?(userId: string): Promise<void>
  log?(msg: string): void
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handlePushDispatch(req: Request, deps: PushDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 }) // no CORS: browsers cannot call this
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const caller = classifyCaller(req, deps.secrets)
  if (caller === 'unconfigured') return json(503, { error: 'Dispatcher not configured' })
  if (caller === 'missing') return json(401, { error: 'Unauthorized' })
  if (caller !== 'trusted') return json(403, { error: 'Forbidden' })

  const body = (await req.json().catch(() => null)) as { notification_id?: unknown } | null
  const id = typeof body?.notification_id === 'string' ? body.notification_id : ''
  if (!UUID.test(id)) return json(400, { error: 'notification_id (uuid) is required' })

  const n = await deps.loadNotification(id)
  if (!n) return json(404, { sent: 0, reason: 'notification_not_found' })

  if (!(await deps.mobilePrefEnabled(n.user_id, n.type))) {
    return json(200, { sent: 0, reason: 'mobile_push_not_enabled' })
  }
  const sub = await deps.loadSubscription(n.user_id)
  if (!sub) return json(200, { sent: 0, reason: 'no_subscription' })

  const payload = (n.payload ?? {}) as Record<string, unknown>
  const url = resolveDeepLink(n.type, payload)
  const message = JSON.stringify({
    title: getNotificationLabel(n.type),
    body: formatMessage(n.type, payload),
    icon: '/logo-purple-192.png',
    badge: '/logo-purple-192.png',
    tag: n.type,
    requireInteraction: false,
    url,
    data: { url, timestamp: Date.now() },
  })

  try {
    const r = await deps.send(sub, message)
    if (r.gone) {
      await deps.onGone?.(n.user_id)
      return json(200, { sent: 0, reason: 'subscription_expired' })
    }
    deps.log?.(`push sent notification=${n.id} type=${n.type}`)
    return json(200, { sent: 1 })
  } catch {
    deps.log?.(`push failed notification=${n.id} type=${n.type}`)
    return json(200, { sent: 0, reason: 'send_failed' }) // no provider detail returned
  }
}
