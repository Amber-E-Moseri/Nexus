// Pure core of the notification-email dispatcher (testable under vitest; the Edge Function wires
// real dependencies in).
//
// SECURITY CONTRACT (Phase 0, 2026-10)
//   Email is sent ONLY for a stored `notifications` row identified by `notification_id`, and ONLY
//   when the caller proves it is a trusted internal caller (CRON_SHARED_SECRET or service-role key
//   as the Bearer token). The recipient, template, subject, body and link are derived server-side
//   from the stored row. Nothing the caller supplies (user_id / notification_type / payload /
//   action_url / subject / html / to ...) is used. Every payload value that reaches the HTML is
//   escaped. The public anon key or a user JWT is never sufficient.
//
// Preferences are unchanged in this phase (a user_notification_prefs row with email=false suppresses;
// no row = allowed). The selective-email redesign is a later phase.

import { classifyCaller, type InternalSecrets } from './internalAuth.ts'
import { resolveDeepLink } from './pushCore.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** HTML-escape a value (text AND attribute contexts). */
export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function strip(v: unknown, max: number): string {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v) : ''
  // remove control characters (incl. CR/LF → no header/subject injection)
  return [...s].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').trim().slice(0, max)
}

export interface StoredNotificationForEmail {
  id: string
  user_id: string
  type: string
  payload: Record<string, unknown> | null
  email_sent_at: string | null
}

export interface RenderedEmail {
  subject: string
  html: string
}

interface Template {
  subject: string // plain text (sanitised, not HTML)
  body: string // HTML built ONLY from escaped values + static markup
  defaultPath?: string
  actionLabel?: string
}

export function buildTemplate(type: string, payload: Record<string, unknown>): Template | null {
  const p = (k: string, fb: string, max = 200) => strip(payload[k], max) || fb // plain
  const h = (k: string, fb: string, max = 500) => escapeHtml(strip(payload[k], max) || fb) // HTML-safe
  const T: Record<string, Template> = {
    system: {
      subject: 'Notification from BLW CAN NEXUS',
      body: h('message', 'You have a new notification from BLW CAN NEXUS.', 1000),
      actionLabel: 'Open Nexus',
    },
    task_assigned: {
      subject: `"${p('task_title', 'Task')}" assigned to you`,
      body: `${h('assigner_name', 'Someone')} assigned you a task: <strong>"${h('task_title', 'a task')}"</strong>${payload.task_description ? ` – ${h('task_description', '', 500)}` : ''}.`,
      defaultPath: '/my-tasks', actionLabel: 'View Task',
    },
    sprint_added: {
      subject: `Added to sprint: ${p('sprint_name', 'Sprint')}`,
      body: `${h('added_by', 'Someone')} added you to the sprint <strong>"${h('sprint_name', 'a sprint')}"</strong>.`,
      defaultPath: '/sprints', actionLabel: 'View Sprint',
    },
    comment_added: {
      subject: `New comment on "${p('task_title', 'Task')}"`,
      body: `${h('author_name', 'Someone')} commented on <strong>"${h('task_title', 'your task')}"</strong>: <em>"${h('comment_excerpt', 'Comment')}"</em>`,
      defaultPath: '/my-tasks', actionLabel: 'View Comment',
    },
    task_comment: {
      subject: `New comment on "${p('task_title', 'Task')}"`,
      body: `${h('author_name', 'Someone')} commented on <strong>"${h('task_title', 'your task')}"</strong>.`,
      defaultPath: '/my-tasks', actionLabel: 'View Comment',
    },
    mention: {
      subject: `You were mentioned by ${p('actor_name', 'Someone')}`,
      body: `${h('actor_name', 'Someone')} mentioned you in a comment on <strong>"${h('task_title', 'a task')}"</strong>.`,
      defaultPath: '/my-tasks', actionLabel: 'View Mention',
    },
    invitation_accepted: {
      subject: `${p('user_name', 'A user')} activated their account`,
      body: `Good news! ${h('user_name', 'A user')} accepted their invitation and activated their account on BLW CAN NEXUS.`,
    },
    event_approval_pending: {
      subject: `Calendar event needs your approval: ${p('event_title', 'Event')}`,
      body: `${h('submitter_name', 'Someone')} submitted a calendar event <strong>"${h('event_title', 'an event')}"</strong> for your approval.`,
      defaultPath: '/calendar', actionLabel: 'Review Event',
    },
    event_approved: {
      subject: `Your event was approved: ${p('event_title', 'Event')}`,
      body: `Your calendar event <strong>"${h('event_title', 'an event')}"</strong> has been approved by ${h('approver_name', 'someone')}.`,
      defaultPath: '/calendar', actionLabel: 'View Event',
    },
    meeting_reminder: {
      subject: `Reminder: ${p('meeting_title', 'Meeting')} in 1 hour`,
      body: `This is a friendly reminder that <strong>"${h('meeting_title', 'a meeting')}"</strong> is starting in 1 hour at ${h('meeting_time', '(time TBD)')}.`,
      defaultPath: '/meetings', actionLabel: 'View Meeting',
    },
  }
  return T[type] ?? null
}

export function renderEmail(
  tpl: Template, userName: string, type: string, payload: Record<string, unknown>, frontendUrl: string,
): RenderedEmail {
  // Link is derived server-side from the stored row; payload.action_url is NOT honoured.
  const derived = resolveDeepLink(type, payload)
  const path = derived !== '/inbox' ? derived : tpl.defaultPath
  const href = path ? `${frontendUrl}${path}` : tpl.actionLabel ? frontendUrl : ''
  const year = new Date().getFullYear()
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.6;color:#2d2a22;margin:0;padding:0}.container{max-width:600px;margin:0 auto;background:#fff}.header{padding:20px;text-align:center;border-bottom:1px solid #e8dedd}.content{padding:24px}.footer{background:#f9f7f5;border-top:1px solid #e8dedd;padding:16px;text-align:center;font-size:12px;color:#9e9488}.button{display:inline-block;padding:10px 20px;background:#4c2a92;color:#fff;text-decoration:none;border-radius:6px;font-weight:500}.section{margin-bottom:16px}p{margin:0 0 12px 0}</style></head>
<body><div class="container">
<div class="header"><img src="https://nexus.lwcanada.org/blw-canada-logo.png" alt="BLW Canada" width="120" height="120" style="display:block;margin:0 auto;" /></div>
<div class="content">
<div class="section"><p>Hi ${escapeHtml(strip(userName, 120))},</p></div>
<div class="section"><p>${tpl.body}</p></div>
${href ? `<div class="section" style="margin-top:24px;"><a href="${escapeHtml(href)}" class="button">${escapeHtml(tpl.actionLabel || 'View in Nexus')}</a></div>` : ''}
<div class="section" style="margin-top:32px;padding-top:24px;border-top:1px solid #e8dedd;"><p style="font-size:12px;color:#9e9488;margin:0;"><a href="${escapeHtml(frontendUrl)}/settings/notifications" style="color:#4c2a92;text-decoration:none;font-weight:500;">Manage notification preferences</a></p></div>
</div>
<div class="footer"><p>© ${year} BLW Canada Sub-Region</p></div>
</div></body></html>`
  return { subject: strip(tpl.subject, 200), html }
}

export interface EmailDeps {
  secrets: InternalSecrets
  frontendUrl: string
  loadNotification(id: string): Promise<StoredNotificationForEmail | null>
  /** null = no preference row (allowed); false = user disabled email for this type */
  emailPref(userId: string, type: string): Promise<boolean | null>
  loadUser(userId: string): Promise<{ name: string | null; email: string | null } | null>
  /** Atomically stamp email_sent_at where it is still null. false = someone else already claimed it. */
  claim(id: string): Promise<boolean>
  /** Undo the claim after a failed send so a retry/batch can pick it up. */
  release(id: string): Promise<void>
  send(msg: { to: string; subject: string; html: string }): Promise<{ ok: boolean; id?: string }>
  log?(msg: string): void
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function handleEmailDispatch(req: Request, deps: EmailDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 }) // no CORS grant: not browser-callable
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const caller = classifyCaller(req, deps.secrets)
  if (caller === 'unconfigured') return json(503, { error: 'Dispatcher not configured' })
  if (caller === 'missing') return json(401, { error: 'Unauthorized' })
  if (caller !== 'trusted') return json(403, { error: 'Forbidden' })

  const body = (await req.json().catch(() => null)) as { notification_id?: unknown } | null
  const id = typeof body?.notification_id === 'string' ? body.notification_id : ''
  if (!UUID.test(id)) return json(400, { error: 'notification_id (uuid) is required' })

  const n = await deps.loadNotification(id)
  if (!n) return json(404, { sent: false, reason: 'notification_not_found' })
  if (n.email_sent_at) return json(200, { skipped: true, reason: 'already_sent' })

  const payload = (n.payload ?? {}) as Record<string, unknown>
  const tpl = buildTemplate(n.type, payload)
  if (!tpl) return json(200, { skipped: true, reason: 'no_template' })

  const pref = await deps.emailPref(n.user_id, n.type)
  if (pref === false) return json(200, { skipped: true, reason: 'email_disabled' })

  const user = await deps.loadUser(n.user_id)
  if (!user?.email) return json(200, { skipped: true, reason: 'no_email' })

  // Exactly-once: claim before sending so the per-row trigger, the batch job and test-push cannot double-send.
  if (!(await deps.claim(n.id))) return json(200, { skipped: true, reason: 'already_sent' })

  const { subject, html } = renderEmail(tpl, user.name ?? '', n.type, payload, deps.frontendUrl)
  try {
    const r = await deps.send({ to: user.email, subject, html })
    if (!r.ok) {
      await deps.release(n.id)
      deps.log?.(`email failed notification=${n.id} type=${n.type}`)
      return json(502, { sent: false, error: 'Failed to send email' }) // no provider detail returned
    }
    deps.log?.(`email sent notification=${n.id} type=${n.type}`)
    return json(200, { sent: true, email_id: r.id ?? null })
  } catch {
    await deps.release(n.id)
    deps.log?.(`email failed notification=${n.id} type=${n.type}`)
    return json(502, { sent: false, error: 'Failed to send email' })
  }
}
