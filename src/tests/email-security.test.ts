/**
 * Phase 0A (email) — notification email dispatch security.
 *
 * Runs the REAL dispatcher (supabase/functions/_shared/emailCore.ts) with an injected sender, so no
 * email is ever sent. Pre-fix, send-notification-email had NO caller authorization and trusted
 * user_id / notification_type / payload (incl. action_url) from the request body.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { handleEmailDispatch, escapeHtml, buildTemplate, type EmailDeps, type StoredNotificationForEmail } from '../../supabase/functions/_shared/emailCore.ts'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const SERVICE_KEY = 'svc-' + 'k'.repeat(40)
const CRON_SECRET = 'cron-' + 's'.repeat(40)
const ANON_LIKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.' + 'x'.repeat(30)
const NOTIF = '11111111-1111-4111-8111-111111111111'
const VICTIM = '22222222-2222-4222-8222-222222222222'
const TASK = '33333333-3333-4333-8333-333333333333'

function make(over: { n?: StoredNotificationForEmail | null; pref?: boolean | null; user?: { name: string | null; email: string | null } | null; claim?: boolean; send?: EmailDeps['send'] } = {}) {
  const send = vi.fn(over.send ?? (async () => ({ ok: true, id: 'em_1' })))
  const claim = vi.fn(async () => over.claim ?? true)
  const release = vi.fn(async () => {})
  const loadNotification = vi.fn(async (id: string) =>
    over.n === undefined
      ? ({ id, user_id: VICTIM, type: 'task_assigned', email_sent_at: null,
          payload: { assigner_name: 'Ada', task_title: 'Quarterly plan', task_id: TASK } })
      : over.n)
  const d: EmailDeps = {
    secrets: { serviceRoleKey: SERVICE_KEY, cronSecret: CRON_SECRET },
    frontendUrl: 'https://app.example.org',
    loadNotification,
    emailPref: vi.fn(async () => (over.pref === undefined ? null : over.pref)),
    loadUser: vi.fn(async () => (over.user === undefined ? { name: 'Vic', email: 'victim@example.org' } : over.user)),
    claim, release, send, log: vi.fn(),
  }
  return { d, send, claim, release, loadNotification }
}

function req(o: { auth?: string; apikey?: string; body?: unknown; method?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (o.auth !== undefined) headers.authorization = o.auth
  if (o.apikey !== undefined) headers.apikey = o.apikey
  const method = o.method ?? 'POST'
  return new Request('https://x.supabase.co/functions/v1/send-notification-email', {
    method, headers, ...(method === 'POST' ? { body: JSON.stringify(o.body ?? { notification_id: NOTIF }) } : {}),
  })
}
const trusted = { auth: `Bearer ${CRON_SECRET}` }

describe('caller authentication (fail closed)', () => {
  it('no auth → 401, nothing loaded or sent', async () => {
    const { d, send, loadNotification } = make()
    expect((await handleEmailDispatch(req(), d)).status).toBe(401)
    expect(send).not.toHaveBeenCalled()
    expect(loadNotification).not.toHaveBeenCalled()
  })

  it('anon-key-shaped JWT → 403', async () => {
    const { d, send } = make()
    expect((await handleEmailDispatch(req({ auth: `Bearer ${ANON_LIKE_JWT}` }), d)).status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('public anon credential as apikey AND Bearer with the old attack body → 403, no email', async () => {
    const { d, send } = make()
    const r = await handleEmailDispatch(
      req({ auth: `Bearer ${ANON_LIKE_JWT}`, apikey: ANON_LIKE_JWT,
        body: { user_id: VICTIM, notification_type: 'system', payload: { message: 'Verify your account at evil.example', action_url: 'https://evil.example/login' } } }),
      d,
    )
    expect(r.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('apikey alone does not authenticate → 401', async () => {
    expect((await handleEmailDispatch(req({ apikey: SERVICE_KEY }), make().d)).status).toBe(401)
  })

  it('ordinary signed-in user JWT cannot trigger email → 403', async () => {
    const { d, send } = make()
    const userJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.' + 'y'.repeat(30)
    expect((await handleEmailDispatch(req({ auth: `Bearer ${userJwt}` }), d)).status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('unconfigured / too-short secrets → 503', async () => {
    for (const secrets of [{}, { serviceRoleKey: 'short', cronSecret: 'short' }]) {
      const { d, send } = make(); d.secrets = secrets
      expect((await handleEmailDispatch(req({ auth: 'Bearer short' }), d)).status).toBe(503)
      expect(send).not.toHaveBeenCalled()
    }
  })

  it('non-POST rejected; preflight gets no CORS grant', async () => {
    const { d } = make()
    expect((await handleEmailDispatch(req({ method: 'GET', ...trusted }), d)).status).toBe(405)
    expect((await handleEmailDispatch(new Request('https://x/', { method: 'OPTIONS' }), d)).headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('a trusted caller still cannot choose recipient / content', () => {
  it('trusted system path (cron secret and service key) sends the stored notification', async () => {
    for (const auth of [`Bearer ${CRON_SECRET}`, `Bearer ${SERVICE_KEY}`]) {
      const { d, send, claim } = make()
      const r = await handleEmailDispatch(req({ auth }), d)
      expect(r.status).toBe(200)
      expect((await r.json()).sent).toBe(true)
      expect(send).toHaveBeenCalledTimes(1)
      expect(claim).toHaveBeenCalledWith(NOTIF)
    }
  })

  it('body-supplied user_id / type / payload / action_url / subject / html / to are all ignored', async () => {
    const { d, send, loadNotification } = make()
    const r = await handleEmailDispatch(req({ ...trusted, body: {
      notification_id: NOTIF, user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', to: 'attacker@evil.example',
      notification_type: 'system', subject: 'URGENT', html: '<a href="https://evil.example">x</a>',
      payload: { message: 'phish', action_url: 'https://evil.example/login', task_title: 'pwned' },
      action_url: 'https://evil.example/login', template: 'system', deep_link: 'https://evil.example',
    } }), d)
    expect(r.status).toBe(200)
    expect(loadNotification).toHaveBeenCalledWith(NOTIF)
    expect(d.loadUser).toHaveBeenCalledWith(VICTIM) // stored recipient, not the body's
    const msg = send.mock.calls[0][0]
    expect(msg.to).toBe('victim@example.org')
    expect(msg.subject).toBe('"Quarterly plan" assigned to you')
    expect(msg.html).not.toContain('evil.example')
    expect(msg.html).not.toContain('phish')
    expect(msg.html).not.toContain('URGENT')
    expect(msg.html).toContain(`https://app.example.org/my-tasks?task=${TASK}`) // link derived server-side
  })

  it('legacy contract (user_id + notification_type + payload, no notification_id) is refused', async () => {
    const { d, send } = make()
    const r = await handleEmailDispatch(req({ ...trusted, body: { user_id: VICTIM, notification_type: 'system', payload: { message: 'x' } } }), d)
    expect(r.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('malformed notification ids → 400', async () => {
    for (const id of ['', 'abc', "1' or '1'='1", 7, null, { $ne: 1 }]) {
      expect((await handleEmailDispatch(req({ ...trusted, body: { notification_id: id } }), make().d)).status).toBe(400)
    }
  })

  it('nonexistent notification → 404, no recipient lookup, nothing sent', async () => {
    const { d, send } = make({ n: null })
    expect((await handleEmailDispatch(req(trusted), d)).status).toBe(404)
    expect(send).not.toHaveBeenCalled()
    expect(d.loadUser).not.toHaveBeenCalled()
  })
})

describe('content safety', () => {
  const P = { task_title: '<img src=x onerror=alert(1)>', assigner_name: '"><script>alert(1)</script>', task_description: '<a href="https://evil.example">click</a>' }

  it('every stored payload value is HTML-escaped (stored-injection safe)', async () => {
    const { d, send } = make({ n: { id: NOTIF, user_id: VICTIM, type: 'task_assigned', email_sent_at: null, payload: P } })
    await handleEmailDispatch(req(trusted), d)
    const { html } = send.mock.calls[0][0]
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<a href="https://evil.example"')
    expect(html).toContain('&lt;script&gt;')
  })

  it('subject cannot carry CR/LF header injection and is length-capped', async () => {
    const { d, send } = make({ n: { id: NOTIF, user_id: VICTIM, type: 'task_assigned', email_sent_at: null, payload: { task_title: 'A\r\nBcc: x@evil.example' + 'z'.repeat(500) } } })
    await handleEmailDispatch(req(trusted), d)
    const { subject } = send.mock.calls[0][0]
    expect(subject).not.toMatch(/[\r\n]/)
    expect(subject.length).toBeLessThanOrEqual(200)
  })

  it('user display name is escaped too', async () => {
    const { d, send } = make({ user: { name: '<b onmouseover=1>V</b>', email: 'victim@example.org' } })
    await handleEmailDispatch(req(trusted), d)
    expect(send.mock.calls[0][0].html).not.toContain('<b onmouseover')
  })

  it('escapeHtml covers the five significant characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })

  it('unknown types have no template (no free-form email)', () => {
    expect(buildTemplate('totally_made_up', { message: 'x' })).toBeNull()
  })
})

describe('legitimate behaviour preserved', () => {
  it('templates exist for the types that email today', () => {
    for (const t of ['system', 'task_assigned', 'sprint_added', 'comment_added', 'task_comment', 'mention', 'invitation_accepted', 'event_approval_pending', 'event_approved', 'meeting_reminder']) {
      expect(buildTemplate(t, {})).not.toBeNull()
    }
  })

  it('no template → skipped (not an error)', async () => {
    const { d, send } = make({ n: { id: NOTIF, user_id: VICTIM, type: 'task_status_changed', email_sent_at: null, payload: {} } })
    expect(await (await handleEmailDispatch(req(trusted), d)).json()).toEqual({ skipped: true, reason: 'no_template' })
    expect(send).not.toHaveBeenCalled()
  })

  it('existing preferences honoured: email=false skips; no row allows', async () => {
    const off = make({ pref: false })
    expect((await (await handleEmailDispatch(req(trusted), off.d)).json()).reason).toBe('email_disabled')
    expect(off.send).not.toHaveBeenCalled()
    const none = make({ pref: null })
    expect((await (await handleEmailDispatch(req(trusted), none.d)).json()).sent).toBe(true)
  })

  it('already-sent rows and lost claims never double-send', async () => {
    const sent = make({ n: { id: NOTIF, user_id: VICTIM, type: 'task_assigned', email_sent_at: '2026-10-01T00:00:00Z', payload: {} } })
    expect((await (await handleEmailDispatch(req(trusted), sent.d)).json()).reason).toBe('already_sent')
    const lost = make({ claim: false })
    expect((await (await handleEmailDispatch(req(trusted), lost.d)).json()).reason).toBe('already_sent')
    expect(sent.send).not.toHaveBeenCalled()
    expect(lost.send).not.toHaveBeenCalled()
  })

  it('missing address skips', async () => {
    const { d, send } = make({ user: { name: 'X', email: null } })
    expect((await (await handleEmailDispatch(req(trusted), d)).json()).reason).toBe('no_email')
    expect(send).not.toHaveBeenCalled()
  })

  it('provider failure releases the claim and never leaks provider text', async () => {
    const fail = make({ send: async () => ({ ok: false }) })
    const r = await handleEmailDispatch(req(trusted), fail.d)
    expect(r.status).toBe(502)
    expect(fail.release).toHaveBeenCalledWith(NOTIF)
    const boom = make({ send: async () => { throw new Error('Resend 401 key=re_abc123') } })
    const body = JSON.stringify(await (await handleEmailDispatch(req(trusted), boom.d)).json())
    expect(body).not.toContain('Resend')
    expect(body).not.toContain('re_abc123')
    expect(boom.release).toHaveBeenCalled()
  })

  it('credentials are never logged', async () => {
    const { d } = make()
    await handleEmailDispatch(req(trusted), d)
    await handleEmailDispatch(req({ auth: `Bearer ${ANON_LIKE_JWT}` }), d)
    const logged = (d.log as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join('\n')
    for (const s of [CRON_SECRET, SERVICE_KEY, ANON_LIKE_JWT]) expect(logged).not.toContain(s)
  })
})

describe('wiring (static) — producers and other email senders are unaffected', () => {
  it('function is bound to the core and reads nothing recipient/content-shaped from the request', () => {
    const src = read('supabase/functions/send-notification-email/index.ts')
    expect(src).toContain('handleEmailDispatch')
    expect(src).not.toMatch(/body\??\.(user_id|notification_type|payload|to|subject|html)/)
  })

  it('config.toml disables only the gateway JWT check for it', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\."send-notification-email"\]\s*\nverify_jwt = false/)
  })

  it('trigger migration sends only notification_id, secrets from app_settings, no literals or GUCs', () => {
    const mig = read('supabase/migrations/20271002000004_email_dispatch_by_notification_id.sql')
    const code = mig.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).toContain("jsonb_build_object('notification_id', NEW.id)")
    expect(code).toContain("app_setting('recurring_meetings_cron_secret')")
    expect(code).not.toMatch(/current_setting\(/)
    expect(code).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
  })

  it('the only in-repo callers are the DB trigger and (indirectly) test-push; no browser code calls it', () => {
    const tp = read('supabase/functions/test-push-notification/index.ts')
    expect(tp).not.toContain('functions/v1/send-notification-email')
    expect(read('src/features/notifications/lib/notifications.js')).not.toContain('send-notification-email')
  })

  it('weekly Growth report, digests, absence, invitation emails use their own senders (not this function)', () => {
    for (const f of ['weekly-growth-report', 'daily-digest', 'email-digest', 'weekly-recap-email', 'send-user-invitation']) {
      expect(read(`supabase/functions/${f}/index.ts`)).not.toContain('send-notification-email')
    }
  })
})
