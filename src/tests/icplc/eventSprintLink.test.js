/**
 * event_configs.sprint_id: explicit event -> sprint link (migration 20271004000004).
 *
 * Authorization must derive the sprint from the event's explicit relationship, never from sprint_pattern. The database
 * tests run the repo's real F2 + F1 + sprint_id migration SQL in a throwaway database (skipped without Postgres).
 * No teams or people from production are involved; every fixture is synthetic.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MIG, openThrowawayDb, PRE_F2 } from './helpers/rlsHarness.js'

const F2 = '20271004000001_icplc_event_scoped_authorization.sql'
const F1 = '20271004000003_icplc_generic_membership_no_bypass.sql'
const LINK = '20271004000004_event_configs_explicit_sprint_id.sql'
const code = (sql) => sql.replace(/--[^\n]*/g, '').replace(/'[^']*'/g, "''")

describe('sprint_id migration (static)', () => {
  const sql = code(MIG(LINK))
  it('adds a nullable FK to sprints that fails closed on delete, and a one-event-per-sprint index', () => {
    expect(sql).toMatch(/add column if not exists sprint_id uuid references public\.sprints\(id\) on delete set null/i)
    expect(sql).not.toMatch(/sprint_id uuid[^,;]*not null/i)
    expect(sql).toMatch(/create unique index[^;]*\(sprint_id\)\s*where sprint_id is not null/i)
  })
  it('resolution no longer references sprint_pattern or name matching', () => {
    const fn = sql.slice(sql.search(/create or replace function public\.icplc_event_sprint_ids/i))
    expect(fn).not.toMatch(/sprint_pattern|\bilike\b[^;]*s\.name|s\.name/i)
    expect(fn).toMatch(/s\.id\s*=\s*ec\.sprint_id/i)
  })
  it('does not backfill, create teams or touch memberships', () => {
    expect(sql).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from)\b/i)
  })
  it('edge functions authorize from sprint_id and keep no pattern matching', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of ['cmp-flight-sync', 'cmp-documentation-sync']) {
      const ts = readFileSync(`supabase/functions/${f}/index.ts`, 'utf8').replace(/\/\/[^\n]*/g, '')
      expect(ts, f).not.toMatch(/sprint_pattern/)
      expect(ts, f).toMatch(/sprint_teams\?\.sprint_id === eventConfig\.sprint_id/)
    }
  })
})

const U = (n) => `a0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const T = (n) => `70000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const EV_A = 'e0000000-0000-0000-0000-00000000000a' // ICPLC 26 -> Sprint A
const EV_B = 'e0000000-0000-0000-0000-00000000000b' // ICPLC 27 -> Sprint B
const EV_N = 'e0000000-0000-0000-0000-0000000000c1' // ICPLC 28, sprint_id NULL, pattern matches Sprint A
const SP_A = '50000000-0000-0000-0000-00000000000a'
const SP_B = '50000000-0000-0000-0000-00000000000b'
const SP_A2 = '50000000-0000-0000-0000-0000000000a2' // lookalike of Sprint A

// Deliberately overlapping names/patterns: every event's pattern matches BOTH ICPLC 26 sprints.
const SEED = `
insert into public.departments values ('d0000000-0000-0000-0000-000000000002','Media',false);
insert into public.users select u, 'member', 'd0000000-0000-0000-0000-000000000002' from (values
  ('${U(1)}'::uuid),('${U(2)}'),('${U(3)}'),('${U(4)}'),('${U(5)}'),('${U(6)}')) v(u);
insert into public.event_configs (id, event_name, sprint_pattern) values
  ('${EV_A}','ICPLC 26','%ICPLC%'),('${EV_B}','ICPLC 27','%ICPLC%'),('${EV_N}','ICPLC 28','%ICPLC 26%');
insert into public.sprints values ('${SP_A}','ICPLC 26 Sprint'),('${SP_A2}','ICPLC 26 Sprint (copy)'),('${SP_B}','ICPLC 27 Sprint');
insert into public.sprint_teams values
  ('${T(1)}','${SP_A}','Registration'),('${T(2)}','${SP_A}','Transportation'),('${T(3)}','${SP_A2}','Registration'),('${T(4)}','${SP_B}','Registration');
-- 1 Sprint A Registration only | 2 Sprint A Registration+Transportation | 3 Sprint A and Sprint B | 4 Sprint B only
-- 5 lookalike sprint A2 only   | 6 direct member of Sprint A, no team
insert into public.sprint_team_members values
  ('${T(1)}','${U(1)}'),('${T(1)}','${U(2)}'),('${T(2)}','${U(2)}'),('${T(1)}','${U(3)}'),('${T(4)}','${U(3)}'),('${T(4)}','${U(4)}'),('${T(3)}','${U(5)}');
insert into public.sprint_members values ('${SP_A}','${U(6)}','member');
insert into public.icplc_participants (event_id, full_name, subgroup) values
  ('${EV_A}','A person','BLW Central Subgroup A'),('${EV_B}','B person','BLW Central Subgroup A'),('${EV_N}','N person','BLW Central Subgroup A');
`

let H
beforeAll(async () => { H = await openThrowawayDb({ migrations: [...PRE_F2, F2, F1], seed: SEED }) }, 60_000)
afterAll(async () => { if (H) await H.close() })

const sprintsOf = (ev) => H.db.query('select public.icplc_event_sprint_ids($1) as s', [ev]).then((r) => r.rows.map((x) => x.s).sort())
const seen = (uid) => H.asUser(uid, async (q) => (await q('select full_name from public.icplc_participants order by 1')).rows.map((r) => r.full_name))
const can = (uid, fn, ev) => H.asUser(uid, async (q) => (await q(`select public.${fn}($1) as v`, [ev])).rows[0].v)
const link = (ev, sp) => H.db.query('update public.event_configs set sprint_id = $2 where id = $1', [ev, sp])

describe('explicit event -> sprint authorization (database)', () => {
  it('CONTROL: without sprint_id the F2 helper resolves by overlapping pattern (cross-event bleed)', async (ctx) => {
    H.need(ctx)
    expect((await sprintsOf(EV_A)).length).toBe(3) // %ICPLC% matches every sprint
    expect(await seen(U(4))).toContain('A person') // a Sprint-B-only member reads event A
  })

  describe('after the migration', () => {
    beforeAll(async () => { if (H.available) { await H.db.query(MIG(LINK)); await link(EV_A, SP_A); await link(EV_B, SP_B) } })

    it('null sprint_id fails closed: no sprint, no team access, no direct-member access', async (ctx) => {
      H.need(ctx)
      expect(await sprintsOf(EV_N)).toEqual([])
      expect(await can(U(1), 'icplc_can_read_participants', EV_N)).toBe(false)
      expect(await can(U(6), 'icplc_is_sprint_member', EV_N)).toBe(false)
      expect(await seen(U(1))).not.toContain('N person')
    })

    it('Event A -> Sprint A, Event B -> Sprint B: each resolves to exactly its own sprint', async (ctx) => {
      H.need(ctx)
      expect(await sprintsOf(EV_A)).toEqual([SP_A])
      expect(await sprintsOf(EV_B)).toEqual([SP_B])
    })

    it('member of Sprint A only: event A allowed, event B denied', async (ctx) => {
      H.need(ctx)
      expect(await seen(U(1))).toEqual(['A person'])
      expect(await can(U(1), 'icplc_can_read_participants', EV_B)).toBe(false)
      expect(await can(U(1), 'icplc_can_write_participants', EV_B)).toBe(false)
    })

    it('teams A1 + A2 of one sprint: both memberships recognised (a set, no primary team)', async (ctx) => {
      H.need(ctx)
      expect(await can(U(2), 'icplc_can_write_participants', EV_A)).toBe(true) // via Registration even though Transportation is excluded
      expect(await can(U(2), 'icplc_has_event_team_membership', EV_A)).toBe(true)
      expect(await seen(U(2))).toEqual(['A person'])
    })

    it('member of Sprint A and Sprint B: each event evaluates only its own sprint', async (ctx) => {
      H.need(ctx)
      expect(await seen(U(3))).toEqual(['A person', 'B person'])
      await H.db.query('delete from public.sprint_team_members where user_id = $1 and team_id = $2', [U(3), T(4)])
      expect(await seen(U(3))).toEqual(['A person']) // dropping the Sprint B team removes event B only
      await H.db.query('insert into public.sprint_team_members values ($1,$2)', [T(4), U(3)])
    })

    it('two events with similar names / overlapping patterns: no accidental cross-access', async (ctx) => {
      H.need(ctx)
      expect(await seen(U(4))).toEqual(['B person'])
      expect(await can(U(4), 'icplc_can_read_participants', EV_A)).toBe(false)
    })

    it('two sprints with similar names: a lookalike sprint grants nothing', async (ctx) => {
      H.need(ctx)
      expect(await seen(U(5))).toEqual([])
      expect(await can(U(5), 'icplc_can_read_participants', EV_A)).toBe(false)
    })

    it('direct sprint member (no team) is still recognised for their own event only', async (ctx) => {
      H.need(ctx)
      expect(await can(U(6), 'icplc_is_sprint_member', EV_A)).toBe(true)
      expect(await can(U(6), 'icplc_is_sprint_member', EV_B)).toBe(false)
    })

    it('changing sprint_pattern does not redirect authorization when sprint_id is set', async (ctx) => {
      H.need(ctx)
      await H.db.query("update public.event_configs set sprint_pattern = '%ICPLC 27%' where id = $1", [EV_A])
      expect(await sprintsOf(EV_A)).toEqual([SP_A])
      expect(await seen(U(4))).toEqual(['B person']) // Sprint-B member still cannot see event A
      await H.db.query("update public.event_configs set sprint_pattern = '%ICPLC%' where id = $1", [EV_A])
    })

    it('a sprint cannot back two events; deleting a sprint unlinks (fails closed)', async (ctx) => {
      H.need(ctx)
      await expect(link(EV_N, SP_A)).rejects.toThrow(/event_configs_sprint_id_key/)
      await H.db.query('delete from public.sprints where id = $1', [SP_A2])
      await link(EV_N, SP_A2).catch(() => {}) // nonexistent sprint rejected by FK
      expect(await sprintsOf(EV_N)).toEqual([])
    })

    it('platform roles stay event-independent', async (ctx) => {
      H.need(ctx)
      await H.db.query("update public.users set role = 'super_admin' where id = $1", [U(5)])
      expect(await can(U(5), 'icplc_can_read_participants', EV_N)).toBe(true)
      await H.db.query("update public.users set role = 'member' where id = $1", [U(5)])
    })
  })
})
