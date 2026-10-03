/**
 * Growth week + counts — executed against the REAL SQL functions (migration 20271002000003).
 *
 * Runs in CI against the local Supabase built from this commit's migrations. It is skipped
 * unless SUPABASE_URL points at localhost, so it can never touch a hosted project, and it
 * only writes uniquely-named fixture rows that it removes afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { GROWTH_WEEK_MATRIX } from './growth-week-fixtures'

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/.test(url)
const run = isLocal && key ? describe : describe.skip

run('growth_reporting_week() — fixed-clock matrix (EDT, EST, DST transitions)', () => {
  let db: SupabaseClient
  beforeAll(() => { db = createClient(url, key, { auth: { persistSession: false } }) })

  it.each(GROWTH_WEEK_MATRIX)('$label ($local) → $week', async (c) => {
    const { data, error } = await db.rpc('growth_reporting_week', { p_at: c.utc })
    expect(error).toBeNull()
    expect(data).toBe(c.week)
  })

  it('growth_week_start normalises any date to its Monday', async () => {
    for (const [input, monday] of [
      ['2026-09-28', '2026-09-28'], ['2026-09-30', '2026-09-28'], ['2026-10-04', '2026-09-28'], ['2026-10-05', '2026-10-05'],
    ]) {
      const { data } = await db.rpc('growth_week_start', { p_date: input })
      expect(data).toBe(monday)
    }
  })
})

run('growth_week_summary() — canonical counts (outstanding is NOT expected - received)', () => {
  const PREFIX = 'test-gw-'
  let db: SupabaseClient
  const PAST_WEEK = '2025-03-03' // Monday; long closed
  const units = {
    reported: `${PREFIX}reported`, missing: `${PREFIX}missing`, flagged: `${PREFIX}flagged`, inactive: `${PREFIX}inactive`,
  }
  let base: Record<string, number>

  async function summary(week: string) {
    const { data, error } = await db.rpc('growth_week_summary', { p_week: week })
    expect(error).toBeNull()
    return data[0] as Record<string, number | boolean | string>
  }

  beforeAll(async () => {
    db = createClient(url, key, { auth: { persistSession: false } })
    // Anchor row from a unit that is NOT a schedule center: it only makes the view's week spine
    // reach PAST_WEEK on an otherwise empty local DB, without changing any center's counts.
    const anchor = await db.from('service_reports').insert({
      church_unit_id: `${PREFIX}anchor`, church_name: 'GW Anchor', service_kind: 'SundayService',
      service_date: '2025-03-03', service_name: 'Anchor', total_attendance: 1, first_timers: 0,
    })
    expect(anchor.error).toBeNull()
    base = (await summary(PAST_WEEK)) as Record<string, number>
    const { data: sched, error } = await db.from('service_center_schedule').insert([
      { church_name: 'GW Reported', church_unit_id: units.reported, active: true },
      { church_name: 'GW Missing', church_unit_id: units.missing, active: true },
      { church_name: 'GW Flagged', church_unit_id: units.flagged, active: true },
      { church_name: 'GW Inactive', church_unit_id: units.inactive, active: false },
    ]).select('id, church_unit_id')
    expect(error).toBeNull()
    const flaggedId = sched!.find((s) => s.church_unit_id === units.flagged)!.id
    await db.from('service_reports').insert({
      church_unit_id: units.reported, church_name: 'GW Reported', service_kind: 'SundayService',
      service_date: '2025-03-09', service_name: 'Sunday', total_attendance: 40, first_timers: 3,
    })
    await db.from('service_center_week_status').insert({ schedule_id: flaggedId, week_start_date: PAST_WEEK, status: 'merged' })
  })

  afterAll(async () => {
    await db.from('service_reports').delete().like('church_unit_id', `${PREFIX}%`)
    await db.from('service_center_schedule').delete().like('church_unit_id', `${PREFIX}%`) // cascades week_status
  })

  it('counts received / missing / flagged separately; inactive centers are excluded', async () => {
    const s = await summary(PAST_WEEK)
    expect(s.expected).toBe((base.expected as number) + 3) // reported + missing + flagged (inactive excluded)
    expect(s.received).toBe((base.received as number) + 1)
    expect(s.missing).toBe((base.missing as number) + 1)
    expect(s.flagged).toBe((base.flagged as number) + 1)
    expect(s.pending).toBe(base.pending)
    expect(s.is_closed).toBe(true)
  })

  it('outstanding is missing (no report, no flag) — not expected - received', async () => {
    const s = await summary(PAST_WEEK)
    const delta = (k: string) => (s[k] as number) - (base[k] as number)
    expect(delta('expected') - delta('received')).toBe(2) // the arithmetic answer…
    expect(delta('outstanding')).toBe(1) // …is operationally wrong; the flagged center is not outstanding
  })

  it('identity: expected = received + missing + pending + flagged', async () => {
    const s = await summary(PAST_WEEK)
    expect(s.expected).toBe((s.received as number) + (s.missing as number) + (s.pending as number) + (s.flagged as number))
  })

  it('a non-Monday week argument resolves to its Monday', async () => {
    const s = await summary('2025-03-06')
    expect(s.week_start).toBe(PAST_WEEK)
  })

  it('anon cannot call the summary', async () => {
    const anon = createClient(url, process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '', { auth: { persistSession: false } })
    const { error } = await anon.rpc('growth_week_summary', { p_week: PAST_WEEK })
    expect(error).not.toBeNull()
  })
})
