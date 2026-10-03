/**
 * Phase 0B — scheduler recovery. Static certification of migration 20271002000002 and the six
 * functions it drives: schedules/bodies preserved, canonical hosted-Supabase pattern, no literal
 * credentials, no GUCs, no data mutation, every function authenticates a cron caller.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const MIG = '20271002000002_repair_reminder_schedulers.sql'
const sql = read(`supabase/migrations/${MIG}`)
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

const EXPECTED: Record<string, { schedule: string; fn: string; body?: string }> = {
  'meeting-reminders-hourly':        { schedule: '0 * * * *',   fn: 'meeting-reminders' },
  'due-date-reminders':              { schedule: '0 12 * * *',  fn: 'due-date-reminders' },
  'due-date-reminders-evening':      { schedule: '0 23 * * *',  fn: 'due-date-reminders', body: '{"mode":"evening"}' },
  'daily-digest':                    { schedule: '0 13 * * *',  fn: 'daily-digest' },
  'delegated-task-reminders-hourly': { schedule: '0 * * * *',   fn: 'delegated-task-reminders' },
  'task-overdue-trigger-hourly':     { schedule: '0 * * * *',   fn: 'task-overdue-trigger' },
  'task-notification-email-batch':   { schedule: '0 */3 * * *', fn: 'task-notification-email-batch' },
}

describe('migration file', () => {
  it('uses the collision-free next version and no version is duplicated', () => {
    const versions = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((f) => /^\d{14}_/.test(f)).map((f) => f.slice(0, 14))
    expect(new Set(versions).size).toBe(versions.length)
    expect(versions).toContain('20271002000002')
  })

  it('contains no literal credentials, no GUC reads, no secret-looking strings', () => {
    expect(code).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/)
    expect(code).not.toMatch(/sb_secret|sb_publishable/)
    expect(code).not.toMatch(/current_setting\(/)
    expect(code).not.toMatch(/Bearer\s+\[/)
    expect(code).not.toMatch(/'Bearer [A-Za-z0-9_-]{16,}'/)
  })

  it('does NOT mutate data (stale-email backlog is untouched)', () => {
    expect(code).not.toMatch(/\bupdate\s+public\.notifications\b/i)
    expect(code).not.toMatch(/\bdelete\s+from\b/i)
    expect(code).not.toMatch(/\binsert\s+into\b/i)
    expect(code).not.toMatch(/email_sent_at/i)
  })

  it('reads URL / apikey / cron secret from app_settings via app_setting()', () => {
    for (const k of ['supabase_url', 'service_role_key', 'recurring_meetings_cron_secret']) {
      expect(code).toContain(`public.app_setting('${k}')`)
    }
    expect(code).toMatch(/'apikey',\s+v_apikey/)
    expect(code).toMatch(/'Authorization',\s+'Bearer ' \|\| v_secret/)
  })

  it('helper is allowlisted and not callable by PostgREST roles', () => {
    expect(code).toMatch(/revoke all on function public\.invoke_internal_function\(text, jsonb\) from public, anon, authenticated/)
    expect(code).toMatch(/grant execute on function public\.invoke_internal_function\(text, jsonb\) to service_role/)
    for (const e of Object.values(EXPECTED)) expect(code).toContain(`'${e.fn}'`)
    expect(code).toMatch(/raise exception 'invoke_internal_function: function % not allowed'/)
  })
})

describe('job definitions (schedules and request bodies preserved)', () => {
  const calls = [...code.matchAll(/select cron\.schedule\('([^']+)',\s*'([^']+)',\s*\$\$\s*select public\.invoke_internal_function\('([^']+)'(?:,\s*'(\{[^']*\})'::jsonb)?\);\s*\$\$\);/gi)]

  it('registers exactly the seven expected jobs', () => {
    expect(calls.map((c) => c[1]).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it.each(Object.entries(EXPECTED))('%s keeps its schedule, target and body', (name, e) => {
    const c = calls.find((x) => x[1] === name)!
    expect(c[2]).toBe(e.schedule)
    expect(c[3]).toBe(e.fn)
    expect(c[4]).toBe(e.body)
  })

  it('old job names are unscheduled before re-registration (no duplicates)', () => {
    for (const name of Object.keys(EXPECTED)) expect(code).toContain(`'${name}'`)
    expect(code).toMatch(/perform cron\.unschedule\(j\)/)
  })
})

describe('functions authenticate the canonical cron contract', () => {
  const fns = ['meeting-reminders', 'due-date-reminders', 'daily-digest', 'delegated-task-reminders', 'task-overdue-trigger', 'task-notification-email-batch']
  const cfg = read('supabase/config.toml')

  it.each(fns)('%s: trusted-internal check, no env-key equality, gateway JWT check off', (fn) => {
    const src = read(`supabase/functions/${fn}/index.ts`)
    expect(src).toContain('isTrustedInternalCaller')
    expect(src).not.toMatch(/===\s*Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/)
    expect(src).not.toMatch(/!==\s*(serviceRoleKey|Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\))/)
    expect(cfg).toMatch(new RegExp(`\\[functions\\."${fn}"\\]\\s*\\nverify_jwt = false`))
  })

  it('every cron-driven function in the helper allowlist exists', () => {
    for (const fn of fns) expect(() => read(`supabase/functions/${fn}/index.ts`)).not.toThrow()
  })
})
