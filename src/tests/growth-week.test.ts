/**
 * Growth reporting-week correctness (Stream G).
 *
 * Layers:
 *  1. Fixture self-check — the hand-written matrix agrees with an independent Intl-based oracle
 *     (so a typo in the matrix cannot silently bless a wrong implementation).
 *  2. Proven defect — the old UTC rule is wrong at every scheduled Sunday/Monday point.
 *  3. Single-source guards — the page, report function, and migration use the SQL functions; no
 *     JS week math remains in the production paths.
 *  4. Page week selection (explicit ?week=, historical week, default = DB reporting week).
 *  5. SQL semantics are executed against a LOCAL database in growth-week-db.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { GROWTH_WEEK_MATRIX, OLD_UTC_DEFECT_CASES } from './growth-week-fixtures'
import { resolveSelectedWeek, isIsoDate } from '../pages/growth/growthWeek'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

// ── independent oracle (tests only): Toronto calendar date → latest Sunday ≤ date → its Monday ──
function torontoDate(utc: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(utc))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return { y: get('year'), m: get('month'), d: get('day') }
}
function oracleWeek(utc: string): string {
  const { y, m, d } = torontoDate(utc)
  const day = new Date(Date.UTC(y, m - 1, d))
  const dow = day.getUTCDay() // 0 = Sunday
  const sunday = new Date(day.getTime() - dow * 86400000)
  const monday = new Date(sunday.getTime() - 6 * 86400000)
  return monday.toISOString().slice(0, 10)
}
function oldUtcWeek(utc: string): string {
  const dt = new Date(utc)
  const day = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()))
  const dow = day.getUTCDay()
  return new Date(day.getTime() - (dow === 0 ? 6 : dow - 1) * 86400000).toISOString().slice(0, 10)
}

describe('fixture matrix', () => {
  it('covers every required clock point in EDT, EST and both DST transitions', () => {
    const labels = GROWTH_WEEK_MATRIX.map((c) => c.label).join('|')
    for (const t of ['EDT Sun 8:49 PM', 'EDT Sun 8:50 PM', 'EDT Sun 9:00 PM', 'EDT Sun 9:10 PM', 'EDT Sun 11:59 PM', 'EDT Mon 12:00 AM', 'EDT Mon 9:00 AM']) {
      expect(labels).toContain(t)
    }
    expect(GROWTH_WEEK_MATRIX.filter((c) => c.label.startsWith('EST')).length).toBeGreaterThanOrEqual(7)
    expect(GROWTH_WEEK_MATRIX.filter((c) => c.label.startsWith('Fall-back')).length).toBeGreaterThanOrEqual(7)
    expect(GROWTH_WEEK_MATRIX.filter((c) => c.label.startsWith('Spring')).length).toBeGreaterThanOrEqual(7)
  })

  it.each(GROWTH_WEEK_MATRIX)('hand-written expectation agrees with the independent oracle: $label', (c) => {
    expect(oracleWeek(c.utc)).toBe(c.week)
  })

  it('every expected week is a Monday', () => {
    for (const c of GROWTH_WEEK_MATRIX) {
      expect(new Date(c.week + 'T00:00:00Z').getUTCDay()).toBe(1)
    }
  })

  it('Monday daytime resolves to the week that just ended (catch-up = same week as Sunday)', () => {
    const sun = GROWTH_WEEK_MATRIX.find((c) => c.label === 'EDT Sun 9:10 PM')!
    const mon = GROWTH_WEEK_MATRIX.find((c) => c.label === 'EDT Mon 9:00 AM')!
    expect(mon.week).toBe(sun.week)
    const sunE = GROWTH_WEEK_MATRIX.find((c) => c.label === 'EST Sun 9:10 PM')!
    const monE = GROWTH_WEEK_MATRIX.find((c) => c.label === 'EST Mon 9:00 AM')!
    expect(monE.week).toBe(sunE.week)
  })
})

describe('proven defect: the old UTC definition', () => {
  it.each(OLD_UTC_DEFECT_CASES)('old rule picked the NEXT week at $label', (c) => {
    expect(oldUtcWeek(c.utc)).toBe(c.oldWeek)
    expect(c.oldWeek).not.toBe(c.correctWeek)
    expect(oracleWeek(c.utc)).toBe(c.correctWeek)
  })
})

describe('single source of truth (static guards)', () => {
  const report = read('supabase/functions/weekly-growth-report/index.ts')
  const page = read('src/pages/growth/GrowthTrackingPage.jsx')
  const mig = read('supabase/migrations/20271002000003_growth_reporting_week_toronto.sql')

  it('weekly report function takes its week and counts from SQL, not JS date math', () => {
    expect(report).toContain("rpc('growth_reporting_week')")
    expect(report).toContain("rpc('growth_week_summary'")
    expect(report).not.toMatch(/getUTCDay|setUTCDate|setUTCHours/)
  })

  it('weekly report labels the calendar date without a time zone shift', () => {
    expect(report).toMatch(/timeZone:\s*'UTC'/)
  })

  it('page defaults to the DB reporting week and reads counts from the canonical summary', () => {
    expect(page).toContain("rpc('growth_reporting_week')")
    expect(page).toContain("rpc('growth_week_summary'")
    expect(page).toContain("searchParams.get('week')")
    expect(page).not.toMatch(/d\.getDay\(\)/) // Settings flag-week default no longer uses the browser clock
  })

  it('migration defines the Toronto definition and the view/fill_center_gaps no longer use UTC CURRENT_DATE', () => {
    expect(mig).toContain("AT TIME ZONE 'America/Toronto'")
    expect(mig).toContain('growth_reporting_week')
    expect(mig).toContain('growth_week_summary')
    const code = mig.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/CURRENT_DATE/)
  })

  it('migration versions are unique and the new ones continue the lineage after 20271001000004', () => {
    const files = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((f) => /^\d{14}_/.test(f))
    const versions = files.map((f) => f.slice(0, 14))
    expect(new Set(versions).size).toBe(versions.length)
    const added = files.filter((f) => f.startsWith('20271002'))
    expect(added.length).toBeGreaterThan(0)
    for (const f of added) expect(f.slice(0, 14) > '20271001000004').toBe(true)
  })
})

describe('page week selection', () => {
  const allWeeks = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']

  it('defaults to the canonical reporting week, NOT the newest (empty, in-progress) row', () => {
    expect(
      resolveSelectedWeek({ explicit: null, normalizedExplicit: null, reportingWeek: '2026-09-28', allWeeks }),
    ).toBe('2026-09-28')
  })

  it('explicit historical ?week= wins', () => {
    expect(
      resolveSelectedWeek({ explicit: '2026-09-14', normalizedExplicit: null, reportingWeek: '2026-09-28', allWeeks }),
    ).toBe('2026-09-14')
  })

  it('a non-Monday ?week= resolves via the DB-normalised Monday', () => {
    expect(
      resolveSelectedWeek({ explicit: '2026-09-23', normalizedExplicit: '2026-09-21', reportingWeek: '2026-09-28', allWeeks }),
    ).toBe('2026-09-21')
  })

  it('an unknown/future ?week= falls back to the reporting week', () => {
    expect(
      resolveSelectedWeek({ explicit: '2030-01-07', normalizedExplicit: '2030-01-07', reportingWeek: '2026-09-28', allWeeks }),
    ).toBe('2026-09-28')
  })

  it('garbage ?week= is ignored', () => {
    expect(isIsoDate("2026-09-28'; drop")).toBe(false)
    expect(
      resolveSelectedWeek({ explicit: 'not-a-date', normalizedExplicit: null, reportingWeek: '2026-09-28', allWeeks }),
    ).toBe('2026-09-28')
  })

  it('falls back to the newest data week only when the DB value is unavailable', () => {
    expect(resolveSelectedWeek({ explicit: null, normalizedExplicit: null, reportingWeek: null, allWeeks })).toBe('2026-10-05')
    expect(resolveSelectedWeek({ explicit: null, normalizedExplicit: null, reportingWeek: '2031-01-01', allWeeks })).toBe('2026-10-05')
    expect(resolveSelectedWeek({ explicit: null, normalizedExplicit: null, reportingWeek: null, allWeeks: [] })).toBeNull()
  })
})
