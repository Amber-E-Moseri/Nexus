/**
 * Phase 0A — push dispatch security.
 *
 * Exercises the REAL dispatcher (supabase/functions/_shared/pushCore.ts) with injected
 * dependencies — the same handler the Edge Function runs. The pre-fix exploit (anon key +
 * arbitrary userId/title/message/url, verified live 2026-10-01 → HTTP 200) must now be impossible.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  handlePushDispatch, validateInternalLink, resolveDeepLink, classifyCaller, safeEqual,
  formatMessage, type PushDeps, type StoredNotification,
} from '../../supabase/functions/_shared/pushCore.ts'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

// Secrets are generated per run; nothing here is a real credential.
const SERVICE_KEY = 'svc-' + 'k'.repeat(40)
const CRON_SECRET = 'cron-' + 's'.repeat(40)
// A syntactically valid JWT-shaped string standing in for the public anon key / a user JWT.
const ANON_LIKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.' + 'x'.repeat(30)

const NOTIF_ID = '11111111-1111-4111-8111-111111111111'
const VICTIM = '22222222-2222-4222-8222-222222222222'
const TASK = '33333333-3333-4333-8333-333333333333'
const SUB = { endpoint: 'https://push.example/ep', keys: { p256dh: 'p', auth: 'a' } }

function deps(over: Partial<PushDeps> & { n?: StoredNotification | null; pref?: boolean; sub?: typeof SUB | null } = {}) {
  const send = vi.fn(async () => ({}) as { gone?: boolean })
  const loadNotification = vi.fn(async (id: string) =>
    over.n === undefined
      ? ({ id, user_id: VICTIM, type: 'task_assigned', payload: { actor_name: 'Ada', task_title: 'Quarterly plan', task_id: TASK } })
      : over.n)
  const d: PushDeps = {
    secrets: { serviceRoleKey: SERVICE_KEY, cronSecret: CRON_SECRET },
    loadNotification,
    mobilePrefEnabled: vi.fn(async () => over.pref ?? true),
    loadSubscription: vi.fn(async () => (over.sub === undefined ? SUB : over.sub)),
    send,
    onGone: vi.fn(async () => {}),
    log: vi.fn(),
    ...over,
  } as PushDeps
  return { d, send, loadNotification }
}

function req(opts: { auth?: string; apikey?: string; body?: unknown; method?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.auth !== undefined) headers.authorization = opts.auth
  if (opts.apikey !== undefined) headers.apikey = opts.apikey
  return new Request('https://x.supabase.co/functions/v1/send-task-push-notification', {
    method: opts.method ?? 'POST', headers,
    ...((opts.method ?? 'POST') === 'POST' ? { body: JSON.stringify(opts.body ?? { notification_id: NOTIF_ID }) } : {}),
  })
}

describe('caller authentication (fail closed)', () => {
  it('no Authorization header → 401, nothing loaded or sent', async () => {
    const { d, send, loadNotification } = deps()
    const r = await handlePushDispatch(req(), d)
    expect(r.status).toBe(401)
    expect(send).not.toHaveBeenCalled()
    expect(loadNotification).not.toHaveBeenCalled()
  })

  it('anon-key-shaped JWT as Authorization → 403', async () => {
    const { d, send } = deps()
    const r = await handlePushDispatch(req({ auth: `Bearer ${ANON_LIKE_JWT}` }), d)
    expect(r.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('public anon credential presented as apikey AND Bearer (the live exploit shape) → 403', async () => {
    const { d, send } = deps()
    const r = await handlePushDispatch(
      req({ auth: `Bearer ${ANON_LIKE_JWT}`, apikey: ANON_LIKE_JWT, body: { userId: VICTIM, title: 'Pay now', message: 'click', url: 'https://evil.example' } }),
      d,
    )
    expect(r.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('apikey header alone (no Authorization) does not authenticate → 401', async () => {
    const { d } = deps()
    expect((await handlePushDispatch(req({ apikey: SERVICE_KEY }), d)).status).toBe(401)
  })

  it('ordinary signed-in user JWT cannot dispatch directly → 403', async () => {
    const { d, send } = deps()
    const userJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.' + 'y'.repeat(30)
    const r = await handlePushDispatch(req({ auth: `Bearer ${userJwt}` }), d)
    expect(r.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('wrong / near-miss secrets are rejected', async () => {
    const { d } = deps()
    for (const bad of [CRON_SECRET + 'x', CRON_SECRET.slice(0, -1), SERVICE_KEY.toUpperCase(), 'Bearer', '']) {
      expect((await handlePushDispatch(req({ auth: `Bearer ${bad}` }), d)).status).toBeGreaterThanOrEqual(401)
    }
  })

  it('unconfigured or too-short secrets → 503 (never trusts an empty secret)', async () => {
    for (const secrets of [{}, { serviceRoleKey: '', cronSecret: '' }, { serviceRoleKey: 'short', cronSecret: 'short' }]) {
      const { d, send } = deps({ secrets })
      const r = await handlePushDispatch(req({ auth: 'Bearer short' }), d)
      expect(r.status).toBe(503)
      expect(send).not.toHaveBeenCalled()
    }
  })

  it('non-POST rejected; browser preflight gets no CORS grant', async () => {
    const { d } = deps()
    expect((await handlePushDispatch(req({ method: 'GET', auth: `Bearer ${CRON_SECRET}` }), d)).status).toBe(405)
    const pre = await handlePushDispatch(new Request('https://x/', { method: 'OPTIONS' }), d)
    expect(pre.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('classifyCaller / safeEqual primitives', () => {
    const r = (h?: string) => new Request('https://x/', { headers: h ? { authorization: h } : {} })
    const s = { serviceRoleKey: SERVICE_KEY, cronSecret: CRON_SECRET }
    expect(classifyCaller(r(`Bearer ${SERVICE_KEY}`), s)).toBe('trusted')
    expect(classifyCaller(r(`bearer ${CRON_SECRET}`), s)).toBe('trusted')
    expect(classifyCaller(r(), s)).toBe('missing')
    expect(classifyCaller(r('Bearer nope'), s)).toBe('untrusted')
    expect(classifyCaller(r('Bearer x'), {})).toBe('unconfigured')
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('trusted dispatch uses ONLY the stored notification', () => {
  it('valid internal notification via CRON_SHARED_SECRET succeeds', async () => {
    const { d, send } = deps()
    const r = await handlePushDispatch(req({ auth: `Bearer ${CRON_SECRET}` }), d)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ sent: 1 })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('trusted system caller via the service-role key succeeds', async () => {
    const { d, send } = deps()
    const r = await handlePushDispatch(req({ auth: `Bearer ${SERVICE_KEY}` }), d)
    expect(r.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('arbitrary recipient / content / url in the body are IGNORED even for a trusted caller', async () => {
    const { d, send, loadNotification } = deps()
    const r = await handlePushDispatch(
      req({
        auth: `Bearer ${CRON_SECRET}`,
        body: {
          notification_id: NOTIF_ID, userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          title: 'Your account is locked', message: 'Sign in at evil.example', url: 'https://evil.example/phish', type: 'system',
        },
      }),
      d,
    )
    expect(r.status).toBe(200)
    expect(loadNotification).toHaveBeenCalledWith(NOTIF_ID)
    const [sub, json] = send.mock.calls[0] as unknown as [typeof SUB, string]
    expect(sub).toEqual(SUB) // subscription looked up for the STORED recipient
    expect(d.loadSubscription).toHaveBeenCalledWith(VICTIM)
    const msg = JSON.parse(json)
    expect(msg.title).toBe('Task Assigned')
    expect(msg.body).toBe('Ada assigned you "Quarterly plan"')
    expect(json).not.toContain('evil.example')
    expect(json).not.toContain('Your account is locked')
    expect(msg.url).toBe(`/my-tasks?task=${TASK}`)
  })

  it('legacy contract (userId/title/message/url, no notification_id) is refused', async () => {
    const { d, send } = deps()
    const r = await handlePushDispatch(
      req({ auth: `Bearer ${CRON_SECRET}`, body: { userId: VICTIM, title: 'x', message: 'y', url: '/inbox' } }),
      d,
    )
    expect(r.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('malformed / non-uuid notification ids → 400', async () => {
    const { d } = deps()
    for (const id of ['', 'abc', "1' or '1'='1", 123, null, { $ne: 1 }, NOTIF_ID + 'x']) {
      const r = await handlePushDispatch(req({ auth: `Bearer ${CRON_SECRET}`, body: { notification_id: id } }), d)
      expect(r.status).toBe(400)
    }
  })

  it('nonexistent notification is handled safely (404, nothing sent, no recipient lookup)', async () => {
    const { d, send } = deps({ n: null })
    const r = await handlePushDispatch(req({ auth: `Bearer ${CRON_SECRET}` }), d)
    expect(r.status).toBe(404)
    expect(send).not.toHaveBeenCalled()
    expect(d.loadSubscription).not.toHaveBeenCalled()
  })

  it('respects the recipient mobile preference and missing subscription', async () => {
    const off = deps({ pref: false })
    expect((await (await handlePushDispatch(req({ auth: `Bearer ${CRON_SECRET}` }), off.d)).json()).sent).toBe(0)
    expect(off.send).not.toHaveBeenCalled()
    const none = deps({ sub: null })
    expect((await (await handlePushDispatch(req({ auth: `Bearer ${CRON_SECRET}` }), none.d)).json()).sent).toBe(0)
  })

  it('expired subscription is cleaned up; provider errors never leak into the response', async () => {
    const gone = deps({ send: vi.fn(async () => ({ gone: true })) })
    expect((await (await handlePushDispatch(req({ auth: `Bearer ${CRON_SECRET}` }), gone.d)).json()).reason).toBe('subscription_expired')
    expect(gone.d.onGone).toHaveBeenCalledWith(VICTIM)

    const boom = deps({ send: vi.fn(async () => { throw new Error('FCM 401 secret=abc stack at line 9') }) })
    const body = JSON.stringify(await (await handlePushDispatch(req({ auth: `Bearer ${CRON_SECRET}` }), boom.d)).json())
    expect(body).not.toContain('FCM')
    expect(body).not.toContain('secret')
  })

  it('credentials are never logged', async () => {
    const { d } = deps()
    await handlePushDispatch(req({ auth: `Bearer ${CRON_SECRET}` }), d)
    await handlePushDispatch(req({ auth: `Bearer ${ANON_LIKE_JWT}` }), d)
    const logged = (d.log as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).join('\n')
    for (const secret of [CRON_SECRET, SERVICE_KEY, ANON_LIKE_JWT]) expect(logged).not.toContain(secret)
  })
})

describe('deep-link validation (server)', () => {
  const U = '44444444-4444-4444-8444-444444444444'
  it.each([
    '/inbox', '/notifications', '/dashboard', '/my-tasks', `/my-tasks?task=${U}`, '/my-tasks/today', '/meetings', '/meetings/abc-123',
    '/sprints/9f2', '/spaces/xyz', '/dept/Media', '/calendar', '/growth-tracking', '/growth-tracking?week=2026-09-28',
    `/icplc?participant=${U}&tab=documentation`, '/registration',
  ])('approved: %s', (link) => {
    expect(validateInternalLink(link)).toBe(link)
  })

  it.each([
    'https://evil.example', 'http://evil.example/inbox', '//evil.example', '//evil.example/inbox', '/\\evil.example', '\\\\evil.example',
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'mailto:a@b.c', 'evil.example',
    'inbox', '', ' /inbox', '/inbox ', '/in box', '/inbox\n', '/inbox\r\nSet-Cookie: a=b', '/inbox#frag', '/inbox?next=https://evil.example',
    '/my-tasks?task=not-a-uuid', '/my-tasks?task=' + U + '&task=' + U, '/growth-tracking?week=2026-9-1', '/growth-tracking?week=<script>',
    '/admin/permissions', '/admin/tickets', '/settings/api-docs', '/login', '/reset-password', '/api/anything', '/%2f%2fevil.example', '/../etc/passwd',
    '/inbox/../admin/permissions', '/inbox//x', '/meetings/' + 'a'.repeat(65), '/' + 'a'.repeat(400),
  ])('rejected: %j', (link) => {
    expect(validateInternalLink(link)).toBeNull()
  })

  it('non-strings are rejected', () => {
    for (const v of [null, undefined, 5, {}, [], true]) expect(validateInternalLink(v)).toBeNull()
  })

  it('resolveDeepLink derives approved destinations and falls back to /inbox', () => {
    expect(resolveDeepLink('task_assigned', { task_id: U })).toBe(`/my-tasks?task=${U}`)
    expect(resolveDeepLink('task_assigned', { task_id: 'evil' })).toBe('/inbox')
    expect(resolveDeepLink('meeting_reminder', { meeting_id: 'm-1' })).toBe('/meetings/m-1')
    expect(resolveDeepLink('meeting_reminder', { meeting_id: '../../x' })).toBe('/inbox')
    expect(resolveDeepLink('sprint_status', { sprint_id: 's-1' })).toBe('/sprints/s-1')
    expect(resolveDeepLink('growth_weekly_status', { week: '2026-09-28' })).toBe('/growth-tracking?week=2026-09-28')
    expect(resolveDeepLink('growth_weekly_status', { week: 'x' })).toBe('/growth-tracking')
    expect(resolveDeepLink('calendar_event_reminder', {})).toBe('/calendar')
    expect(resolveDeepLink('support_ticket_reply', { link: 'https://evil.example', url: 'https://evil.example' })).toBe('/inbox')
    expect(resolveDeepLink('system', { url: '//evil.example' })).toBe('/inbox')
  })
})

describe('lock-screen privacy', () => {
  it('calendar sync failure never exposes the raw error text', () => {
    const m = formatMessage('calendar_sync_failure', { error_message: 'invalid_grant: token for owner@example.com revoked' })
    expect(m).not.toContain('invalid_grant')
    expect(m).not.toContain('owner@example.com')
  })
  it('control characters and oversized values are neutralised', () => {
    const m = formatMessage('task_assigned', { actor_name: 'A\u0000\u0007B', task_title: 'x'.repeat(500) })
    expect(m.length).toBeLessThan(300)
    expect(m).not.toMatch(/[\u0000-\u001f]/)
  })
})

describe('wiring (static)', () => {
  it('send-task-push-notification is bound to the trusted-caller core, not caller input', () => {
    const src = read('supabase/functions/send-task-push-notification/index.ts')
    expect(src).toContain('handlePushDispatch')
    expect(src).not.toMatch(/body\??\.(userId|title|message|url)/)
    expect(src).not.toMatch(/getCorsHeaders/)
  })

  it('config.toml disables the gateway JWT check ONLY because the function authenticates itself', () => {
    const cfg = read('supabase/config.toml')
    expect(cfg).toMatch(/\[functions\."send-task-push-notification"\]\s*\nverify_jwt = false/)
  })

  it('test-push-notification is self-only (recipient is the authenticated caller)', () => {
    const src = read('supabase/functions/test-push-notification/index.ts')
    expect(src).toContain('auth.getUser(token)')
    expect(src).not.toMatch(/body\??\.user_id/)
  })

  it('trigger migration sends only notification_id and reads secrets from app_settings', () => {
    const mig = read('supabase/migrations/20271002000001_push_dispatch_by_notification_id.sql')
    const code = mig.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).toContain("jsonb_build_object('notification_id', NEW.id)")
    expect(code).toContain("app_setting('recurring_meetings_cron_secret')")
    expect(code).not.toMatch(/current_setting\(/)
    expect(code).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
  })

  it('client can no longer construct pushes', () => {
    const lib = read('src/features/notifications/lib/notifications.js')
    expect(lib).not.toMatch(/export (async )?function (sendTaskPushNotification|dispatchPush)/)
    expect(lib).not.toMatch(/functions\/v1\/send-task-push-notification/)
    const idx = read('src/features/notifications/index.ts')
    expect(idx).not.toMatch(/sendTaskPushNotification|dispatchPush/)
  })
})
