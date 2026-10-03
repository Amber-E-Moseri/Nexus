/**
 * Generic sprint membership must not bypass an explicit restriction (F1, narrow).
 *
 * Authorization is evaluated over a person's WHOLE set of team memberships: zero, one or several teams in the same
 * sprint, in any order, changing over time. Nothing here assumes a final team structure or one team per person.
 * Database tests use the throwaway-database harness and skip without Postgres (ICPLC_REQUIRE_DB=1 makes that a failure).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIG, openThrowawayDb, PRE_F2 } from './helpers/rlsHarness.js'

const F2 = '20271004000001_icplc_event_scoped_authorization.sql'
const F1 = '20271004000003_icplc_generic_membership_no_bypass.sql'
const U = (n) => `a0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const EV = 'e0000000-0000-0000-0000-00000000000a'
const SP = '50000000-0000-0000-0000-00000000000a'
const T = { reg: '70000000-0000-0000-0000-000000000001', trans: '70000000-0000-0000-0000-000000000002', hosp: '70000000-0000-0000-0000-000000000003', fin: '70000000-0000-0000-0000-000000000004' }

// persona -> teams held in the SAME sprint (insertion order is deliberate; 15 and 16 are the same set in opposite order)
const TEAMS = {
  10: ['reg'],               // A  Registration only
  11: ['trans'],             // B  Transportation only
  12: ['reg', 'trans'],      // C  Registration + Transportation
  13: ['trans', 'hosp'],     // D  Transportation + Hospitality
  14: ['fin'],               // E  Finance only
  15: ['fin', 'reg'],        // F  Finance + another operational team
  16: ['reg', 'fin'],        // F' same set, reversed order
  17: ['fin', 'trans'],      // F'' Finance + a read-only operational team
  18: [],                    // H  no team, direct sprint member
}
const SEED = `
insert into public.departments values ('d0000000-0000-0000-0000-000000000002','Media',false);
insert into public.users values ('${U(1)}','super_admin',null)${Object.keys(TEAMS).map((n) => `,('${U(n)}','member','d0000000-0000-0000-0000-000000000002')`).join('')};
insert into public.event_configs values ('${EV}','ICPLC 26','%ICPLC 26%');
insert into public.sprints values ('${SP}','ICPLC 26 Sprint');
insert into public.sprint_teams values ('${T.reg}','${SP}','Registration'),('${T.trans}','${SP}','Transportation'),('${T.hosp}','${SP}','Hospitality'),('${T.fin}','${SP}','Finance');
${Object.entries(TEAMS).flatMap(([n, teams]) => teams.map((t) => `insert into public.sprint_team_members values ('${T[t]}','${U(n)}');`)).join('\n')}
-- everyone on the sprint is ALSO a sprint_members row, which is how people are normally added to a sprint
${Object.keys(TEAMS).map((n) => `insert into public.sprint_members values ('${SP}','${U(n)}','member');`).join('\n')}
insert into public.icplc_participants (event_id, full_name, subgroup, passport_country) values
  ('${EV}','One','BLW Central Subgroup A','Nigeria'),('${EV}','Two','BLW West Subgroup B','Ghana'),('${EV}','Three','BLW Central Subgroup B','Nigeria');
`

let H
beforeAll(async () => { H = await openThrowawayDb({ migrations: [...PRE_F2, F2], seed: SEED }) }, 60_000)
afterAll(async () => { if (H) await H.close() })

const reads = (uid) => H.asUser(uid, async (q) => (await q('select 1 from public.icplc_participants')).rowCount)
const writes = (uid) => H.asUser(uid, async (q) => (await q('update public.icplc_participants set participation_status = participation_status returning id')).rowCount)
const setTeams = async (n, teams) => {
  await H.db.query('delete from public.sprint_team_members where user_id = $1', [U(n)])
  for (const t of teams) await H.db.query('insert into public.sprint_team_members values ($1, $2)', [T[t], U(n)])
}

describe('F1 migration (static)', () => {
  it('uses membership existence only: no team is named and no single-team assumption is made', () => {
    const sql = MIG(F1).replace(/--[^\n]*/g, '').replace(/'[^']*'/g, "''")
    expect(sql).not.toMatch(/finance|transportation|accommodation|hospitality|registration/i)
    expect(sql).not.toMatch(/sprint_team_id|limit\s+1|order\s+by|primary/i)
    expect(sql).toMatch(/not public\.icplc_has_event_team_membership\(event_id\)/)
  })
})

describe('generic membership vs explicit restriction (database)', () => {
  it('CONTROL: before this fix a Finance-only person who is also a sprint member reads everyone (the bypass)', async (ctx) => {
    H.need(ctx)
    expect(await reads(U(14))).toBe(3)
    expect(await reads(U(10))).toBe(3)
  })

  describe('after the fix', () => {
    beforeAll(async () => { if (H.available) await H.db.query(MIG(F1)) })

    it('read access is the union over the whole team set', async (ctx) => {
      H.need(ctx)
      const expected = { 10: 3, 11: 3, 12: 3, 13: 3, 14: 0, 15: 3, 16: 3, 17: 3, 18: 3 }
      for (const [n, rows] of Object.entries(expected)) expect(await reads(U(n)), `persona ${n} (${TEAMS[n].join('+') || 'no team'})`).toBe(rows)
    })

    it('write access is unchanged by this fix (generic arm is read-only)', async (ctx) => {
      H.need(ctx)
      const expected = { 10: 3, 11: 0, 12: 3, 13: 0, 14: 0, 15: 3, 16: 3, 17: 0, 18: 0 }
      for (const [n, rows] of Object.entries(expected)) expect(await writes(U(n)), `persona ${n}`).toBe(rows)
    })

    it('membership order is never significant (Finance+Registration == Registration+Finance)', async (ctx) => {
      H.need(ctx)
      expect(await reads(U(15))).toBe(await reads(U(16)))
      expect(await writes(U(15))).toBe(await writes(U(16)))
    })

    it('a higher-level administrative role with no team keeps full access', async (ctx) => {
      H.need(ctx)
      expect(await reads(U(1))).toBe(3)
    })

    it('zero teams keeps the generic contributor access', async (ctx) => {
      H.need(ctx)
      expect(await reads(U(18))).toBe(3)
    })

    it('follows membership changes immediately, in either direction', async (ctx) => {
      H.need(ctx)
      await setTeams(18, [])                    // no team: generic contributor
      expect(await reads(U(18))).toBe(3)
      await setTeams(18, ['fin'])               // assigned to Finance only: team rule now governs
      expect(await reads(U(18))).toBe(0)
      await setTeams(18, ['fin', 'reg'])        // Finance + Registration: regains what Registration grants
      expect(await reads(U(18))).toBe(3)
      await setTeams(18, ['reg'])
      expect(await reads(U(18))).toBe(3)
      await setTeams(18, [])                    // back to zero teams
      expect(await reads(U(18))).toBe(3)
      await setTeams(18, ['fin'])
      await H.db.query('delete from public.sprint_team_members where user_id = $1', [U(18)]) // team membership removed
      expect(await reads(U(18))).toBe(3)
    })
  })
})
