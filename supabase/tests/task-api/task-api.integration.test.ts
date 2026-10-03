// Real-database integration tests for the task-api Edge Function.
//
// Runs the real handler (supabase/functions/task-api/index.ts, loaded in-process) with real supabase-js
// against PostgREST + Postgres that have ALL repo migrations applied. Nothing in the path is mocked.
//
// Env:
//   TEST_DB_URL         psql URL of a fully migrated database (superuser, used for fixtures)
//   TEST_POSTGREST_URL  PostgREST in front of that database
//   TEST_JWT_SECRET     PostgREST JWT secret (used to mint the service_role/anon/authenticated tokens)
// Run (see scripts/test-task-api-integration.sh):
//   deno test --allow-all supabase/tests/task-api/task-api.integration.test.ts
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1'

const DB = Deno.env.get('TEST_DB_URL') ?? ''
const REST = Deno.env.get('TEST_POSTGREST_URL') ?? ''
const SECRET = Deno.env.get('TEST_JWT_SECRET') ?? ''
if (!DB || !REST || !SECRET) throw new Error('TEST_DB_URL, TEST_POSTGREST_URL and TEST_JWT_SECRET are required')

const enc = new TextEncoder()
const b64u = (b: Uint8Array | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function jwt(payload: Record<string, unknown>) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64u(JSON.stringify({ iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 3600, ...payload }))
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${h}.${p}`)))
  return `${h}.${p}.${b64u(sig)}`
}
const SERVICE = await jwt({ role: 'service_role' })
const ANON = await jwt({ role: 'anon' })

Deno.env.set('SUPABASE_URL', REST.replace(/\/rest\/v1\/?$/, ''))
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', SERVICE)
Deno.env.set('ALLOWED_ORIGIN', 'https://app.example.test')

// PostgREST mounted at the root locally; supabase-js appends /rest/v1, so run a tiny path-stripping proxy.
const proxy = Deno.serve({ port: 0, hostname: '127.0.0.1', onListen() {} }, async (req) => {
  const u = new URL(req.url)
  const headers = new Headers(req.headers); headers.delete('host')
  return await fetch(REST + u.pathname.replace(/^\/rest\/v1/, '') + u.search, {
    method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
  })
})
Deno.env.set('SUPABASE_URL', `http://127.0.0.1:${proxy.addr.port}`)

type Handler = (req: Request) => Promise<Response> | Response
let handler!: Handler
{
  const realServe = Deno.serve
  // deno-lint-ignore no-explicit-any
  ;(Deno as any).serve = (a: unknown, b?: unknown) => { handler = (typeof a === 'function' ? a : b) as Handler; return { finished: Promise.resolve(), shutdown: () => Promise.resolve() } }
  try { await import('../../functions/task-api/index.ts') } finally { /* deno-lint-ignore no-explicit-any */ ;(Deno as any).serve = realServe }
}

async function sql(q: string): Promise<string> {
  const out = await new Deno.Command('psql', { args: [DB, '-v', 'ON_ERROR_STOP=1', '-At', '-q', '-c', q], stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`psql failed: ${new TextDecoder().decode(out.stderr)}\n${q}`)
  return new TextDecoder().decode(out.stdout).trim()
}
const uid = () => crypto.randomUUID()
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))).map((x) => x.toString(16).padStart(2, '0')).join('')

async function mkKey(opts: { department_id?: string | null; sprint_id?: string | null; permissions?: string[]; revoked?: boolean; disabled?: boolean; expires_at?: string | null }) {
  const plain = `nxk_test_${uid().replace(/-/g, '')}`
  const id = uid()
  const perms = JSON.stringify(opts.permissions ?? ['tasks:write', 'tasks:read'])
  await sql(`insert into api_keys (id, name, key_prefix, key_hash, department_id, sprint_id, permissions, revoked, disabled, expires_at)
    values ('${id}', 'it', '${plain.slice(0, 8)}', '${await sha256(plain)}', ${opts.department_id ? `'${opts.department_id}'` : 'null'},
    ${opts.sprint_id ? `'${opts.sprint_id}'` : 'null'}, '${perms}'::jsonb, ${opts.revoked ?? false}, ${opts.disabled ?? false},
    ${opts.expires_at ? `'${opts.expires_at}'` : 'null'})`)
  return { id, plain }
}
async function mkDept(name = `IT-${uid().slice(0, 8)}`, withOwnStatuses = false) {
  const id = uid()
  await sql(`insert into departments (id, name) values ('${id}', '${name}')`)
  if (withOwnStatuses) {
    await sql(`insert into task_status_definitions (name, color, category, department_id, sort_order, is_default, legacy_key, org_status_id, is_org_status)
      select 'Own ' || name, color, category, '${id}', sort_order, is_default, legacy_key, id, false from task_status_definitions
      where is_org_status and department_id is null and active`)
  }
  return id
}
async function mkUser(status = 'active', dept: string | null = null) {
  const id = uid()
  await sql(`insert into auth.users (id, aud, role, email, instance_id) values ('${id}', 'authenticated', 'authenticated', '${id}@it.test', '00000000-0000-0000-0000-000000000000')`)
  await sql(`insert into public.users (id, name, email, status, department_id) values ('${id}', 'IT ${id.slice(0, 6)}', '${id}@it.test', '${status}', ${dept ? `'${dept}'` : 'null'})`)
  return id
}
const call = (method: string, key: string | null, path = '/tasks', body?: unknown, extra: Record<string, string> = {}) =>
  handler(new Request(`http://localhost/functions/v1/task-api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body),
  }))
const rpc = async (keyId: string | null, max?: number, token = SERVICE) => {
  const res = await fetch(`${REST}/rpc/check_and_increment_rate_limit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: token, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ p_key_id: keyId, ...(max === undefined ? {} : { p_max_requests: max }) }),
  })
  return { status: res.status, body: await res.json() }
}

// ───────────────────────── rate limit RPC ─────────────────────────
Deno.test('RL01 first request is allowed with count 1', async () => {
  const k = await mkKey({ department_id: await mkDept() })
  const r = await rpc(k.id, 60)
  assertEquals(r.status, 200); assertEquals(r.body.allowed, true); assertEquals(r.body.count, 1); assertEquals(r.body.retry_after, 0)
})
Deno.test('RL02 60 requests allowed, 61st denied with retry_after 1..60', async () => {
  const k = await mkKey({ department_id: await mkDept() })
  for (let i = 1; i <= 60; i++) { const r = await rpc(k.id, 60); assertEquals(r.body.allowed, true, `request ${i}`); assertEquals(r.body.count, i) }
  const over = await rpc(k.id, 60)
  assertEquals(over.body.allowed, false); assertEquals(over.body.count, 61)
  assert(over.body.retry_after >= 1 && over.body.retry_after <= 60, `retry_after=${over.body.retry_after}`)
})
Deno.test('RL03 window reset: an older window does not count against the current one', async () => {
  const k = await mkKey({ department_id: await mkDept() })
  await sql(`insert into task_api_rate_limits (key_id, window_start, request_count) values ('${k.id}', now() - interval '2 minutes', 500)`)
  const r = await rpc(k.id, 60)
  assertEquals(r.body.allowed, true); assertEquals(r.body.count, 1)
})
Deno.test('RL04 keys are isolated from each other', async () => {
  const d = await mkDept(); const a = await mkKey({ department_id: d }); const b = await mkKey({ department_id: d })
  for (let i = 0; i < 61; i++) await rpc(a.id, 60)
  assertEquals((await rpc(a.id, 60)).body.allowed, false)
  const rb = await rpc(b.id, 60)
  assertEquals(rb.body.allowed, true); assertEquals(rb.body.count, 1)
})
Deno.test('RL05 concurrency: 120 parallel calls admit exactly 60', async () => {
  const k = await mkKey({ department_id: await mkDept() })
  const rs = await Promise.all(Array.from({ length: 120 }, () => rpc(k.id, 60)))
  assertEquals(rs.filter((r) => r.body.allowed).length, 60)
  assertEquals(rs.filter((r) => !r.body.allowed).length, 60)
  assertEquals(await sql(`select request_count from task_api_rate_limits where key_id='${k.id}' order by window_start desc limit 1`) , '120')
})
Deno.test('RL06 rpc is not callable by anon/authenticated; bad arguments rejected; no secrets stored', async () => {
  const k = await mkKey({ department_id: await mkDept() })
  const asAnon = await rpc(k.id, 60, ANON)
  assert(asAnon.status === 401 || asAnon.status === 403, `anon got ${asAnon.status}`)
  const asUser = await rpc(k.id, 60, await jwt({ role: 'authenticated', sub: uid() }))
  assert(asUser.status === 401 || asUser.status === 403, `authenticated got ${asUser.status}`)
  assertEquals((await rpc(null, 60)).status, 400)
  assertEquals((await rpc(k.id, 0)).status, 400)
  assertEquals(await sql(`select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name='task_api_rate_limits'`), 'key_id,window_start,request_count')
  assertEquals(await sql(`select has_table_privilege('authenticated','task_api_rate_limits','select')::int`), '0')
})

// ───────────────────────── key authentication / permissions ─────────────────────────
Deno.test('SEC01 no key / bearer-only / invalid key → 401', async () => {
  assertEquals((await call('POST', null, '/tasks', { title: 'x' })).status, 401)
  assertEquals((await call('POST', null, '/tasks', { title: 'x' }, { Authorization: `Bearer ${SERVICE}` })).status, 401)
  assertEquals((await call('POST', 'nxk_not_a_real_key', '/tasks', { title: 'x' })).status, 401)
})
Deno.test('SEC02 revoked / disabled / expired keys → 401 and consume no rate limit', async () => {
  const d = await mkDept()
  for (const [label, o] of [['revoked', { revoked: true }], ['disabled', { disabled: true }], ['expired', { expires_at: '2020-01-01T00:00:00Z' }]] as const) {
    const k = await mkKey({ department_id: d, ...o })
    const res = await call('POST', k.plain, '/tasks', { title: 'x' })
    assertEquals(res.status, 401, label)
    assertEquals(await sql(`select count(*) from task_api_rate_limits where key_id='${k.id}'`), '0', label)
  }
})
Deno.test('SEC03 read-only key cannot POST; write-only key cannot GET; neither leaks internals', async () => {
  const d = await mkDept()
  const ro = await mkKey({ department_id: d, permissions: ['tasks:read'] }); const wo = await mkKey({ department_id: d, permissions: ['tasks:write'] })
  const p = await call('POST', ro.plain, '/tasks', { title: 'x' }); assertEquals(p.status, 403)
  const g = await call('GET', wo.plain, '/tasks'); assertEquals(g.status, 403)
  for (const res of [p, g]) { const t = JSON.stringify(await res.json()); assert(!/key_hash|service_role|select |SUPABASE|eyJ/i.test(t), t) }
})
Deno.test('SEC04 department-scoped key cannot write to another department', async () => {
  const d1 = await mkDept(); const d2 = await mkDept(); const k = await mkKey({ department_id: d1 })
  assertEquals((await call('POST', k.plain, '/tasks', { title: 'x', department_id: d2 })).status, 403)
})
Deno.test('SEC05 over limit → 429 with Retry-After; key never appears in response', async () => {
  const k = await mkKey({ department_id: await mkDept() })
  await sql(`insert into task_api_rate_limits (key_id, window_start, request_count) values ('${k.id}', to_timestamp(floor(extract(epoch from now())/60)*60), 60)`)
  const res = await call('GET', k.plain, '/tasks')
  assertEquals(res.status, 429)
  const ra = Number(res.headers.get('Retry-After')); assert(ra >= 1 && ra <= 60, `Retry-After=${ra}`)
  assert(!(await res.text()).includes(k.plain))
})
Deno.test('SEC06 a healthy request is never 503 (regression: missing check_and_increment_rate_limit)', async () => {
  const k = await mkKey({ department_id: await mkDept() })
  assertNotEquals((await call('GET', k.plain, '/tasks')).status, 503)
})

// ───────────────────────── CORS ─────────────────────────
Deno.test('CORS01 allowed origin only, never wildcard; OPTIONS answered', async () => {
  const k = await mkKey({ department_id: await mkDept() })
  const res = await call('GET', k.plain, '/tasks', undefined, { Origin: 'https://evil.example' })
  assertEquals(res.headers.get('access-control-allow-origin'), 'https://app.example.test')
  const opt = await call('OPTIONS', null)
  assertEquals(opt.status, 200); assertEquals(opt.headers.get('access-control-allow-origin'), 'https://app.example.test')
  assertNotEquals(opt.headers.get('access-control-allow-origin'), '*')
})

// ───────────────────────── department task-status dependency ─────────────────────────
Deno.test('ST01 department with its own statuses: POST creates a task (sprint_id and sprint_team_id NULL)', async () => {
  const d = await mkDept(undefined, true); const k = await mkKey({ department_id: d })
  const res = await call('POST', k.plain, '/tasks', { title: 'own statuses', external_unique_key: `st01-${uid()}` })
  assertEquals(res.status, 201)
  const { task } = await res.json()
  assertEquals(task.sprint_id, null); assertEquals(task.sprint_team_id, null); assertEquals(task.task_type, 'space'); assertEquals(task.department_id, d)
  assertEquals(task.status, 'to_do'); assert(task.status_id)
  assertEquals(await sql(`select department_id::text from task_status_definitions where id='${task.status_id}'`), d, 'resolved to the department\'s own status row')
})
Deno.test('ST02 brand-new department with NO status rows: org-level status is used, never a 500', async () => {
  const d = await mkDept(); const k = await mkKey({ department_id: d })
  assertEquals(await sql(`select count(*) from task_status_definitions where department_id='${d}'`), '0')
  const res = await call('POST', k.plain, '/tasks', { title: 'new dept', external_unique_key: `st02-${uid()}` })
  assertEquals(res.status, 201)
  const { task } = await res.json()
  assertEquals(task.status, 'to_do')
  assertEquals(await sql(`select is_org_status::text from task_status_definitions where id='${task.status_id}'`), 'true')
})
Deno.test('ST03 department that cannot resolve any status → 422 (not an opaque 500)', async () => {
  const d = await mkDept(); const k = await mkKey({ department_id: d })
  await sql(`insert into space_disabled_org_statuses (department_id, org_status_id) select '${d}', id from task_status_definitions where is_org_status and department_id is null`)
  const res = await call('POST', k.plain, '/tasks', { title: 'no statuses' })
  assertEquals(res.status, 422)
  const body = await res.json(); assert(/no task statuses/.test(body.error), body.error)
  assertEquals(await sql(`select count(*) from tasks where department_id='${d}'`), '0')
})
Deno.test('ST04 explicit unknown status_id → 400 (no SQL leaked)', async () => {
  const d = await mkDept(undefined, true); const k = await mkKey({ department_id: d })
  const res = await call('POST', k.plain, '/tasks', { title: 'bad status', status_id: uid() })
  assertEquals(res.status, 400)
  assertEquals((await res.json()).error, 'status_id does not exist')
})

// ───────────────────────── assignment ─────────────────────────
Deno.test('AS01 active user is assigned; unknown assignee → 400; no task for unknown', async () => {
  const d = await mkDept(undefined, true); const k = await mkKey({ department_id: d }); const u = await mkUser('active', d)
  const ok = await call('POST', k.plain, '/tasks', { title: 'assigned', assignee_id: u })
  assertEquals(ok.status, 201); assertEquals((await ok.json()).task.assignee_id, u)
  const missing = uid()
  const bad = await call('POST', k.plain, '/tasks', { title: 'ghost', assignee_id: missing, external_unique_key: `as01-${missing}` })
  assertEquals(bad.status, 400)
  assertEquals(await sql(`select count(*) from tasks where external_unique_key='as01-${missing}'`), '0')
})
Deno.test('AS02 documented current behaviour: task-api only checks the user EXISTS (inactive / archived / pending_activation accepted)', async () => {
  const d = await mkDept(undefined, true); const k = await mkKey({ department_id: d })
  for (const status of ['inactive', 'archived', 'pending_activation', 'invited']) {
    const u = await mkUser(status, d)
    const res = await call('POST', k.plain, '/tasks', { title: `as-${status}`, assignee_id: u })
    assertEquals(res.status, 201, status)
  }
})

// ───────────────────────── idempotency ─────────────────────────
Deno.test('ID01 sequential duplicate returns the original (count stays 1)', async () => {
  const d = await mkDept(undefined, true); const k = await mkKey({ department_id: d }); const ext = `id01-${uid()}`
  const a = await call('POST', k.plain, '/tasks', { title: 'once', external_unique_key: ext }); assertEquals(a.status, 201)
  const b = await call('POST', k.plain, '/tasks', { title: 'once', external_unique_key: ext }); assertEquals(b.status, 200)
  const bj = await b.json(); assertEquals(bj.duplicate, true); assertEquals(bj.task.id, (await a.json()).task.id)
  assertEquals(await sql(`select count(*) from tasks where external_unique_key='${ext}'`), '1')
})
Deno.test('ID02 12 concurrent POSTs with one external_unique_key: exactly one 201, others 200 duplicate, count = 1, no 500', async () => {
  const d = await mkDept(undefined, true); const k = await mkKey({ department_id: d }); const ext = `id02-${uid()}`
  const rs = await Promise.all(Array.from({ length: 12 }, () => call('POST', k.plain, '/tasks', { title: 'race', external_unique_key: ext })))
  const statuses = rs.map((r) => r.status).sort()
  assertEquals(statuses.filter((s) => s === 201).length, 1, JSON.stringify(statuses))
  assertEquals(statuses.filter((s) => s === 200).length, 11, JSON.stringify(statuses))
  assertEquals(await sql(`select count(*) from tasks where external_unique_key='${ext}'`), '1')
})
Deno.test('ID03 duplicate lookup is scoped: another department\'s key never sees the task and gets 409, not data', async () => {
  const d1 = await mkDept(undefined, true); const d2 = await mkDept(undefined, true)
  const k1 = await mkKey({ department_id: d1 }); const k2 = await mkKey({ department_id: d2 }); const ext = `id03-${uid()}`
  assertEquals((await call('POST', k1.plain, '/tasks', { title: 'mine', external_unique_key: ext })).status, 201)
  const res = await call('POST', k2.plain, '/tasks', { title: 'theirs', external_unique_key: ext })
  assertEquals(res.status, 409)
  assert(!JSON.stringify(await res.json()).includes('mine'))
})
Deno.test('ID04 GET /tasks?external_unique_key= returns only the keyed task inside key scope; other filters unchanged', async () => {
  const d = await mkDept(undefined, true); const k = await mkKey({ department_id: d }); const other = await mkDept(undefined, true); const ko = await mkKey({ department_id: other })
  const ext = `id04-${uid()}`
  await call('POST', k.plain, '/tasks', { title: 'a', external_unique_key: ext }); await call('POST', k.plain, '/tasks', { title: 'b' })
  const hit = await (await call('GET', k.plain, `/tasks?external_unique_key=${ext}`)).json()
  assertEquals(hit.count, 1); assertEquals(hit.tasks[0].external_unique_key, ext)
  assertEquals((await (await call('GET', k.plain, `/tasks?external_unique_key=nope-${uid()}`)).json()).count, 0)
  assertEquals((await (await call('GET', ko.plain, `/tasks?external_unique_key=${ext}`)).json()).count, 0)
  assertEquals((await (await call('GET', k.plain, '/tasks')).json()).count, 2)
})
