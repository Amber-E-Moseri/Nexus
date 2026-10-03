/**
 * override_fields must change atomically (F3).
 *
 * Staff corrections are protected from re-imports by participant.override_fields. Changing it as read -> merge in the
 * browser -> write the whole object let a stale copy erase another staff member's overrides (and "clear one" with no
 * cached profile wrote {}, un-protecting every field of that person). Overrides are now changed key by key in one
 * server-side UPDATE.
 *
 * @vitest-environment jsdom
 */
import React from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MIG, openThrowawayDb, PRE_F2 } from './helpers/rlsHarness.js'

// ── Hook behaviour (mocked client; always runs) ───────────────────────────────────────────────────────────────
const calls = vi.hoisted(() => ({ log: [], updateError: null }))
vi.mock('../../lib/supabase', () => {
  const row = { id: 'p1', event_id: 'e1' }
  const builder = (kind, payload) => {
    const b = {
      eq: () => b,
      select: () => b,
      single: async () => ({ data: kind === 'update' && calls.updateError ? null : row, error: kind === 'update' ? calls.updateError : null }),
    }
    calls.log.push({ type: kind, payload })
    return b
  }
  return {
    supabase: {
      from: () => ({ update: (payload) => builder('update', payload), select: () => builder('select') }),
      rpc: async (name, args) => { calls.log.push({ type: 'rpc', name, args }); return { data: {}, error: null } },
    },
  }
})
import { useClearFieldOverride, useUpdateProfile } from '../../features/icplc/hooks/useICPLCProfile.js'
import { TRAVEL_FIELDS, useTravelLock } from '../../features/icplc/hooks/useTravelLock.js'

const wrap = () => { const qc = new QueryClient(); return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> }
const rpcs = () => calls.log.filter((c) => c.type === 'rpc')
const reset = () => { calls.log.length = 0; calls.updateError = null }

describe('hooks never write override_fields as a whole object', () => {
  it('clearing one override sends only that key to the server and never updates the row', async () => {
    reset()
    const { result } = renderHook(() => useClearFieldOverride(), { wrapper: wrap() })
    await act(async () => { await result.current.mutateAsync({ id: 'p1', field: 'passport_readiness' }) })
    expect(rpcs()).toEqual([{ type: 'rpc', name: 'icplc_apply_override_changes', args: { p_participant_id: 'p1', p_set_fields: [], p_clear_fields: ['passport_readiness'] } }])
    expect(calls.log.some((c) => c.type === 'update')).toBe(false)
  })

  it('travel lock / unlock send only the six itinerary keys', async () => {
    reset()
    const { result } = renderHook(() => useTravelLock(), { wrapper: wrap() })
    await act(async () => { await result.current.mutateAsync({ participant: { id: 'p1', event_id: 'e1', override_fields: { stale: true } }, lock: true }) })
    await act(async () => { await result.current.mutateAsync({ participant: { id: 'p1', event_id: 'e1' }, lock: false }) })
    expect(rpcs().map((c) => [c.args.p_set_fields, c.args.p_clear_fields])).toEqual([[TRAVEL_FIELDS, []], [[], TRAVEL_FIELDS]])
    expect(calls.log.some((c) => c.type === 'update')).toBe(false)
  })

  it('profile update records protection BEFORE the value changes and strips any client override_fields', async () => {
    reset()
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrap() })
    await act(async () => {
      await result.current.mutateAsync({ id: 'p1', fields: { passport_country: 'Ghana', override_fields: { everything: 'stale' } }, setOverride: true, overrideField: 'passport_country', userId: 'u1' })
    })
    expect(calls.log.map((c) => c.type)).toEqual(['rpc', 'update']) // protection first, then the value
    const update = calls.log.find((c) => c.type === 'update')
    expect(update.payload).toEqual({ passport_country: 'Ghana' })
    expect(rpcs()[0].args).toEqual({ p_participant_id: 'p1', p_set_fields: ['passport_country'], p_clear_fields: [] })
  })

  it('Make Primary swaps override keys only AFTER the new values are stored, and not at all if storing fails', async () => {
    reset()
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrap() })
    await act(async () => { await result.current.mutateAsync({ id: 'p1', fields: { email: 'b@x.test', alternate_email: 'a@x.test', override_fields: {} }, swapOverrideKeys: ['email', 'alternate_email'] }) })
    expect(calls.log.map((c) => c.type)).toEqual(['update', 'rpc'])
    expect(rpcs()[0]).toMatchObject({ name: 'icplc_swap_override_keys', args: { p_participant_id: 'p1', p_key_a: 'email', p_key_b: 'alternate_email' } })

    reset(); calls.updateError = { code: '23505', message: 'email claimed' }
    await act(async () => { await expect(result.current.mutateAsync({ id: 'p1', fields: { email: 'b@x.test' }, swapOverrideKeys: ['email', 'alternate_email'] })).rejects.toBeTruthy() })
    expect(rpcs()).toEqual([]) // no swap for a value that did not change
  })

  it('no ICPLC source file sends override_fields to an update() call', () => {
    const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
    const files = walk(resolve(process.cwd(), 'src/features/icplc')).filter((f) => /\.(js|jsx)$/.test(f))
    const offenders = files.filter((f) => /\.update\(\s*\{[^}]*override_fields/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})

// ── Database behaviour ────────────────────────────────────────────────────────────────────────────────────────
const U = (n) => `a0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const EV_A = 'e0000000-0000-0000-0000-00000000000a'
const EV_B = 'e0000000-0000-0000-0000-00000000000b'
const SP_A = '50000000-0000-0000-0000-00000000000a'
const SP_B = '50000000-0000-0000-0000-00000000000b'
const P1 = 'c0000000-0000-0000-0000-000000000001'
const T = (n) => `70000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const STAFF = U(10)   // Registration team of event A
const OUTSIDER = U(22)
const GP = U(21)      // Group Pastor of event A
const OTHER = U(17)   // Registration team of event B

const SEED = `
insert into public.departments values ('d0000000-0000-0000-0000-000000000002','Media',false);
insert into public.users select u, 'member', 'd0000000-0000-0000-0000-000000000002' from (values ('${STAFF}'::uuid),('${OUTSIDER}'),('${GP}'),('${OTHER}')) v(u);
insert into public.event_configs values ('${EV_A}','ICPLC 26','%ICPLC 26%'),('${EV_B}','ICPLC 27','%ICPLC 27%');
insert into public.sprints values ('${SP_A}','ICPLC 26 Sprint'),('${SP_B}','ICPLC 27 Sprint');
insert into public.sprint_teams values ('${T(1)}','${SP_A}','Registration'),('${T(9)}','${SP_B}','Registration');
insert into public.sprint_team_members values ('${T(1)}','${STAFF}'),('${T(9)}','${OTHER}');
insert into public.sprint_members values ('${SP_A}','${GP}','member');
insert into public.icplc_participants (id, event_id, full_name, email, subgroup, leadership, nexus_user_id, override_fields) values
  ('${P1}','${EV_A}','Person One','one@x.test','BLW Central Subgroup A',null,null,'{"a":{"overridden":true},"b":{"overridden":true},"c":{"overridden":true}}'),
  ('c0000000-0000-0000-0000-000000000002','${EV_A}','Pastor','gp@x.test','BLW Central Subgroup A','Group Pastor','${GP}','{}');
`

let H
beforeAll(async () => {
  H = await openThrowawayDb({ migrations: [...PRE_F2, '20271004000001_icplc_event_scoped_authorization.sql', '20271004000002_icplc_atomic_override_fields.sql'], seed: SEED })
}, 60_000)
afterAll(async () => { if (H) await H.close() })

const asStaff = (fn, uid = STAFF) => H.asUser(uid, fn)
const keys = async () => Object.keys((await H.db.query('select override_fields from public.icplc_participants where id = $1', [P1])).rows[0].override_fields).sort()
const resetP1 = (o) => H.db.query('update public.icplc_participants set override_fields = $2::jsonb where id = $1', [P1, JSON.stringify(o)])
const rpc = (q, fn, ...args) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as v`, args).then((r) => r.rows[0].v)

describe('override_fields atomicity (database)', () => {
  it('CONTROL: the old read-merge-write over a stale copy loses another staff member\'s override', async (ctx) => {
    H.need(ctx)
    await resetP1({ a: { overridden: true } })
    const stale = (await H.db.query('select override_fields from public.icplc_participants where id = $1', [P1])).rows[0].override_fields
    await H.db.query(`update public.icplc_participants set override_fields = override_fields || '{"visa":{"overridden":true}}'::jsonb where id = $1`, [P1]) // staff C protects visa
    await H.db.query('update public.icplc_participants set override_fields = $2::jsonb where id = $1', [P1, JSON.stringify({ ...stale, passport: { overridden: true } })]) // staff B writes the stale whole object
    expect(await keys()).toEqual(['a', 'passport']) // visa protection is gone
  })

  it('two staff changing different fields at the same time keep BOTH (real concurrent transactions)', async (ctx) => {
    H.need(ctx)
    await resetP1({ a: { overridden: true } })
    const c1 = H.db
    const c2 = await H.newClient()
    try {
      const open = async (c) => { await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claim.sub', $1, true)", [STAFF]) }
      await open(c1); await open(c2)
      await c1.query("select public.icplc_apply_override_changes($1, array['passport_readiness'], '{}')", [P1]) // holds the row lock
      let second = 'pending'
      const p2 = c2.query("select public.icplc_apply_override_changes($1, array['visa_process_status'], '{}')", [P1]).then(() => { second = 'done' })
      await new Promise((r) => setTimeout(r, 300))
      expect(second).toBe('pending') // serialised behind the first writer's row lock
      await c1.query('commit')
      await p2
      await c2.query('commit')
    } finally { await c2.end() }
    expect(await keys()).toEqual(['a', 'passport_readiness', 'visa_process_status'])
  })

  it('clearing one key never touches the others; clearing an absent key or passing null changes nothing', async (ctx) => {
    H.need(ctx)
    await resetP1({ a: { overridden: true }, b: { overridden: true }, c: { overridden: true } })
    const commit = (q) => H.asUser(STAFF, q, 'authenticated', { commit: true })
    await commit((x) => x("select public.icplc_apply_override_changes($1, '{}', array['a'])", [P1]))
    expect(await keys()).toEqual(['b', 'c'])
    await commit((x) => x("select public.icplc_apply_override_changes($1, '{}', array['not_there'])", [P1]))
    expect(await keys()).toEqual(['b', 'c'])
    // The former "no cached profile => write {}" wipe cannot happen: an empty or NULL change list is a no-op.
    await commit((x) => x('select public.icplc_apply_override_changes($1, null, null)', [P1]))
    expect(await keys()).toEqual(['b', 'c'])
  })

  it('set stamps who/when on the server; clear-then-set of the same key keeps it set', async (ctx) => {
    H.need(ctx)
    await resetP1({})
    const result = await H.asUser(STAFF, async (q) => (await q("select public.icplc_apply_override_changes($1, array['passport_readiness'], array['passport_readiness']) as v", [P1])).rows[0].v)
    expect(result.passport_readiness).toMatchObject({ overridden: true, by: STAFF })
    expect(result.passport_readiness.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('blank or null field names are ignored', async (ctx) => {
    H.need(ctx)
    await resetP1({})
    await H.asUser(STAFF, (q) => q("select public.icplc_apply_override_changes($1, array['', '  ', 'real'], '{}')", [P1]), 'authenticated', { commit: true })
    expect(await keys()).toEqual(['real'])
  })

  it('swap exchanges two keys atomically, carrying their provenance, and leaves every other key alone', async (ctx) => {
    H.need(ctx)
    const swap = () => H.asUser(STAFF, (q) => q("select public.icplc_swap_override_keys($1, 'email', 'alternate_email')", [P1]), 'authenticated', { commit: true })
    await resetP1({ email: { by: 'x' }, other: { by: 'o' } })
    await swap()
    expect((await H.db.query('select override_fields from public.icplc_participants where id=$1', [P1])).rows[0].override_fields).toEqual({ alternate_email: { by: 'x' }, other: { by: 'o' } })
    await resetP1({ email: { by: 'x' }, alternate_email: { by: 'y' } })
    await swap()
    expect((await H.db.query('select override_fields from public.icplc_participants where id=$1', [P1])).rows[0].override_fields).toEqual({ email: { by: 'y' }, alternate_email: { by: 'x' } })
    await resetP1({ other: { by: 'o' } })
    await swap()
    expect(await keys()).toEqual(['other'])
  })

  it('changes override_fields only: no other column is touched', async (ctx) => {
    H.need(ctx)
    await resetP1({})
    const cols = 'full_name, email, subgroup, participation_status, passport_country'
    const before = (await H.db.query(`select ${cols} from public.icplc_participants where id=$1`, [P1])).rows[0]
    await H.asUser(STAFF, (q) => q("select public.icplc_apply_override_changes($1, array['x'], '{}')", [P1]), 'authenticated', { commit: true })
    expect((await H.db.query(`select ${cols} from public.icplc_participants where id=$1`, [P1])).rows[0]).toEqual(before)
  })

  it('authorization is the row-level policy: outsider, group pastor and other-event member are refused', async (ctx) => {
    H.need(ctx)
    await resetP1({ a: { overridden: true } })
    for (const who of [OUTSIDER, GP, OTHER]) {
      await expect(H.asUser(who, (q) => q("select public.icplc_apply_override_changes($1, array['hijack'], array['a'])", [P1]), 'authenticated', { commit: true }), who).rejects.toMatchObject({ code: '42501' })
      await expect(H.asUser(who, (q) => q("select public.icplc_swap_override_keys($1, 'a', 'b')", [P1]), 'authenticated', { commit: true }), who).rejects.toMatchObject({ code: '42501' })
    }
    expect(await keys()).toEqual(['a']) // nothing changed
    await expect(H.asUser(null, (q) => q("select public.icplc_apply_override_changes($1, array['x'], '{}')", [P1]))).rejects.toMatchObject({ code: '28000' })
    await expect(H.asUser(null, (q) => q("select public.icplc_apply_override_changes($1, array['x'], '{}')", [P1]), 'anon')).rejects.toThrow(/permission denied/i)
  })
})
