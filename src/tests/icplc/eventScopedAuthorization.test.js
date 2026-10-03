/**
 * ICPLC event-scoped authorization (F2).
 *
 * A participant authorization decision must be made for the ROW'S OWN event. Membership in event A must never
 * authorize anything on event B. Membership is a SET: a person may be on many teams of the same sprint (or none), so
 * outcomes may never depend on team order or assume one team per person.
 *
 * Database tests use the throwaway-database harness (helpers/rlsHarness.js) and are skipped when no Postgres is
 * reachable (ICPLC_REQUIRE_DB=1 turns a skip into a failure). Static tests always run.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MIG, openThrowawayDb } from './helpers/rlsHarness.js'

const F2 = '20271004000001_icplc_event_scoped_authorization.sql'
const code = (sql) => sql.replace(/--[^\n]*/g, '').replace(/'[^']*'/g, "''") // match SQL calls, not comments or message text

// ── Static guarantees (no database) ───────────────────────────────────────────────────────────────────────────
describe('F2 migration (static)', () => {
  const sql = code(MIG(F2))

  it('re-issues every SECURITY DEFINER RPC that gated on an event-agnostic helper, with the event named in the guard', () => {
    const fns = {
      icplc_apply_registration_csv_batch: 'icplc_can_write_participants(p_event_id)',
      icplc_apply_registration_csv_row: 'icplc_can_write_participants(p_event_id)',
      icplc_parse_registration_csv: 'icplc_can_write_participants(p_event_id)',
      icplc_apply_registration_import: 'icplc_can_write_participants((select b.event_id',
      icplc_match_import_rows: 'icplc_can_write_participants((select b.event_id',
      icplc_preview_registration_import: 'icplc_can_write_participants((select b.event_id',
      icplc_apply_import_row: 'icplc_can_import((select b.event_id',
      icplc_preview_import: 'icplc_can_import((select b.event_id',
    }
    for (const [name, guard] of Object.entries(fns)) {
      const start = sql.search(new RegExp(`create or replace function public\\.${name}\\s*\\(`, 'i'))
      expect(start, `${name} is re-issued`).toBeGreaterThan(-1)
      const next = sql.slice(start + 10).search(/create or replace function public\./i)
      const body = sql.slice(start, next === -1 ? undefined : start + 10 + next)
      expect(body, `${name} names the event in its guard`).toContain(guard)
      expect(body, `${name} has no event-agnostic guard left`).not.toMatch(/icplc_can_(write_participants|import)\(\)/)
    }
  })

  it('no policy decides a participant row with an event-agnostic helper (only org-wide default tags may)', () => {
    const policies = sql.split(/create policy/i).slice(1).map((chunk) => chunk.slice(0, chunk.indexOf(';')))
    for (const p of policies) {
      const name = p.trim().split(/\s+/)[0]
      const agnostic = /icplc_(can_read_participants|can_write_participants|can_import|is_sprint_member)\(\)/.test(p)
      if (name === 'icplc_tags_read') expect(p).toMatch(/event_id is null and public\.icplc_can_read_participants\(\)/)
      else expect(agnostic, `${name} must be event-scoped`).toBe(false)
    }
  })

  it('evaluates membership as a set: no single-team assumption anywhere in the new helpers', () => {
    const helpers = sql.slice(0, sql.search(/drop policy if exists/i))
    expect(helpers).not.toMatch(/sprint_team_id/i) // legacy single-team pointer on sprint_members
    expect(helpers).not.toMatch(/limit\s+1|row_number|order\s+by|primary\s+team/i) // no "pick one team"
    expect(helpers).toMatch(/exists\s*\(/i)
  })
})

// ── Database behaviour ────────────────────────────────────────────────────────────────────────────────────────
const U = (n) => `a0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const EV_A = 'e0000000-0000-0000-0000-00000000000a'
const EV_B = 'e0000000-0000-0000-0000-00000000000b'
const SP_A = '50000000-0000-0000-0000-00000000000a'
const SP_B = '50000000-0000-0000-0000-00000000000b'
const T = (n) => `70000000-0000-0000-0000-${String(n).padStart(12, '0')}`

const SEED = `
insert into public.departments values ('d0000000-0000-0000-0000-000000000001','Programs',true),('d0000000-0000-0000-0000-000000000002','Media',false);
insert into public.users values
  ('${U(1)}','super_admin',null),
  ('${U(2)}','member','d0000000-0000-0000-0000-000000000001'),
  ('${U(10)}','member','d0000000-0000-0000-0000-000000000002'),('${U(11)}','member','d0000000-0000-0000-0000-000000000002'),
  ('${U(12)}','member','d0000000-0000-0000-0000-000000000002'),('${U(13)}','member','d0000000-0000-0000-0000-000000000002'),
  ('${U(14)}','member','d0000000-0000-0000-0000-000000000002'),('${U(15)}','member','d0000000-0000-0000-0000-000000000002'),
  ('${U(16)}','member','d0000000-0000-0000-0000-000000000002'),('${U(17)}','member','d0000000-0000-0000-0000-000000000002'),
  ('${U(20)}','member','d0000000-0000-0000-0000-000000000002'),('${U(21)}','member','d0000000-0000-0000-0000-000000000002'),
  ('${U(22)}','member','d0000000-0000-0000-0000-000000000002');
insert into public.event_configs values ('${EV_A}','ICPLC 26','%ICPLC 26%'),('${EV_B}','ICPLC 27','%ICPLC 27%');
insert into public.sprints values ('${SP_A}','ICPLC 26 Sprint'),('${SP_B}','ICPLC 27 Sprint');
-- teams: A has Registration, Transportation, Hospitality, Finance; B has Registration
insert into public.sprint_teams values
  ('${T(1)}','${SP_A}','Registration'),('${T(2)}','${SP_A}','Transportation'),('${T(3)}','${SP_A}','Hospitality'),('${T(4)}','${SP_A}','Finance'),('${T(9)}','${SP_B}','Registration');
-- 10 Registration only | 11 Transportation only | 12 Registration+Transportation | 13 Transportation+Hospitality
-- 14 Finance only | 15 Finance+Registration | 16 Registration+Finance (reverse insertion order of 15) | 17 Registration in EVENT B only
insert into public.sprint_team_members values
  ('${T(1)}','${U(10)}'),('${T(2)}','${U(11)}'),('${T(1)}','${U(12)}'),('${T(2)}','${U(12)}'),('${T(2)}','${U(13)}'),('${T(3)}','${U(13)}'),
  ('${T(4)}','${U(14)}'),('${T(4)}','${U(15)}'),('${T(1)}','${U(15)}'),('${T(1)}','${U(16)}'),('${T(4)}','${U(16)}'),('${T(9)}','${U(17)}');
-- 20 direct sprint member of A (no team) | 21 group pastor of A | 22 outsider
insert into public.sprint_members values ('${SP_A}','${U(20)}','member'),('${SP_A}','${U(21)}','member');
insert into public.icplc_participants (event_id, full_name, subgroup, leadership, nexus_user_id, passport_country) values
  ('${EV_A}','A Central','BLW Central Subgroup A',null,null,'Nigeria'),
  ('${EV_A}','A West','BLW West Subgroup B',null,null,'Ghana'),
  ('${EV_A}','A Group Pastor','BLW Central Subgroup A','Group Pastor','${U(21)}','Nigeria'),
  ('${EV_B}','B Central','BLW Central Subgroup A',null,null,'Nigeria'),
  ('${EV_B}','B West','BLW West Subgroup B',null,null,'Ghana');
insert into public.icplc_tags (event_id, name) values ('${EV_A}','A tag'),('${EV_B}','B tag'),(null,'org tag');
insert into public.icplc_identity_maps (event_id, participant_id, source_type, source_key) select event_id, id, 'csv', full_name from public.icplc_participants where leadership is null;
insert into public.icplc_import_batches (id, event_id) values ('b0000000-0000-0000-0000-00000000000a','${EV_A}'),('b0000000-0000-0000-0000-00000000000b','${EV_B}');
insert into public.icplc_import_rows (batch_id) values ('b0000000-0000-0000-0000-00000000000a'),('b0000000-0000-0000-0000-00000000000b');
insert into public.icplc_participant_tags select id, (select id from public.icplc_tags where name = 'A tag') from public.icplc_participants where event_id = '${EV_A}' and leadership is null;
insert into public.icplc_participant_tags select id, (select id from public.icplc_tags where name = 'B tag') from public.icplc_participants where event_id = '${EV_B}';
insert into public.communication_email_templates (event_config_id) values ('${EV_A}'),('${EV_B}'),(null);
`


let H
beforeAll(async () => { H = await openThrowawayDb({ seed: SEED }) }, 60_000)
afterAll(async () => { if (H) await H.close() })

const names = async (uid, table = 'icplc_participants', col = 'full_name') =>
  H.asUser(uid, async (q) => (await q(`select ${col} as v from public.${table} order by 1`)).rows.map((r) => r.v))
const updated = (uid, ev) => H.asUser(uid, async (q) => (await q('update public.icplc_participants set participation_status = participation_status where event_id = $1 returning id', [ev])).rowCount)

describe('F2 cross-event isolation (database)', () => {
  it('CONTROL: before the migration, membership in event B authorizes reads and writes of event A (the defect)', async (ctx) => {
    H.need(ctx)
    expect((await names(U(17))).filter((n) => n.startsWith('A '))).not.toEqual([]) // event-B-only member reads event A rows
    expect(await updated(U(17), EV_A)).toBeGreaterThan(0) // ...and writes them
  })

  describe('after the migration', () => {
    beforeAll(async () => { if (H.available) await H.db.query(MIG(F2)) })

    it('read: each member sees only their own event', async (ctx) => {
      H.need(ctx)
      expect(await names(U(10))).toEqual(['A Central', 'A Group Pastor', 'A West'])
      expect(await names(U(17))).toEqual(['B Central', 'B West'])
    })

    it('write: Registration of A updates A and cannot touch B', async (ctx) => {
      H.need(ctx)
      expect(await updated(U(10), EV_A)).toBe(3)
      expect(await updated(U(10), EV_B)).toBe(0)
      expect(await updated(U(17), EV_A)).toBe(0)
      expect(await updated(U(17), EV_B)).toBe(2)
    })

    it('multi-team: access is the union over the whole membership set', async (ctx) => {
      H.need(ctx)
      expect(await updated(U(11), EV_A)).toBe(0) // Transportation only: read-only
      expect(await updated(U(12), EV_A)).toBe(3) // Registration + Transportation: Registration grants write
      expect(await updated(U(13), EV_A)).toBe(0) // Transportation + Hospitality: neither grants write
      expect((await names(U(13))).length).toBe(3) // ...but both grant read
      expect(await updated(U(15), EV_A)).toBe(3) // Finance + Registration keeps what Registration grants
      expect((await names(U(14))).filter((n) => n.startsWith('A '))).toEqual([]) // Finance only (team-only): none
    })

    it('membership order is never significant', async (ctx) => {
      H.need(ctx)
      expect(await names(U(15))).toEqual(await names(U(16)))
      expect(await updated(U(15), EV_A)).toBe(await updated(U(16), EV_A))
    })

    it('no team assignment is also supported: a direct sprint member reads their event only', async (ctx) => {
      H.need(ctx)
      expect(await names(U(20))).toEqual(['A Central', 'A Group Pastor', 'A West'])
      expect(await updated(U(20), EV_A)).toBe(0)
    })

    it('group pastor stays confined to own subgroup AND own event', async (ctx) => {
      H.need(ctx)
      expect(await names(U(21))).toEqual(['A Central', 'A Group Pastor'])
      expect(await updated(U(21), EV_A)).toBe(0)
    })

    it('outsider and anonymous see nothing', async (ctx) => {
      H.need(ctx)
      expect(await names(U(22))).toEqual([])
      expect(await H.asUser(null, async (q) => (await q('select 1 from public.icplc_participants')).rowCount, 'anon')).toBe(0)
    })

    it('platform roles are intentionally event-independent (super_admin, Programs department)', async (ctx) => {
      H.need(ctx)
      expect((await names(U(1))).length).toBe(5)
      expect((await names(U(2))).length).toBe(5)
    })

    it('dependent tables follow the same event boundary', async (ctx) => {
      H.need(ctx)
      expect(await names(U(10), 'icplc_identity_maps', 'source_key')).toEqual(['A Central', 'A West'])
      expect(await names(U(17), 'icplc_identity_maps', 'source_key')).toEqual(['B Central', 'B West'])
      expect(await names(U(10), 'icplc_tags', 'name')).toEqual(['A tag', 'org tag']) // org-wide default tag stays visible
      expect((await H.asUser(U(10), async (q) => (await q('select batch_id from public.icplc_import_rows')).rows)).map((r) => r.batch_id)).toEqual(['b0000000-0000-0000-0000-00000000000a'])
      expect((await H.asUser(U(10), async (q) => (await q('select event_id from public.icplc_import_batches')).rows)).map((r) => r.event_id)).toEqual([EV_A])
      expect((await H.asUser(U(10), async (q) => (await q('select event_config_id from public.communication_email_templates')).rows)).map((r) => r.event_config_id).sort()).toEqual([null, EV_A].sort())
      expect((await H.asUser(U(10), async (q) => (await q('select tag_id from public.icplc_participant_tags')).rowCount))).toBe(2)
    })

    it('the event-scoped helpers fail closed', async (ctx) => {
      H.need(ctx)
      const one = (q, sql, p) => q(sql, p).then((r) => r.rows[0].v)
      expect(await H.asUser(U(10), (q) => one(q, 'select public.icplc_can_read_participants(null::uuid) as v'))).toBe(false)
      expect(await H.asUser(U(10), (q) => one(q, "select public.icplc_can_write_participants('00000000-0000-0000-0000-000000000000') as v"))).toBe(false)
      expect(await H.asUser(U(10), (q) => one(q, 'select public.icplc_can_import($1) as v', [EV_B]))).toBe(false)
      expect(await H.asUser(U(10), (q) => one(q, 'select public.icplc_can_import($1) as v', [EV_A]))).toBe(true)
    })
  })
})
