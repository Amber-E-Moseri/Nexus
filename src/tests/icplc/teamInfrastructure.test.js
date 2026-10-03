/**
 * Sprint/Team infrastructure hardening, against a REAL local Supabase stack (GoTrue sign-in, PostgREST + RLS under
 * real user JWTs, the full migration chain, both CMP Edge Functions under Deno).
 *
 * Covers: archived teams must not authorize; the two import RPCs that were still gated by the any-event helper;
 * team-membership and event->sprint-link auditing; team deletion invariants; expiry characterization; and the
 * lost-update behaviour of the replace-set team API (updateSprintMemberTeams).
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
const { updateSprintMemberTeams } = await import('../../features/sprints/lib/sprints.js')

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
  for (const k of ['x', 'xm', 'xf', 'writerB', 'staff1', 'staff2', 'staff3', 'target']) await mkUser(k)
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

// ═════════════════════════════════════ 6. EXPIRY — CURRENT SEMANTICS (characterization) ══════════════════
describe('temporary-membership expiry: what the database does today', () => {
  it('an expired temporary sprint membership does not stop sprint-derived ICPLC access (no function reads membership_end_date)', async (ctx) => {
    need(ctx)
    await mkUser('temp')
    await sql("insert into public.sprint_members (sprint_id, user_id, is_temporary, membership_end_date) values ($1,$2,true,current_date - 30)", [sp.A, users.temp])
    expect(await read('temp', 'A')).toContain('A person') // direct member: generic arm ignores the end date
    await join('tA', 'temp')
    expect(await write('temp', 'A')).toBeGreaterThan(0) // team arm ignores it as well
  })

  it('the daily job\'s boundary is users.status = inactive; ICPLC authorization does not consult it either', async (ctx) => {
    need(ctx)
    await sql("update public.users set status = 'inactive' where id = $1", [users.temp])
    expect(await write('temp', 'A')).toBeGreaterThan(0) // still authorized by team membership
    await sql("update public.users set status = 'active' where id = $1", [users.temp])
  })

  it('sprint_team_members has no expiry column', async (ctx) => {
    need(ctx)
    const cols = (await sql("select column_name from information_schema.columns where table_schema='public' and table_name='sprint_team_members'")).rows.map((r) => r.column_name)
    expect(cols.filter((c) => /end|expire|until|temporary/i.test(c))).toEqual([])
  })
})

// ═════════════════════════════════════ 7. REPLACE-SET TEAM API — LOST UPDATES ════════════════════════════
describe('updateSprintMemberTeams (the real replace-set API)', () => {
  // Service role: user-JWT writes to these tables hit the policy recursion noted above. The statement sequence the
  // function issues (delete, then insert) and its stale-input semantics are what is under test, not RLS.
  const as = () => { globalThis.__staffClient = admin }

  it('on the schema produced by the migration chain it deletes the person\'s teams and then fails to re-insert (data loss)', async (ctx) => {
    need(ctx)
    await mkSprint('R0', `ICPLC ${TAG} R0`); await mkTeam('r0a', 'R0', 'A'); await mkTeam('r0b', 'R0', 'B')
    await join('r0a', 'staff1')
    as('manager')
    // the call inserts a sprint_id into sprint_team_members, a column the replayed migrations never create
    await expect(updateSprintMemberTeams(sp.R0, users.staff1, [tm.r0a, tm.r0b])).rejects.toMatchObject({ code: 'PGRST204' })
    expect(await teamsOf('staff1', 'R0')).toEqual([]) // the delete step had already removed the existing membership
  })

  describe('with a prod-like sprint_id column present (code comments say it exists and is NOT NULL in production)', () => {
    beforeAll(async () => {
      if (!available) return
      await sql('alter table public.sprint_team_members add column if not exists sprint_id uuid')
      await sql("notify pgrst, 'reload schema'")
      await new Promise((r) => setTimeout(r, 2500))
    })
    afterAll(async () => {
      if (!available) return
      await sql('alter table public.sprint_team_members drop column if exists sprint_id')
      await sql("notify pgrst, 'reload schema'")
    })

    it('ADD scenario: staff 2 acting on a stale A+B view silently erases the C that staff 1 just added', async (ctx) => {
      need(ctx)
      await mkSprint('R1', `ICPLC ${TAG} R1`)
      for (const [k, n] of [['r1a', 'A'], ['r1b', 'B'], ['r1c', 'C'], ['r1d', 'D']]) await mkTeam(k, 'R1', n)
      await join('r1a', 'target'); await join('r1b', 'target') // X -> A + B
      const staff1View = [tm.r1a, tm.r1b]; const staff2View = [tm.r1a, tm.r1b] // both loaded A+B
      as('manager'); await updateSprintMemberTeams(sp.R1, users.target, [...staff1View, tm.r1c]) // staff 1 adds C
      expect(await teamsOf('target', 'R1')).toEqual(['A', 'B', 'C'])
      as('manager'); await updateSprintMemberTeams(sp.R1, users.target, [...staff2View, tm.r1d]) // staff 2 adds D (stale)
      expect(await teamsOf('target', 'R1')).toEqual(['A', 'B', 'D']) // C is lost: this is the defect
    })

    it('REMOVE scenario: a stale view resurrects a membership another staff member removed', async (ctx) => {
      need(ctx)
      // current: A, B, D ; staff 1 removes B; staff 2 (stale A+B+D) removes D
      const stale = [tm.r1a, tm.r1b, tm.r1d]
      as('manager'); await updateSprintMemberTeams(sp.R1, users.target, stale.filter((t) => t !== tm.r1b))
      expect(await teamsOf('target', 'R1')).toEqual(['A', 'D'])
      as('manager'); await updateSprintMemberTeams(sp.R1, users.target, stale.filter((t) => t !== tm.r1d))
      expect(await teamsOf('target', 'R1')).toEqual(['A', 'B']) // B is back although it had been removed; the removal is lost
    })

    it('single-relationship operations do not have the problem (the model to move interactive callers to)', async (ctx) => {
      need(ctx)
      await mkSprint('R2', `ICPLC ${TAG} R2`)
      for (const [k, n] of [['r2a', 'A'], ['r2b', 'B'], ['r2c', 'C'], ['r2d', 'D']]) await mkTeam(k, 'R2', n)
      await join('r2a', 'target'); await join('r2b', 'target')
      const add = (t) => admin.from('sprint_team_members').insert({ team_id: tm[t], user_id: users.target })
      const remove = (t) => admin.from('sprint_team_members').delete().eq('team_id', tm[t]).eq('user_id', users.target)
      await Promise.all([add('r2c'), add('r2d')])
      expect(await teamsOf('target', 'R2')).toEqual(['A', 'B', 'C', 'D'])
      await Promise.all([remove('r2b'), remove('r2d')])
      expect(await teamsOf('target', 'R2')).toEqual(['A', 'C'])
    })
  })
})
