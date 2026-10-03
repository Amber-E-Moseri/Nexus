/**
 * Event -> sprint authorization against a REAL local Supabase stack (GoTrue sign-in, PostgREST + RLS under real user
 * JWTs, the real migration chain, and the two CMP Edge Functions run under Deno).
 *
 * Every fixture is synthetic and removed afterwards. No production data, sprint or team is read or written.
 * Requires a local Supabase (`supabase start` or equivalent). Without one the suite fails when ICPLC_REQUIRE_DB=1
 * (or CI=true) and is skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import net from 'node:net'
import pg from 'pg'

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const API_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYT0'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const REQUIRE = process.env.ICPLC_REQUIRE_DB === '1' || process.env.CI === 'true'
const PASSWORD = 'Local-sprintlink-123456!'
const TAG = `slk${Date.now().toString(36)}`

const pool = new pg.Pool({ connectionString: PG_URL, max: 4 })
const sql = (q, p = []) => pool.query(q, p)
const id = () => randomUUID()

let available = false
let skipReason = ''
let admin
const users = {}
const tokens = {}
const clients = {}
const ev = {} // events
const sp = {} // sprints
const tm = {} // teams
let procs = []
let ownDept = null
let mock
let ports = {}

// ── fixture helpers ───────────────────────────────────────────────────────────────────────────────────────
async function mkUser(key, { role = 'member', dept = null } = {}) {
  const email = `${TAG}-${key}@local.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw new Error(`createUser ${key}: ${error.message}`)
  const uid = data.user.id
  await sql(`insert into public.users (id, email, name, role, status, department_id) values ($1,$2,$3,$4,'active',$5)
             on conflict (id) do update set role = $4, department_id = $5`, [uid, email, key, role, dept])
  const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error: se } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (se) throw new Error(`signIn ${key}: ${se.message}`)
  users[key] = uid
  tokens[key] = s.session.access_token
  clients[key] = createClient(API_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}` } } })
}
const mkEvent = async (key, name, pattern, sprintId = null) => {
  ev[key] = id()
  await sql('insert into public.event_configs (id, event_name, sprint_pattern, sprint_id, is_active) values ($1,$2,$3,$4,false)', [ev[key], name, pattern, sprintId])
}
const mkSprint = async (key, name) => { sp[key] = id(); await sql("insert into public.sprints (id, name, status) values ($1,$2,'planning')", [sp[key], name]) }
const mkTeam = async (key, sprintKey, name) => { tm[key] = id(); await sql('insert into public.sprint_teams (id, sprint_id, name) values ($1,$2,$3)', [tm[key], sp[sprintKey], name]) }
const join = (team, user) => sql('insert into public.sprint_team_members (team_id, user_id) values ($1,$2)', [tm[team], users[user]])
const leave = (team, user) => sql('delete from public.sprint_team_members where team_id = $1 and user_id = $2', [tm[team], users[user]])
const direct = (sprint, user) => sql('insert into public.sprint_members (sprint_id, user_id) values ($1,$2)', [sp[sprint], users[user]])
const person = (event, name, extra = {}) => sql(
  'insert into public.icplc_participants (event_id, full_name, subgroup, leadership, nexus_user_id) values ($1,$2,$3,$4,$5)',
  [ev[event], name, extra.subgroup ?? 'BLW Central Subgroup A', extra.leadership ?? null, extra.nexus ?? null])
const batch = async (event) => { const b = id(); await sql("insert into public.icplc_import_batches (id, event_id, source) values ($1,$2,'registration_csv')", [b, ev[event]]); return b }
const link = (event, sprintKey) => sql('update public.event_configs set sprint_id = $2 where id = $1', [ev[event], sprintKey ? sp[sprintKey] : null])

// ── acts as the user through PostgREST / RLS ──────────────────────────────────────────────────────────────
const read = async (user, event) => {
  const { data, error } = await clients[user].from('icplc_participants').select('full_name').eq('event_id', ev[event]).order('full_name')
  if (error) throw new Error(`read ${user}/${event}: ${error.message}`)
  return data.map((r) => r.full_name)
}
const write = async (user, event) => {
  const { data, error } = await clients[user].from('icplc_participants').update({ participation_status: 'tracking' }).eq('event_id', ev[event]).select('id')
  return error ? 0 : data.length
}
const importAllowed = async (user, event) => { // real SECURITY DEFINER RPC guard (icplc_can_import)
  const b = await batch(event)
  const { error } = await clients[user].rpc('icplc_preview_import', { p_batch_id: b })
  return !/permission denied|authorization/i.test(error?.message || '')
}
const regImportAllowed = async (user, event) => { // real SECURITY DEFINER RPC guard (icplc_can_write_participants)
  const b = await batch(event)
  const { error } = await clients[user].rpc('icplc_preview_registration_import', { p_batch_id: b })
  return !/Insufficient authorization|permission denied/i.test(error?.message || '')
}

// ── Edge Functions (real code, run under Deno) ────────────────────────────────────────────────────────────
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
    if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
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

  // The migration chain already seeds the (single) Programs department; reuse it, create one only if absent.
  let progDept = (await sql('select id from public.departments where is_programs = true limit 1')).rows[0]?.id
  if (!progDept) {
    progDept = id(); ownDept = progDept
    await sql('insert into public.departments (id, name, is_programs) values ($1,$2,true)', [progDept, `Programs ${TAG}`])
  }

  await mkUser('superAdmin', { role: 'super_admin' })
  await mkUser('regional', { role: 'regional_secretary' })
  await mkUser('programs', { dept: progDept })
  for (const k of ['unrelated', 'directA', 'regA', 'finA', 'gpA', 'x', 'y', 'ab', 'regB', 'dirN', 'regN', 'gpN', 'sharedReg', 'delReg']) await mkUser(k)

  // Event A -> Sprint A, Event B -> Sprint B. Patterns deliberately overlap (both match both sprints).
  await mkSprint('A', `ICPLC ${TAG} Sprint A`); await mkSprint('B', `ICPLC ${TAG} Sprint B`)
  await mkEvent('A', `ICPLC ${TAG} A`, `%ICPLC ${TAG}%`, sp.A)
  await mkEvent('B', `ICPLC ${TAG} B`, `%ICPLC ${TAG}%`, sp.B)
  await mkTeam('aReg', 'A', 'Registration'); await mkTeam('aTrans', 'A', 'Transportation'); await mkTeam('aFin', 'A', 'Finance')
  await mkTeam('bReg', 'B', 'Registration'); await mkTeam('bTrans', 'B', 'Transportation')
  await direct('A', 'directA')
  await join('aReg', 'regA'); await join('aFin', 'finA')
  await join('aReg', 'ab'); await join('bTrans', 'ab') // writer in A, read-only transport in B
  await join('bReg', 'regB')
  await direct('A', 'gpA')
  for (const e of ['A', 'B']) {
    await person(e, `${e} central`); await person(e, `${e} west`, { subgroup: 'BLW West Subgroup B' })
  }
  await person('A', 'A group pastor', { leadership: 'Group Pastor', nexus: users.gpA })

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
    const evIds = Object.values(ev).filter((v) => typeof v === 'string')
    const uids = Object.values(users)
    await sql('delete from public.icplc_import_rows where batch_id in (select id from public.icplc_import_batches where event_id = any($1))', [evIds]).catch(() => {})
    for (const t of ['icplc_import_batches', 'icplc_identity_maps', 'icplc_email_claims', 'icplc_participants']) {
      await sql(`delete from public.${t} where event_id = any($1)`, [evIds]).catch(() => {})
    }
    await sql('delete from public.event_configs where id = any($1) or cloned_from_id = any($1)', [evIds]).catch(() => {})
    await sql('delete from public.sprints where id = any($1)', [Object.values(sp)]).catch(() => {})
    await sql('delete from public.activity_log where user_id = any($1)', [uids]).catch(() => {})
    await sql('delete from public.users where id = any($1)', [uids]).catch(() => {})
    if (ownDept) await sql('delete from public.departments where id = $1', [ownDept]).catch(() => {})
    await Promise.all(uids.map((u) => admin.auth.admin.deleteUser(u).catch(() => {})))
  }
  await pool.end()
})

const need = (ctx) => { if (!available) ctx.skip(skipReason) }
const ALL_A = ['A central', 'A group pastor', 'A west']

describe('explicit event -> sprint authorization on real Supabase', () => {
  it('3a. null sprint_id: sprint-derived access is denied end to end; platform roles keep access', async (ctx) => {
    need(ctx)
    await mkSprint('N', `ICPLC ${TAG} Sprint N`)
    await mkEvent('N', `ICPLC ${TAG} N`, `%ICPLC ${TAG} Sprint N%`, null) // pattern matches Sprint N exactly; no link
    await mkTeam('nReg', 'N', 'Registration'); await mkTeam('nFin', 'N', 'Finance')
    await direct('N', 'dirN'); await join('nReg', 'regN'); await join('nFin', 'unrelated') // unrelated joins nothing useful
    await leave('nFin', 'unrelated')
    await person('N', 'N central'); await person('N', 'N west', { subgroup: 'BLW West Subgroup B' })
    await person('N', 'N group pastor', { leadership: 'Group Pastor', nexus: users.gpN })
    await direct('N', 'gpN'); await join('nReg', 'gpN') // GP who is ALSO a sprint member with a team

    expect(await read('dirN', 'N')).toEqual([]) // direct sprint member -> denied
    expect(await read('regN', 'N')).toEqual([]) // team member -> denied
    expect(await write('regN', 'N')).toBe(0)
    expect(await importAllowed('regN', 'N')).toBe(false)
    expect(await regImportAllowed('regN', 'N')).toBe(false)
    // Group Pastor: sprint-derived arms add nothing; the participant-derived own-subgroup rule is independent of sprint
    expect(await read('gpN', 'N')).toEqual(['N central', 'N group pastor'])
    expect(await write('gpN', 'N')).toBe(0)
    expect(await read('unrelated', 'N')).toEqual([])
    const all = ['N central', 'N group pastor', 'N west']
    for (const platform of ['superAdmin', 'regional', 'programs']) expect(await read(platform, 'N'), platform).toEqual(all)
    expect(await write('superAdmin', 'N')).toBe(3)
    const { data: helper } = await clients.regN.rpc('icplc_can_read_participants', { p_event_id: ev.N })
    expect(helper).toBe(false)
    // CMP Edge Functions: the team writer is denied; platform roles are allowed
    expect(await cmp('regN', 'N')).toEqual(DENIED)
    expect(await cmp('superAdmin', 'N')).toEqual(ALLOWED)
    expect(await cmp('regional', 'N')).toEqual(ALLOWED)
  })

  it('3b. setting the explicit sprint_id turns sprint/team access on without touching sprint_pattern', async (ctx) => {
    need(ctx)
    const patternBefore = (await sql('select sprint_pattern from public.event_configs where id = $1', [ev.N])).rows[0].sprint_pattern
    await link('N', 'N')
    expect((await sql('select sprint_pattern from public.event_configs where id = $1', [ev.N])).rows[0].sprint_pattern).toBe(patternBefore)
    expect(await read('regN', 'N')).toEqual(['N central', 'N group pastor', 'N west']) // team member (Registration) now reads
    expect(await write('regN', 'N')).toBe(3)
    expect(await importAllowed('regN', 'N')).toBe(true)
    expect(await read('dirN', 'N')).toEqual(['N central', 'N group pastor', 'N west']) // team-less direct member now reads
    expect(await write('dirN', 'N')).toBe(0) // direct arm stays read-only
    expect(await read('unrelated', 'N')).toEqual([])
    expect(await cmp('regN', 'N')).toEqual(ALLOWED)
  })

  it('3c. a wrong sprint_pattern cannot redirect authorization away from, or onto, another sprint', async (ctx) => {
    need(ctx)
    for (const wrong of ['%no-such-sprint%', `%ICPLC ${TAG} Sprint B%`, '%']) {
      await sql('update public.event_configs set sprint_pattern = $2 where id = $1', [ev.N, wrong])
      expect(await read('regN', 'N'), wrong).toEqual(['N central', 'N group pastor', 'N west']) // still attached to Sprint N
      expect(await read('regB', 'N'), wrong).toEqual([]) // Sprint B member gains nothing
      expect(await cmp('regB', 'N'), wrong).toEqual(DENIED)
    }
  })

  it('4. multi-team: membership is a set, order-independent, and never reads sprint_members.sprint_team_id', async (ctx) => {
    need(ctx)
    await mkSprint('M', `ICPLC ${TAG} Sprint M`)
    await mkEvent('M', `ICPLC ${TAG} M`, '%none%', sp.M)
    await mkTeam('a1', 'M', 'Finance'); await mkTeam('a2', 'M', 'Transportation'); await mkTeam('a3', 'M', 'Registration')
    await person('M', 'M person')
    // The legacy single-team pointer no longer exists in the real schema, so no decision can depend on it.
    expect((await sql("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='sprint_members' and column_name='sprint_team_id'")).rows[0].n).toBe(0)
    expect((await sql("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'icplc\\_%' and p.prosrc ilike '%sprint_team_id%'")).rows[0].n).toBe(0)
    await direct('M', 'x'); await direct('M', 'y')
    // X: A1 then A2 ;  Y: A3 then A2 then A1 (opposite order, ends with the same logic)
    await join('a1', 'x'); await join('a2', 'x')
    expect(await read('x', 'M')).toEqual(['M person']) // A2 (Transportation) reads
    expect(await write('x', 'M')).toBe(0) // neither A1 nor A2 may write
    await join('a3', 'x') // add A3 without replacing A1/A2
    expect(await write('x', 'M')).toBe(1)
    expect((await sql('select count(*)::int n from public.sprint_team_members where user_id = $1 and team_id = any($2)', [users.x, [tm.a1, tm.a2, tm.a3]])).rows[0].n).toBe(3)
    await leave('a2', 'x') // remove A2: A1/A3 remain
    expect(await write('x', 'M')).toBe(1)
    expect(await read('x', 'M')).toEqual(['M person'])
    await leave('a3', 'x') // only Finance left: team rules apply, no generic bypass
    expect(await read('x', 'M')).toEqual([])
    expect(await write('x', 'M')).toBe(0)
    await join('a3', 'x') // A1 + A3 again
    expect(await write('x', 'M')).toBe(1)

    await join('a3', 'y'); await join('a2', 'y'); await join('a1', 'y') // reverse insertion order
    expect(await read('y', 'M')).toEqual(['M person'])
    expect(await write('y', 'M')).toBe(1)
  })

  it('5. cross-event isolation: reads, writes, imports and both CMP functions', async (ctx) => {
    need(ctx)
    // User in Sprint A only (Registration)
    expect(await read('regA', 'A')).toEqual(ALL_A)
    expect(await read('regA', 'B')).toEqual([])
    expect(await write('regA', 'A')).toBe(3)
    expect(await write('regA', 'B')).toBe(0) // writer A cannot mutate event B
    expect(await importAllowed('regA', 'A')).toBe(true)
    expect(await importAllowed('regA', 'B')).toBe(false) // importer A cannot import into event B
    expect(await regImportAllowed('regA', 'B')).toBe(false)
    expect(await cmp('regA', 'A')).toEqual(ALLOWED)
    expect(await cmp('regA', 'B')).toEqual(DENIED) // CMP for B does not resolve through Sprint A
    expect(await cmp('regB', 'A')).toEqual(DENIED) // ...nor does CMP for A resolve through Sprint B
    // Same fixture, Sprint B direction
    expect(await read('regB', 'B')).toEqual(['B central', 'B west'])
    expect(await write('regB', 'B')).toBe(2)
    expect(await write('regB', 'A')).toBe(0)

    // User AB: Registration in Sprint A + read-only Transportation in Sprint B -> evaluated independently
    expect(await read('ab', 'A')).toEqual(ALL_A)
    expect(await write('ab', 'A')).toBe(3)
    expect(await read('ab', 'B')).toEqual(['B central', 'B west'])
    expect(await write('ab', 'B')).toBe(0) // A's Registration rights do not carry to B
    expect(await importAllowed('ab', 'A')).toBe(true)
    expect(await importAllowed('ab', 'B')).toBe(false)
    expect(await cmp('ab', 'A')).toEqual(ALLOWED)
    expect(await cmp('ab', 'B')).toEqual(DENIED)

    // Finance-only user in A (generic-membership bypass stays closed) and direct member
    expect(await read('finA', 'A')).toEqual([])
    expect(await read('directA', 'A')).toEqual(ALL_A)
    expect(await read('directA', 'B')).toEqual([])

    // Group Pastor A: own subgroup in A only; direct sprint member too, but GP scoping wins; nothing in B
    expect(await read('gpA', 'A')).toEqual(['A central', 'A group pastor'])
    expect(await read('gpA', 'B')).toEqual([])
    expect(await write('gpA', 'A')).toBe(0)
  })

  it('6. deleting a linked sprint nulls the link (real FK) and sprint-derived authorization fails closed at once', async (ctx) => {
    need(ctx)
    await mkSprint('D', `ICPLC ${TAG} Sprint D`)
    await mkEvent('D', `ICPLC ${TAG} D`, '%none%', sp.D)
    await mkTeam('dReg', 'D', 'Registration'); await join('dReg', 'delReg'); await person('D', 'D person')
    expect(await read('delReg', 'D')).toEqual(['D person'])
    expect(await write('delReg', 'D')).toBe(1)
    expect(await cmp('delReg', 'D')).toEqual(ALLOWED)

    await sql('delete from public.sprints where id = $1', [sp.D])
    const { data } = await admin.from('event_configs').select('sprint_id, sprint_pattern').eq('id', ev.D).single()
    expect(data.sprint_id).toBeNull()
    expect(await read('delReg', 'D')).toEqual([])
    expect(await write('delReg', 'D')).toBe(0)
    expect(await importAllowed('delReg', 'D')).toBe(false)
    expect(await cmp('delReg', 'D')).toEqual(DENIED)
    expect((await sql('select count(*)::int n from public.sprint_teams where id = $1', [tm.dReg])).rows[0].n).toBe(0) // no stale team
    expect((await sql('select count(*)::int n from public.sprint_team_members where team_id = $1', [tm.dReg])).rows[0].n).toBe(0)
    delete sp.D
  })

  it('7. cloning from a template never inherits a sprint link (event creation starts unlinked)', async (ctx) => {
    need(ctx)
    // The "event A" being cloned carries a configured sprint. Cloning goes through the real super_admin RPC.
    const tpl = id()
    await sql(`insert into public.event_configs (id, event_name, sprint_pattern, sprint_id, is_template, template_name, is_active, early_fee)
               values ($1,$2,$3,$4,true,$5,false,111)`, [tpl, `ICPLC ${TAG} template`, `%ICPLC ${TAG} template%`, sp.A, `${TAG} tpl`])
    ev.tpl = tpl
    const wasActive = (await sql('select id from public.event_configs where is_active')).rows.map((r) => r.id)
    const denied = await clients.regA.rpc('activate_event_from_template', { p_template_id: tpl, p_event_name: `ICPLC ${TAG} nope` })
    expect(denied.error).not.toBeNull() // super_admin only

    const { data: newId, error } = await clients.superAdmin.rpc('activate_event_from_template', { p_template_id: tpl, p_event_name: `ICPLC ${TAG} cloned` })
    expect(error).toBeNull()
    ev.cloned = newId
    const row = (await sql('select sprint_id, sprint_pattern, cloned_from_id, early_fee from public.event_configs where id = $1', [newId])).rows[0]
    expect(row.sprint_id).toBeNull() // starts unlinked even though the template/source is linked to Sprint A
    expect(row.sprint_pattern).toBe(`%ICPLC ${TAG} template%`) // pattern still copied (legacy/discovery)
    expect(row.cloned_from_id).toBe(tpl)
    expect(Number(row.early_fee)).toBe(111)
    // ...and it therefore grants no sprint-derived access to Sprint A's team until explicitly configured
    await sql('insert into public.icplc_participants (event_id, full_name) values ($1, $2)', [newId, 'cloned person'])
    const { data } = await clients.regA.from('icplc_participants').select('full_name').eq('event_id', newId)
    expect(data).toEqual([])
    // restore whichever event was active before the clone (activation deactivates it)
    await sql('update public.event_configs set is_active = false where id = $1', [newId])
    if (wasActive.length) await sql('update public.event_configs set is_active = true where id = any($1)', [wasActive])
  })
})
