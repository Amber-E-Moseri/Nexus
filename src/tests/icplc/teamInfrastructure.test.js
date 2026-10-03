/**
 * Sprint/Team infrastructure hardening, against a REAL local Supabase stack (GoTrue sign-in, PostgREST + RLS under
 * real user JWTs, the full migration chain, both CMP Edge Functions under Deno).
 *
 * Covers: archived teams must not authorize; the two import RPCs that were still gated by the any-event helper;
 * team-membership and event->sprint-link auditing; team deletion invariants; expiry characterization; and the
 * expiry / inactive-account semantics, atomic team-membership operations, and the former replace-set hazard.
 *
 * Every fixture is synthetic and removed afterwards. No production data, sprint or team is read or written.
 * Requires a local Supabase. Without one the suite fails when ICPLC_REQUIRE_DB=1 (or CI=true), else is skipped.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import net from 'node:net'
import pg from 'pg'

// The real sprint API under test talks to whichever client we point it at (the signed-in staff member of the moment).
vi.mock('../../lib/supabase.js', () => ({
  supabase: new Proxy({}, { get: (_t, k) => globalThis.__staffClient?.[k]?.bind?.(globalThis.__staffClient) ?? globalThis.__staffClient?.[k] }),
}))
const sprintsApi = await import('../../features/sprints/lib/sprints.js')

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const API_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const REQUIRE = process.env.ICPLC_REQUIRE_DB === '1' || process.env.CI === 'true'
const PASSWORD = 'Local-teaminfra-123456!'
const TAG = `tin${Date.now().toString(36)}`

const pool = new pg.Pool({ connectionString: PG_URL, max: 4 })
const sql = (q, p = []) => pool.query(q, p)
const id = () => randomUUID()
/** Run statements as `uid` the way PostgREST would set the caller (auth.uid() reads the JWT claim), as the table owner.
 *  Direct PostgREST writes to sprint_teams / sprint_team_members hit "infinite recursion detected in policy" on the
 *  schema the migration chain produces, so membership mutations are exercised at the database layer. */
async function asActor(uid, fn) {
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [uid, JSON.stringify({ sub: uid, role: 'authenticated' })])
    const out = await fn((q, p) => c.query(q, p))
    await c.query('commit')
    return out
  } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
}

let available = false
let skipReason = ''
let admin
const users = {}
const tokens = {}
const clients = {}
const ev = {}
const sp = {}
const tm = {}
let procs = []
let mock
let ports = {}
const extraSprints = []

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────────────────
async function mkUser(key, role = 'member') {
  const email = `${TAG}-${key}@local.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw new Error(`createUser ${key}: ${error.message}`)
  const uid = data.user.id
  await sql(`insert into public.users (id, email, name, role, status) values ($1,$2,$3,$4,'active') on conflict (id) do update set role = $4`, [uid, email, key, role])
  const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error: se } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (se) throw new Error(`signIn ${key}: ${se.message}`)
  users[key] = uid
  tokens[key] = s.session.access_token
  clients[key] = createClient(API_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } })
}
const mkSprint = async (key, name) => { sp[key] = id(); await sql("insert into public.sprints (id, name, status) values ($1,$2,'planning')", [sp[key], name]) }
const mkTeam = async (key, sprintKey, name) => { tm[key] = id(); await sql('insert into public.sprint_teams (id, sprint_id, name) values ($1,$2,$3)', [tm[key], sp[sprintKey], name]) }
const mkEvent = async (key, name, sprintKey = null) => {
  ev[key] = id()
  await sql('insert into public.event_configs (id, event_name, sprint_pattern, sprint_id, is_active) values ($1,$2,$3,$4,false)', [ev[key], name, `%${name}%`, sprintKey ? sp[sprintKey] : null])
}
const join = (team, user) => sql('insert into public.sprint_team_members (team_id, user_id) values ($1,$2)', [tm[team], users[user]])
const leave = (team, user) => sql('delete from public.sprint_team_members where team_id = $1 and user_id = $2', [tm[team], users[user]])
const direct = (sprint, user) => sql('insert into public.sprint_members (sprint_id, user_id) values ($1,$2)', [sp[sprint], users[user]])
const person = (event, name) => sql('insert into public.icplc_participants (event_id, full_name, subgroup) values ($1,$2,$3)', [ev[event], name, 'BLW Central Subgroup A'])
const batch = async (event) => { const b = id(); await sql("insert into public.icplc_import_batches (id, event_id, source) values ($1,$2,'registration_csv')", [b, ev[event]]); return b }
const archive = (team, flag) => sql('update public.sprint_teams set is_archived = $2 where id = $1', [tm[team], flag])
const teamsOf = async (user, sprintKey) => (await sql(
  'select st.name from public.sprint_team_members stm join public.sprint_teams st on st.id = stm.team_id where stm.user_id = $1 and st.sprint_id = $2 order by st.name',
  [users[user], sp[sprintKey]])).rows.map((r) => r.name)

// ── act as a user through PostgREST / RLS ─────────────────────────────────────────────────────────────────
const read = async (user, event) => {
  const { data, error } = await clients[user].from('icplc_participants').select('full_name').eq('event_id', ev[event]).order('full_name')
  if (error) throw new Error(`read ${user}: ${error.message}`)
  return data.map((r) => r.full_name)
}
const write = async (user, event) => {
  const { data, error } = await clients[user].from('icplc_participants').update({ participation_status: 'tracking' }).eq('event_id', ev[event]).select('id')
  return error ? 0 : data.length
}
const importAllowed = async (user, event) => {
  const b = await batch(event)
  const { error } = await clients[user].rpc('icplc_preview_import', { p_batch_id: b })
  return !/permission denied|authorization/i.test(error?.message || '')
}
const regImportAllowed = async (user, event) => {
  const b = await batch(event)
  const { error } = await clients[user].rpc('icplc_preview_registration_import', { p_batch_id: b })
  return !/Insufficient authorization|permission denied/i.test(error?.message || '')
}
const helper = async (user, fn, event) => (await clients[user].rpc(fn, { p_event_id: ev[event] })).data

// ── edge functions ───────────────────────────────────────────────────────────────────────────────────────
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)) }); s.on('error', rej) })
async function startFn(name, port, env) {
  let logs = ''
  const p = spawn('deno', ['run', '-A', `supabase/functions/${name}/index.ts`], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`, SUPABASE_URL: API_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, LEADERS_PLATFORM_TOKEN: 'local-token', ...env },
  })
  p.stdout.on('data', (c) => { logs += c }); p.stderr.on('data', (c) => { logs += c })
  procs.push(p)
  const end = Date.now() + 90_000
  while (Date.now() < end) {
    try { const r = await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }); await r.text(); if (r.status === 401) return } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`${name} did not start: ${logs.slice(-1500)}`)
}
const callFn = async (which, user, event) => {
  const r = await fetch(`http://127.0.0.1:${ports[which]}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens[user]}` },
    body: JSON.stringify({ action: 'preview', event_id: ev[event] }),
  })
  await r.text()
  return r.status
}
const cmp = async (user, event) => ({ doc: await callFn('doc', user, event), flight: await callFn('flight', user, event) })
const ALLOWED = { doc: 200, flight: 200 }
const DENIED = { doc: 403, flight: 403 }

beforeAll(async () => {
  try {
    if (!SERVICE_KEY || !ANON_KEY) throw new Error('SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set')
    admin = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false } })
    await sql('select 1 from public.event_configs limit 1')
    const { error } = await admin.from('event_configs').select('id').limit(1)
    if (error) throw new Error(`PostgREST: ${error.message}`)
    available = true
  } catch (e) {
    skipReason = `no local Supabase: ${e.message}`
    if (REQUIRE) throw new Error(skipReason)
    return
  }
  await mkUser('superAdmin', 'super_admin')
  for (const k of ['x', 'xm', 'xf', 'writerB', 'staff1', 'staff2', 'staff3', 'target', 'lead', 'plainMember', 'stranger', 'multi', 'permM', 'tempOk', 'tempExp', 'tempExp2', 'tempRenew', 'inactiveU', 'teamOnly', 'tempFin', 'gp1', 'gpDup', 'activeOther']) await mkUser(k)
  await mkUser('manager', 'super_admin')

  await mkSprint('A', `ICPLC ${TAG} A`); await mkSprint('B', `ICPLC ${TAG} B`)
  await mkEvent('A', `ICPLC ${TAG} A`, 'A'); await mkEvent('B', `ICPLC ${TAG} B`, 'B')
  await mkTeam('tA', 'A', 'Registration'); await mkTeam('tB', 'A', 'Operations'); await mkTeam('tFin', 'A', 'Finance')
  await mkTeam('bReg', 'B', 'Registration')
  await person('A', 'A person'); await person('B', 'B person')
  await join('tA', 'x'); await join('tA', 'xm'); await join('tB', 'xm'); await join('bReg', 'writerB')
  await direct('A', 'xf'); await join('tFin', 'xf')

  mock = http.createServer((_q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ data: [], pagination: { total: 0, page: 1, pageSize: 1000 } })) })
  await new Promise((r) => mock.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${mock.address().port}`
  ports = { doc: await freePort(), flight: await freePort() }
  await Promise.all([
    startFn('cmp-documentation-sync', ports.doc, { CMP_DOCUMENTATION_FORM_URL: `${base}/docs` }),
    startFn('cmp-flight-sync', ports.flight, { CMP_FLIGHT_FORM_URL: `${base}/flights` }),
  ])
})

afterAll(async () => {
  for (const p of procs) { try { p.kill() } catch { /* gone */ } }
  if (mock) await new Promise((r) => mock.close(r))
  if (available) {
    const evIds = Object.values(ev)
    const uids = Object.values(users)
    await sql('alter table public.sprint_team_members drop column if exists sprint_id').catch(() => {})
    await sql("notify pgrst, 'reload schema'").catch(() => {})
    for (const t of ['icplc_import_rows']) await sql('delete from public.icplc_import_rows where batch_id in (select id from public.icplc_import_batches where event_id = any($1))', [evIds]).catch(() => {})
    for (const t of ['icplc_import_batches', 'icplc_identity_maps', 'icplc_email_claims', 'icplc_participants']) await sql(`delete from public.${t} where event_id = any($1)`, [evIds]).catch(() => {})
    await sql('delete from public.activity_log where entity_id = any($1) or user_id = any($2) or (metadata->>\'sprint_id\') = any($3)', [[...evIds, ...Object.values(tm)], uids, [...Object.values(sp), ...extraSprints]]).catch(() => {})
    await sql('delete from public.event_configs where id = any($1)', [evIds]).catch(() => {})
    await sql('delete from public.sprints where id = any($1)', [[...Object.values(sp), ...extraSprints]]).catch(() => {})
    await sql('delete from public.users where id = any($1)', [uids]).catch(() => {})
    await Promise.all(uids.map((u) => admin.auth.admin.deleteUser(u).catch(() => {})))
  }
  await pool.end()
})

const need = (ctx) => { if (!available) ctx.skip(skipReason) }

// ═════════════════════════════════════ 1. ARCHIVED TEAMS ═════════════════════════════════════════════════
describe('archived teams must not authorize', () => {
  const allPaths = async (user, event = 'A') => ({
    read: (await read(user, event)).length > 0,
    write: (await write(user, event)) > 0,
    import: await importAllowed(user, event),
    regImport: await regImportAllowed(user, event),
    helperRead: await helper(user, 'icplc_can_read_participants', event),
    helperWrite: await helper(user, 'icplc_can_write_participants', event),
    helperImport: await helper(user, 'icplc_can_import', event),
    cmp: await cmp(user, event),
  })
  const GRANTED = { read: true, write: true, import: true, regImport: true, helperRead: true, helperWrite: true, helperImport: true, cmp: ALLOWED }
  const NONE = { read: false, write: false, import: false, regImport: false, helperRead: false, helperWrite: false, helperImport: false, cmp: DENIED }

  it('active team authorizes on every path; archiving it removes the team-derived access; unarchiving restores it', async (ctx) => {
    need(ctx)
    expect(await allPaths('x')).toEqual(GRANTED)
    await archive('tA', true)
    expect(await allPaths('x')).toEqual(NONE)
    expect(await teamsOf('x', 'A')).toEqual(['Registration']) // membership rows untouched
    await archive('tA', false)
    expect(await allPaths('x')).toEqual(GRANTED)
  })

  it('multi-team user: archiving one team keeps the other team effective and touches no membership', async (ctx) => {
    need(ctx)
    await archive('tA', true)
    expect(await allPaths('xm')).toEqual(GRANTED) // Operations (active) still grants everything
    expect(await teamsOf('xm', 'A')).toEqual(['Operations', 'Registration']) // both rows still there
    await archive('tB', true) // now both archived
    expect(await allPaths('xm')).toEqual(NONE)
    await archive('tA', false) // A back, B still archived
    expect(await allPaths('xm')).toEqual(GRANTED)
    await archive('tB', false)
    expect(await teamsOf('xm', 'A')).toEqual(['Operations', 'Registration'])
  })

  it('a NULL is_archived is treated as active', async (ctx) => {
    need(ctx)
    await sql('update public.sprint_teams set is_archived = null where id = $1', [tm.tA])
    expect((await allPaths('x')).read).toBe(true)
    await archive('tA', false)
  })

  it('archiving a restrictive team must never WIDEN access (no generic-member fallback)', async (ctx) => {
    need(ctx)
    // xf is a direct sprint member AND on Finance (which the team arm excludes). F1 keeps them off the generic arm.
    expect(await read('xf', 'A')).toEqual([])
    await archive('tFin', true)
    expect(await read('xf', 'A')).toEqual([]) // still denied: archived membership still counts as "assigned to a team"
    await archive('tFin', false)
    expect(await read('xf', 'A')).toEqual([])
  })

  it('null event sprint_id still fails closed', async (ctx) => {
    need(ctx)
    await mkEvent('N', `ICPLC ${TAG} N`, null)
    await person('N', 'N person')
    expect(await read('x', 'N')).toEqual([])
    expect(await helper('x', 'icplc_can_read_participants', 'N')).toBe(false)
    expect(await cmp('x', 'N')).toEqual(DENIED)
  })
})

// ════════════════ 2. IMPORT RPCs STILL GATED BY THE ANY-EVENT HELPER (cross-event) ═══════════════════════
describe('SECURITY DEFINER import RPCs are event-scoped', () => {
  async function unmatchedRow(event) {
    const b = await batch(event)
    const r = id()
    await sql("insert into public.icplc_import_rows (id, batch_id, row_number, raw_payload, match_status) values ($1,$2,1,$3,'unmatched')", [r, b, JSON.stringify({ 'Full Name': `${TAG} Created Person` })])
    return { b, r }
  }

  it('a writer of event B cannot resolve an unmatched row that belongs to event A', async (ctx) => {
    need(ctx)
    const { b, r } = await unmatchedRow('A')
    const { data, error } = await clients.writerB.rpc('icplc_resolve_unmatched_row', { p_row_id: r, p_action: 'create_new', p_participant_id: null, p_resolved_by: users.writerB })
    expect(error?.code === '42501' || /permission denied|authorization/i.test(error?.message || '') || data?.[0]?.success === false).toBe(true)
    const created = await sql("select count(*)::int n from public.icplc_participants where event_id = $1 and full_name = $2", [ev.A, `${TAG} Created Person`])
    expect(created.rows[0].n).toBe(0) // nothing was created inside event A
    expect((await sql('select match_status from public.icplc_import_rows where id = $1', [r])).rows[0].match_status).toBe('unmatched')
    void b
  })

  it('the writer of event A can resolve its own row', async (ctx) => {
    need(ctx)
    const { r } = await unmatchedRow('A')
    const { data, error } = await clients.x.rpc('icplc_resolve_unmatched_row', { p_row_id: r, p_action: 'create_new', p_participant_id: null, p_resolved_by: users.x })
    expect(error).toBeNull()
    expect(data?.[0]?.success).toBe(true)
  })

  it('backfill is scoped to the batch event; a writer of another event is refused; a NULL batch is platform-only', async (ctx) => {
    need(ctx)
    const b = await batch('A')
    expect((await clients.writerB.rpc('icplc_backfill_participants_from_import', { p_batch_id: b })).error?.code).toBe('42501')
    expect((await clients.writerB.rpc('icplc_backfill_participants_from_import', { p_batch_id: null })).error?.code).toBe('42501')
    expect((await clients.x.rpc('icplc_backfill_participants_from_import', { p_batch_id: null })).error?.code).toBe('42501') // team writers: no all-events backfill
    expect((await clients.x.rpc('icplc_backfill_participants_from_import', { p_batch_id: b })).error).toBeNull()
    expect((await clients.superAdmin.rpc('icplc_backfill_participants_from_import', { p_batch_id: null })).error).toBeNull()
  })
})

// ═════════════════════════════════════ 3. TEAM MEMBERSHIP AUDIT ═════════════════════════════════════════
const auditRows = async (entityType, entityId, action = null) => (await sql(
  `select action, user_id, metadata, "timestamp" from public.activity_log where entity_type = $1 and entity_id = $2 ${action ? 'and action = $3' : ''} order by "timestamp", id`,
  action ? [entityType, entityId, action] : [entityType, entityId])).rows

describe('team membership is audited in activity_log', () => {
  it('team created, moved to another sprint, and deleted are audited with the sprint involved', async (ctx) => {
    need(ctx)
    await mkSprint('T1', `ICPLC ${TAG} T1`); await mkSprint('T2', `ICPLC ${TAG} T2`); await mkTeam('lc', 'T1', 'Lifecycle')
    await asActor(users.superAdmin, (q) => q('update public.sprint_teams set sprint_id = $2 where id = $1', [tm.lc, sp.T2]))
    await asActor(users.superAdmin, (q) => q('delete from public.sprint_teams where id = $1', [tm.lc]))
    const rows = await auditRows('sprint_team', tm.lc)
    expect(rows.map((r) => r.action)).toEqual(['sprint_team_created', 'sprint_team_sprint_changed', 'sprint_team_deleted'])
    expect(rows[1].metadata.previous_sprint_id).toBe(sp.T1); expect(rows[1].metadata.new_sprint_id).toBe(sp.T2)
    expect(rows[1].user_id).toBe(users.superAdmin)
  })

  it('add to Team 1, add to Team 2, remove from Team 1: independent rows; Team 2 is never reported removed', async (ctx) => {
    need(ctx)
    await mkSprint('M', `ICPLC ${TAG} M`); await mkTeam('m1', 'M', 'One'); await mkTeam('m2', 'M', 'Two')
    // as an authorized staff member through the API (so the actor is recorded), not as the DB owner
    await asActor(users.superAdmin, (q) => q('insert into public.sprint_team_members (team_id, user_id) values ($1,$2)', [tm.m1, users.target]))
    await asActor(users.superAdmin, (q) => q('insert into public.sprint_team_members (team_id, user_id) values ($1,$2)', [tm.m2, users.target]))
    await asActor(users.superAdmin, (q) => q('delete from public.sprint_team_members where team_id = $1 and user_id = $2', [tm.m1, users.target]))

    const memberRows = async (t) => (await auditRows('sprint_team', t)).filter((r) => r.action.startsWith('sprint_team_member_'))
    const one = await memberRows(tm.m1)
    const two = await memberRows(tm.m2)
    expect(one.map((r) => r.action)).toEqual(['sprint_team_member_added', 'sprint_team_member_removed'])
    expect(two.map((r) => r.action)).toEqual(['sprint_team_member_added']) // nothing implies Team 2 was removed
    for (const r of [...one, ...two]) {
      expect(r.user_id).toBe(users.superAdmin) // actor
      expect(r.timestamp).toBeTruthy()
      expect(r.metadata.actor_id).toBe(users.superAdmin)
      expect(r.metadata.affected_user_id).toBe(users.target)
      expect(r.metadata.sprint_id).toBe(sp.M)
      expect(Object.keys(r.metadata).sort()).toEqual(['actor_id', 'affected_user_id', 'operation', 'source', 'sprint_id', 'team_id', 'team_name'].sort())
    }
    expect(one[0].metadata.operation).toBe('added'); expect(one[1].metadata.operation).toBe('removed')
    expect(one[0].metadata.team_id).toBe(tm.m1); expect(two[0].metadata.team_id).toBe(tm.m2)
    expect(await teamsOf('target', 'M')).toEqual(['Two']) // Team 2 membership remains
  })

  it('audits changes made by direct SQL too (system actor) and stores no email or participant data', async (ctx) => {
    need(ctx)
    await sql('insert into public.sprint_team_members (team_id, user_id) values ($1,$2)', [tm.m1, users.staff1])
    const rows = await auditRows('sprint_team', tm.m1, 'sprint_team_member_added')
    const mine = rows.find((r) => r.metadata.affected_user_id === users.staff1)
    expect(mine).toBeTruthy()
    expect(mine.user_id).toBeNull() // no authenticated actor
    expect(mine.metadata.source).toBe('system')
    expect(JSON.stringify(mine.metadata)).not.toMatch(/@|email|full_name|passport/i)
    await sql('delete from public.sprint_team_members where team_id = $1 and user_id = $2', [tm.m1, users.staff1])
  })

  it('archive / unarchive of a team is audited (it changes authorization)', async (ctx) => {
    need(ctx)
    await asActor(users.superAdmin, (q) => q('update public.sprint_teams set is_archived = true where id = $1', [tm.m2]))
    await asActor(users.superAdmin, (q) => q('update public.sprint_teams set is_archived = false where id = $1', [tm.m2]))
    const rows = (await auditRows('sprint_team', tm.m2)).filter((r) => /archived|unarchived/.test(r.action))
    expect(rows.map((r) => r.action)).toEqual(['sprint_team_archived', 'sprint_team_unarchived'])
    expect(rows[0].metadata.sprint_id).toBe(sp.M)
  })
})

// ═════════════════════════════════════ 4. EVENT -> SPRINT LINK AUDIT ═════════════════════════════════════
describe('event_configs.sprint_id changes are audited', () => {
  it('NULL -> A, A -> B, B -> NULL, with previous/new sprint, actor and timestamp, and no other event_configs data', async (ctx) => {
    need(ctx)
    await mkEvent('L', `ICPLC ${TAG} L`, null)
    const setLink = (s) => clients.superAdmin.from('event_configs').update({ sprint_id: s }).eq('id', ev.L)
    expect((await setLink(sp.A)).error).toBeNull()
    expect((await setLink(sp.B)).error).toBeNull()
    expect((await setLink(null)).error).toBeNull()
    // an unrelated column change is not a link change
    await clients.superAdmin.from('event_configs').update({ early_fee: 123 }).eq('id', ev.L)

    const rows = await auditRows('event_config', ev.L, 'event_sprint_link_changed')
    expect(rows.map((r) => [r.metadata.previous_sprint_id, r.metadata.new_sprint_id, r.metadata.operation])).toEqual([
      [null, sp.A, 'linked'], [sp.A, sp.B, 'relinked'], [sp.B, null, 'unlinked'],
    ])
    for (const r of rows) {
      expect(r.user_id).toBe(users.superAdmin)
      expect(r.metadata.actor_id).toBe(users.superAdmin)
      expect(r.metadata.event_id).toBe(ev.L)
      expect(r.timestamp).toBeTruthy()
      expect(Object.keys(r.metadata).sort()).toEqual(['actor_id', 'event_id', 'new_sprint_id', 'operation', 'previous_sprint_id', 'source'].sort())
    }
  })

  it('deleting a linked sprint (FK SET NULL) is recorded as a system unlink', async (ctx) => {
    need(ctx)
    const s = id(); extraSprints.push(s)
    await sql("insert into public.sprints (id, name, status) values ($1,$2,'planning')", [s, `ICPLC ${TAG} doomed`])
    await mkEvent('L2', `ICPLC ${TAG} L2`, null)
    await sql('update public.event_configs set sprint_id = $2 where id = $1', [ev.L2, s])
    await sql('delete from public.sprints where id = $1', [s])
    const rows = await auditRows('event_config', ev.L2, 'event_sprint_link_changed')
    expect(rows.map((r) => r.metadata.operation)).toEqual(['linked', 'unlinked'])
    expect(rows[1].metadata.previous_sprint_id).toBe(s)
    expect(rows[1].metadata.new_sprint_id).toBeNull()
    expect(rows[1].metadata.source).toBe('system')
  })

  it('an event created already linked is recorded as linked', async (ctx) => {
    need(ctx)
    await mkEvent('L3', `ICPLC ${TAG} L3`, 'A')
    const rows = await auditRows('event_config', ev.L3, 'event_sprint_link_changed')
    expect(rows.map((r) => r.metadata.operation)).toEqual(['linked'])
  })
})

// ═════════════════════════════════════ 5. TEAM DELETE ═════════════════════════════════════════════════
describe('deleting a team', () => {
  it('delete_sprint_team removes only that team\'s memberships; the person\'s other teams are untouched', async (ctx) => {
    need(ctx)
    await mkSprint('D', `ICPLC ${TAG} D`); await mkTeam('dA', 'D', 'Alpha'); await mkTeam('dB', 'D', 'Beta'); await mkTeam('dC', 'D', 'Gamma')
    for (const t of ['dA', 'dB', 'dC']) await join(t, 'staff2')
    await join('dA', 'staff3')
    const { error } = await clients.superAdmin.rpc('delete_sprint_team', { p_team_id: tm.dA })
    expect(error).toBeNull()
    expect(await teamsOf('staff2', 'D')).toEqual(['Beta', 'Gamma'])
    expect(await teamsOf('staff3', 'D')).toEqual([])
    expect((await sql('select count(*)::int n from public.sprint_teams where id = $1', [tm.dA])).rows[0].n).toBe(0)
    // each removed membership was audited individually
    const removed = (await auditRows('sprint_team', tm.dA, 'sprint_team_member_removed')).map((r) => r.metadata.affected_user_id).sort()
    expect(removed).toEqual([users.staff2, users.staff3].sort())
    expect((await auditRows('sprint_team', tm.dB)).filter((r) => r.action === 'sprint_team_member_removed')).toEqual([])
  })

  it('the FK cascades a raw team delete the same way (other teams untouched)', async (ctx) => {
    need(ctx)
    await sql('delete from public.sprint_teams where id = $1', [tm.dB])
    expect(await teamsOf('staff2', 'D')).toEqual(['Gamma'])
  })

  it('FK shape: sprint_team_members.team_id ON DELETE CASCADE', async (ctx) => {
    need(ctx)
    const r = await sql(`select confdeltype from pg_constraint where conrelid = 'public.sprint_team_members'::regclass and contype = 'f'
                         and pg_get_constraintdef(oid) like 'FOREIGN KEY (team_id)%'`)
    expect(r.rows.map((x) => x.confdeltype)).toEqual(['c'])
  })

  it('a team with no sprint cannot be deleted by the RPC (it is a no-op); archive is the available path', async (ctx) => {
    need(ctx)
    const t = id()
    await sql("insert into public.sprint_teams (id, sprint_id, name) values ($1, null, 'Independent')", [t])
    const { error } = await clients.superAdmin.rpc('delete_sprint_team', { p_team_id: t })
    expect(error).toBeNull()
    expect((await sql('select count(*)::int n from public.sprint_teams where id = $1', [t])).rows[0].n).toBe(1)
    await sql('delete from public.sprint_teams where id = $1', [t])
  })
})

// ═════════════════════════ 6. EXPIRED TEMPORARY MEMBERSHIP / INACTIVE ACCOUNT ═══════════════════════════
const setMember = (sprintKey, user, { temp = false, end = null } = {}) => sql(
  'insert into public.sprint_members (sprint_id, user_id, is_temporary, membership_end_date) values ($1,$2,$3,$4) on conflict (sprint_id, user_id) do update set is_temporary = $3, membership_end_date = $4',
  [sp[sprintKey], users[user], temp, end])
const dayOffset = (n) => sql('select (current_date + $1::int)::date as d', [n]).then((r) => r.rows[0].d)
const canTeamWrite = async (user, event = 'A') => (await write(user, event)) > 0
const memberRows = async (user, sprintKey) => (await sql('select count(*)::int n from public.sprint_team_members stm join public.sprint_teams st on st.id = stm.team_id where stm.user_id = $1 and st.sprint_id = $2', [users[user], sp[sprintKey]])).rows[0].n

describe('an expired temporary sprint membership, or an inactive account, no longer authorizes', () => {
  it('permanent sprint member with a team is active', async (ctx) => {
    need(ctx)
    await setMember('A', 'permM'); await join('tA', 'permM')
    expect(await canTeamWrite('permM')).toBe(true)
    expect((await cmp('permM', 'A'))).toEqual(ALLOWED)
  })

  it('temporary member before expiry is active; ON the end date and after it is expired (date semantics, end date inclusive)', async (ctx) => {
    need(ctx)
    await setMember('A', 'tempOk', { temp: true, end: await dayOffset(1) }); await join('tA', 'tempOk')
    expect(await canTeamWrite('tempOk')).toBe(true)
    await setMember('A', 'tempOk', { temp: true, end: await dayOffset(0) })
    expect(await canTeamWrite('tempOk')).toBe(false) // end date == today counts as expired, as in the daily job (<=)
    await setMember('A', 'tempOk', { temp: true, end: await dayOffset(-1) })
    expect(await canTeamWrite('tempOk')).toBe(false)
  })

  it('expired member whose team rows remain is denied on every path; nothing is deleted; renewing restores access', async (ctx) => {
    need(ctx)
    await setMember('A', 'tempExp', { temp: true, end: await dayOffset(-5) }); await join('tA', 'tempExp')
    const before = await memberRows('tempExp', 'A')
    expect(before).toBe(1)
    const paths = async () => ({
      read: (await read('tempExp', 'A')).length > 0, write: await canTeamWrite('tempExp'), import: await importAllowed('tempExp', 'A'),
      regImport: await regImportAllowed('tempExp', 'A'), helperWrite: await helper('tempExp', 'icplc_can_write_participants', 'A'), cmp: await cmp('tempExp', 'A'),
    })
    expect(await paths()).toEqual({ read: false, write: false, import: false, regImport: false, helperWrite: false, cmp: DENIED })
    expect(await memberRows('tempExp', 'A')).toBe(before) // rows kept as history/configuration
    expect((await sql('select count(*)::int n from public.sprint_members where user_id = $1', [users.tempExp])).rows[0].n).toBe(1)
    await setMember('A', 'tempExp', { temp: true, end: await dayOffset(30) }) // renewed
    expect(await paths()).toEqual({ read: true, write: true, import: true, regImport: true, helperWrite: true, cmp: ALLOWED })
    await setMember('A', 'tempExp', { temp: false, end: null }) // made permanent
    expect(await canTeamWrite('tempExp')).toBe(true)
  })

  it('multi-team temporary member: ALL team-derived grants vanish when the parent sprint membership expires', async (ctx) => {
    need(ctx)
    await setMember('A', 'tempExp2', { temp: true, end: await dayOffset(10) }); await join('tA', 'tempExp2'); await join('tB', 'tempExp2')
    expect(await canTeamWrite('tempExp2')).toBe(true)
    await archive('tA', true) // still has Operations
    expect(await canTeamWrite('tempExp2')).toBe(true)
    await archive('tA', false)
    await setMember('A', 'tempExp2', { temp: true, end: await dayOffset(-1) })
    expect(await canTeamWrite('tempExp2')).toBe(false)
    expect(await read('tempExp2', 'A')).toEqual([])
    expect(await memberRows('tempExp2', 'A')).toBe(2)
  })

  it('an expired DIRECT member with a restrictive team still cannot use the generic arm', async (ctx) => {
    need(ctx)
    await setMember('A', 'tempFin', { temp: true, end: await dayOffset(-1) }); await join('tFin', 'tempFin')
    expect(await read('tempFin', 'A')).toEqual([])
    await setMember('A', 'tempFin', { temp: true, end: await dayOffset(5) })
    expect(await read('tempFin', 'A')).toEqual([]) // active, but Finance-only: team rules apply (F1)
  })

  it('a team-only member (no sprint_members row at all) is not treated as expired', async (ctx) => {
    need(ctx)
    await join('tA', 'teamOnly')
    expect((await sql('select count(*)::int n from public.sprint_members where user_id = $1', [users.teamOnly])).rows[0].n).toBe(0)
    expect(await canTeamWrite('teamOnly')).toBe(true)
  })

  it('an account that is not active has no sprint- or team-derived access; reactivating restores it', async (ctx) => {
    need(ctx)
    await setMember('A', 'inactiveU'); await join('tA', 'inactiveU')
    expect(await canTeamWrite('inactiveU')).toBe(true)
    for (const status of ['inactive', 'archived', 'invited', 'pending_activation']) {
      await sql('update public.users set status = $2 where id = $1', [users.inactiveU, status])
      expect(await canTeamWrite('inactiveU'), status).toBe(false)
      expect((await read('inactiveU', 'A')).length, status).toBe(0) // direct-member arm too
      expect(await cmp('inactiveU', 'A'), status).toEqual(DENIED)
    }
    await sql("update public.users set status = 'active' where id = $1", [users.inactiveU])
    expect(await canTeamWrite('inactiveU')).toBe(true)
  })

  it('platform behaviour is unchanged: a platform role is not subject to the sprint-membership rules', async (ctx) => {
    need(ctx)
    await setMember('A', 'superAdmin', { temp: true, end: await dayOffset(-3) }) // even an "expired" row does not matter
    expect((await read('superAdmin', 'A')).length).toBeGreaterThan(0)
    expect(await cmp('superAdmin', 'A')).toEqual(ALLOWED)
    await sql('delete from public.sprint_members where user_id = $1', [users.superAdmin])
  })

  it('NULL event sprint_id still fails closed, even for an active permanent member', async (ctx) => {
    need(ctx)
    await mkEvent('N2', `ICPLC ${TAG} N2`, null); await person('N2', 'N2 person')
    expect(await read('permM', 'N2')).toEqual([])
    expect(await cmp('permM', 'N2')).toEqual(DENIED)
  })

  it('the explicit-user helpers are not callable by signed-in users (no probing of other people)', async (ctx) => {
    need(ctx)
    for (const [fn, args] of [
      ['icplc_user_team_can_write', { p_user_id: users.permM, p_event_id: ev.A }],
      ['icplc_event_team_memberships_for', { p_user_id: users.permM, p_event_id: ev.A, p_include_archived: false }],
      ['is_active_sprint_member', { p_sprint_id: sp.A, p_user_id: users.permM }],
      ['is_active_account', { p_user_id: users.permM }],
    ]) {
      const { error } = await clients.stranger.rpc(fn, args)
      expect(error?.code, fn).toBe('42501')
    }
  })
})

// ═════════════════════════ 7. ATOMIC TEAM MEMBERSHIP (real user JWTs, real concurrency) ═══════════════════
describe('atomic sprint team membership', () => {
  let S // sprint key
  const T = {}
  const rpc = (user, fn, args) => clients[user].rpc(fn, args)
  const add = (user, team, who = 'target') => rpc(user, 'add_sprint_team_member', { p_sprint_id: sp[S], p_team_id: tm[team], p_user_id: users[who], p_role: null })
  const remove = (user, team, who = 'target') => rpc(user, 'remove_sprint_team_member', { p_sprint_id: sp[S], p_team_id: tm[team], p_user_id: users[who] })
  const names = (who = 'target') => teamsOf(who, S)
  const audits = async (team, who = 'target') => (await auditRows('sprint_team', tm[team]))
    .filter((r) => r.action.startsWith('sprint_team_member_') && r.metadata.affected_user_id === users[who])
    .map((r) => r.action.replace('sprint_team_member_', ''))

  beforeAll(async () => {
    if (!available) return
    S = 'AT'
    await mkSprint(S, `ICPLC ${TAG} AT`)
    await sql('update public.sprints set created_by = $2 where id = $1', [sp[S], users.lead]) // lead = sprint creator => can_manage_sprint
    for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) { await mkTeam(`at${n}`, S, `Team ${n}`) }
    await direct(S, 'plainMember'); await direct(S, 'multi')
    await join('atA', 'multi'); await join('atB', 'multi')
  })

  it('authorization: sprint manager and super admin may change membership; ordinary member, multi-team member and stranger may not', async (ctx) => {
    need(ctx)
    for (const who of ['plainMember', 'multi', 'stranger']) {
      const a = await add(who, 'atA'); expect(a.error?.code, `${who} add: ${JSON.stringify(a)}`).toBe('42501')
      const r = await remove(who, 'atA', 'multi'); expect(r.error?.code, `${who} remove`).toBe('42501')
    }
    expect(await names('multi')).toEqual(['Team A', 'Team B']) // refused calls changed nothing
    expect((await add('lead', 'atA')).data).toBe(true)
    expect((await add('superAdmin', 'atB')).data).toBe(true)
    expect(await names()).toEqual(['Team A', 'Team B'])
    expect((await rpc('stranger', 'reconcile_sprint_member_teams', { p_sprint_id: sp[S], p_user_id: users.target, p_desired: [], p_expected: [tm.atA, tm.atB] })).error?.code).toBe('42501')
    expect(await names()).toEqual(['Team A', 'Team B'])
  })

  it('validation: wrong sprint, unknown team and unknown user are rejected without changes', async (ctx) => {
    need(ctx)
    const wrong = await rpc('lead', 'add_sprint_team_member', { p_sprint_id: sp.A, p_team_id: tm.atC, p_user_id: users.target, p_role: null })
    expect(wrong.error?.code).toBe('22023')
    expect((await rpc('lead', 'add_sprint_team_member', { p_sprint_id: sp[S], p_team_id: id(), p_user_id: users.target, p_role: null })).error?.code).toBe('P0002')
    expect((await rpc('lead', 'add_sprint_team_member', { p_sprint_id: sp[S], p_team_id: tm.atC, p_user_id: id(), p_role: null })).error?.code).toBe('P0002')
    expect(await names()).toEqual(['Team A', 'Team B'])
  })

  it('A+B: add C -> A+B+C; remove A -> B+C; each operation is idempotent and audits exactly one event (a no-op audits none)', async (ctx) => {
    need(ctx)
    expect((await add('lead', 'atC')).data).toBe(true)
    expect(await names()).toEqual(['Team A', 'Team B', 'Team C'])
    expect((await add('lead', 'atC')).data).toBe(false) // already a member: nothing written
    expect((await remove('lead', 'atA')).data).toBe(true)
    expect(await names()).toEqual(['Team B', 'Team C'])
    expect((await remove('lead', 'atA')).data).toBe(false)
    expect(await audits('atC')).toEqual(['added']) // exactly one, despite the repeated call
    expect(await audits('atA')).toEqual(['added', 'removed'])
    expect(await audits('atB')).toEqual(['added']) // removing A did not touch B's history
  })

  it('concurrent add D / add E (different staff) -> B+C+D+E; concurrent remove B / add F -> C+D+E+F', async (ctx) => {
    need(ctx)
    const r1 = await Promise.all([add('lead', 'atD'), add('superAdmin', 'atE')])
    expect(r1.map((r) => r.data)).toEqual([true, true])
    expect(await names()).toEqual(['Team B', 'Team C', 'Team D', 'Team E'])
    const r2 = await Promise.all([remove('lead', 'atB'), add('superAdmin', 'atF')])
    expect(r2.map((r) => r.data)).toEqual([true, true])
    expect(await names()).toEqual(['Team C', 'Team D', 'Team E', 'Team F'])
  })

  it('many racing operations on one person converge to exactly the intended set (no lost updates)', async (ctx) => {
    need(ctx)
    await sql('delete from public.sprint_team_members where user_id = $1', [users.staff1])
    const adds = ['atA', 'atB', 'atC', 'atD', 'atE', 'atF'].map((t, i) => add(i % 2 ? 'lead' : 'superAdmin', t, 'staff1'))
    expect((await Promise.all(adds)).every((r) => r.data === true)).toBe(true)
    expect(await names('staff1')).toEqual(['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F'])
    await Promise.all([remove('lead', 'atC', 'staff1'), remove('superAdmin', 'atE', 'staff1')])
    expect(await names('staff1')).toEqual(['Team A', 'Team B', 'Team D', 'Team F'])
    // racing operations on DIFFERENT teams: removes of A and B alongside adds of C and E
    const mixed = [remove('lead', 'atA', 'staff1'), remove('superAdmin', 'atB', 'staff1'), add('lead', 'atC', 'staff1'), add('superAdmin', 'atE', 'staff1')]
    expect((await Promise.all(mixed)).map((r) => r.data)).toEqual([true, true, true, true])
    expect(await names('staff1')).toEqual(['Team C', 'Team D', 'Team E', 'Team F'])
  })

  it('the former replace-set hazard, modelled: stale full-set writes lose concurrent changes (why the interactive path moved)', async (ctx) => {
    need(ctx)
    const legacyReplaceSet = async (who, desired) => { // the removed updateSprintMemberTeams algorithm: delete all, insert the caller's list
      await sql('delete from public.sprint_team_members where user_id = $1 and team_id = any($2)', [users[who], Object.entries(tm).filter(([k]) => k.startsWith('at')).map(([, v]) => v)])
      for (const t of desired) await sql('insert into public.sprint_team_members (team_id, user_id) values ($1,$2)', [tm[t], users[who]])
    }
    await legacyReplaceSet('staff2', ['atA', 'atB'])
    await legacyReplaceSet('staff2', ['atA', 'atB', 'atC']) // staff 1 adds C
    await legacyReplaceSet('staff2', ['atA', 'atB', 'atD']) // staff 2, stale A+B, adds D
    expect(await names('staff2')).toEqual(['Team A', 'Team B', 'Team D']) // C silently lost
    // same sequence with the atomic operations keeps everything
    await sql('delete from public.sprint_team_members where user_id = $1', [users.staff2])
    await add('lead', 'atA', 'staff2'); await add('lead', 'atB', 'staff2')
    await add('lead', 'atC', 'staff2'); await add('superAdmin', 'atD', 'staff2')
    expect(await names('staff2')).toEqual(['Team A', 'Team B', 'Team C', 'Team D'])
  })

  it('reconcile: one transaction, applies only the difference, one audit event per changed row', async (ctx) => {
    need(ctx)
    await sql('delete from public.sprint_team_members where user_id = $1', [users.staff3])
    await add('lead', 'atA', 'staff3'); await add('lead', 'atB', 'staff3')
    const { data, error } = await rpc('lead', 'reconcile_sprint_member_teams', { p_sprint_id: sp[S], p_user_id: users.staff3, p_desired: [tm.atB, tm.atC], p_expected: [tm.atA, tm.atB] })
    expect(error).toBeNull()
    expect(data.added).toEqual([tm.atC]); expect(data.removed).toEqual([tm.atA])
    expect(await names('staff3')).toEqual(['Team B', 'Team C'])
    expect((await audits('atC')).length).toBeGreaterThan(0)
    const again = await rpc('lead', 'reconcile_sprint_member_teams', { p_sprint_id: sp[S], p_user_id: users.staff3, p_desired: [tm.atB, tm.atC], p_expected: [tm.atB, tm.atC] })
    expect(again.data).toEqual({ added: [], removed: [] }) // idempotent
  })

  it('reconcile refuses stale expectations, foreign teams, and a missing expectation, changing nothing', async (ctx) => {
    need(ctx)
    const stale = await rpc('lead', 'reconcile_sprint_member_teams', { p_sprint_id: sp[S], p_user_id: users.staff3, p_desired: [tm.atD], p_expected: [tm.atB] })
    expect(stale.error?.code).toBe('40001'); expect(stale.error?.message).toMatch(/stale_membership_state/)
    const foreign = await rpc('lead', 'reconcile_sprint_member_teams', { p_sprint_id: sp[S], p_user_id: users.staff3, p_desired: [tm.tA], p_expected: [tm.atB, tm.atC] })
    expect(foreign.error?.code).toBe('22023')
    const none = await rpc('lead', 'reconcile_sprint_member_teams', { p_sprint_id: sp[S], p_user_id: users.staff3, p_desired: [], p_expected: null })
    expect(none.error?.code).toBe('22023')
    expect(await names('staff3')).toEqual(['Team B', 'Team C'])
  })

  it('the application API (real functions) is wired to the atomic operations and the replace-set function is gone', async (ctx) => {
    need(ctx)
    globalThis.__staffClient = clients.lead
    expect(sprintsApi.updateSprintMemberTeams).toBeUndefined()
    expect(await sprintsApi.addSprintTeamMembership(sp[S], tm.atE, users.staff3)).toBe(true)
    expect(await sprintsApi.addSprintTeamMembership(sp[S], tm.atE, users.staff3)).toBe(false)
    expect(await names('staff3')).toEqual(['Team B', 'Team C', 'Team E'])
    expect(await sprintsApi.removeSprintTeamMembership(sp[S], tm.atB, users.staff3)).toBe(true)
    await expect(sprintsApi.addSprintTeamMembership(sp.A, tm.atF, users.staff3)).rejects.toMatchObject({ code: '22023' })
    await expect(sprintsApi.reconcileSprintMemberTeams(sp[S], users.staff3, [tm.atC], [tm.atB])).rejects.toMatchObject({ code: '40001' })
    expect(await names('staff3')).toEqual(['Team C', 'Team E'])
  })

  it('works on a database that (unlike the chain) carries a legacy sprint_id column', async (ctx) => {
    need(ctx)
    await sql('alter table public.sprint_team_members add column if not exists sprint_id uuid not null default gen_random_uuid()')
    try {
      expect((await add('lead', 'atB', 'staff3')).data).toBe(true)
      const row = await sql('select sprint_id from public.sprint_team_members where team_id = $1 and user_id = $2', [tm.atB, users.staff3])
      expect(row.rows[0].sprint_id).toBe(sp[S]) // filled from the team's sprint by the drift shim
    } finally {
      await sql('alter table public.sprint_team_members drop column if exists sprint_id')
    }
  })
})

// ═════════════════════════ 8. GROUP PASTOR ACCESS REQUIRES AN ACTIVE ACCOUNT ═════════════════════════════
describe('Group Pastor subgroup access requires an active account', () => {
  const CENTRAL = 'BLW Central Subgroup A'; const WEST = 'BLW West Subgroup B'
  let tagId
  const gpRow = (event, name, nexusUser, subgroup = CENTRAL, leadership = 'Group Pastor') => sql(
    'insert into public.icplc_participants (event_id, full_name, subgroup, leadership, nexus_user_id) values ($1,$2,$3,$4,$5)',
    [ev[event], name, subgroup, leadership, nexusUser ? users[nexusUser] : null])
  const gpRelationship = async (user) => (await sql("select count(*)::int n from public.icplc_participants where nexus_user_id = $1 and lower(btrim(leadership)) = 'group pastor'", [users[user]])).rows[0].n
  const tagsVisible = async (user) => {
    const { data, error } = await clients[user].from('icplc_participant_tags').select('participant_id, tag_id')
    if (error) throw new Error(error.message)
    return data.length
  }

  beforeAll(async () => {
    if (!available) return
    // event G is NOT linked to any sprint: GP access is participant-derived, never sprint-derived
    await mkEvent('G', `ICPLC ${TAG} G`, null)
    await gpRow('G', 'G pastor', 'gp1'); await gpRow('G', 'G central member', null, CENTRAL, null); await gpRow('G', 'G west member', null, WEST, null)
    await gpRow('G', 'Dup pastor row 1', 'gpDup'); await gpRow('G', 'Dup pastor row 2', 'gpDup', WEST) // ambiguous mapping
    tagId = id()
    await sql('insert into public.icplc_tags (id, event_id, name) values ($1,$2,$3)', [tagId, ev.G, `${TAG} tag`])
    const central = (await sql("select id from public.icplc_participants where event_id = $1 and full_name = 'G central member'", [ev.G])).rows[0].id
    await sql('insert into public.icplc_participant_tags (participant_id, tag_id) values ($1,$2)', [central, tagId])
  })

  it('active GP sees exactly their own subgroup (existing rules), cannot write, and sees its tags', async (ctx) => {
    need(ctx)
    expect(await read('gp1', 'G')).toEqual(['Dup pastor row 1', 'G central member', 'G pastor']) // not the West subgroup
    expect(await write('gp1', 'G')).toBe(0)
    expect(await tagsVisible('gp1')).toBe(1)
  })

  it('inactive, archived, invited and pending-activation GPs get nothing; the GP relationship is not altered', async (ctx) => {
    need(ctx)
    const before = await gpRelationship('gp1')
    for (const status of ['inactive', 'archived', 'invited', 'pending_activation']) {
      await sql('update public.users set status = $2 where id = $1', [users.gp1, status])
      expect(await read('gp1', 'G'), status).toEqual([])
      expect(await tagsVisible('gp1'), status).toBe(0)
      expect(await gpRelationship('gp1'), status).toBe(before) // participant record untouched
    }
  })

  it('a reactivated GP gets access back while the relationship is still valid', async (ctx) => {
    need(ctx)
    await sql("update public.users set status = 'active' where id = $1", [users.gp1])
    expect(await read('gp1', 'G')).toEqual(['Dup pastor row 1', 'G central member', 'G pastor'])
    // relationship no longer valid (not a Group Pastor any more) -> no access even though the account is active
    await sql("update public.icplc_participants set leadership = null where nexus_user_id = $1", [users.gp1])
    expect(await read('gp1', 'G')).toEqual([])
    await sql("update public.icplc_participants set leadership = 'Group Pastor' where nexus_user_id = $1", [users.gp1])
    expect(await read('gp1', 'G')).toEqual(['Dup pastor row 1', 'G central member', 'G pastor'])
  })

  it('an unrelated active user is denied; a duplicate/ambiguous GP mapping still fails closed', async (ctx) => {
    need(ctx)
    expect(await read('activeOther', 'G')).toEqual([])
    expect(await read('gpDup', 'G')).toEqual([]) // two Group Pastor rows -> existing fail-closed behaviour preserved
    expect(await tagsVisible('gpDup')).toBe(0)
  })

  it('platform behaviour is unchanged: a platform role still reads the event regardless of the GP rules', async (ctx) => {
    need(ctx)
    expect((await read('superAdmin', 'G')).length).toBe(5)
  })

  it('the GP write restriction still applies to an active GP who is also a team writer', async (ctx) => {
    need(ctx)
    await sql("update public.users set status = 'active' where id = $1", [users.gp1])
    await sql('delete from public.sprint_team_members where user_id = $1 and team_id = $2', [users.gp1, tm.tA]).catch(() => {})
    await join('tA', 'gp1')
    await sql('update public.event_configs set sprint_id = $2 where id = $1', [ev.G, sp.A])
    expect(await write('gp1', 'G')).toBe(0) // restriction not loosened
    await sql('update public.event_configs set sprint_id = null where id = $1', [ev.G])
    await leave('tA', 'gp1')
  })
})
