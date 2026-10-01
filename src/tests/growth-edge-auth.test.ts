/**
 * Growth Edge Function Authorization — unit tests
 *
 * Tests the auth guard logic for growth-reports-sync and weekly-growth-report.
 * Both functions share the same authorization block so the logic is tested once
 * via a shared helper that mirrors the production guard exactly.
 *
 * Tests do NOT make actual HTTP requests or Supabase calls.
 * Downstream behavior (sync, PDF, email) is not exercised here.
 */

import { describe, it, expect } from 'vitest'

// ── Mirror of the production auth guard ───────────────────────────────────────
//
// Production code (growth-reports-sync and weekly-growth-report):
//
//   const callerToken = authHeader.replace('Bearer ', '').trim()
//   const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
//   const cronSecret = Deno.env.get('CRON_SHARED_SECRET') ?? ''
//   if (callerToken !== svcKey && !(cronSecret && callerToken === cronSecret)) {
//     // → JWT path (auth.getUser + role check)
//   }
//   // → allowed

type AuthDecision = 'ALLOWED' | 'JWT_REQUIRED'

function checkAuth(opts: {
  authorizationHeader: string
  svcKey: string
  cronSecret: string | undefined
}): AuthDecision {
  const callerToken = opts.authorizationHeader.replace('Bearer ', '').trim()
  const cronSecret = opts.cronSecret ?? ''
  if (callerToken !== opts.svcKey && !(cronSecret && callerToken === cronSecret)) {
    return 'JWT_REQUIRED'
  }
  return 'ALLOWED'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REAL_SVC_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role_key'
const REAL_CRON_SECRET = 'test-cron-shared-secret-abc123'
const WRONG_SECRET  = 'wrong-secret'
const RANDOM_JWT    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.user_jwt'

// ── Cron path ─────────────────────────────────────────────────────────────────

describe('Growth edge auth — cron secret path', () => {
  it('correct cron secret → ALLOWED', () => {
    expect(checkAuth({
      authorizationHeader: `Bearer ${REAL_CRON_SECRET}`,
      svcKey: REAL_SVC_KEY,
      cronSecret: REAL_CRON_SECRET,
    })).toBe('ALLOWED')
  })

  it('wrong cron secret → JWT_REQUIRED (denied)', () => {
    expect(checkAuth({
      authorizationHeader: `Bearer ${WRONG_SECRET}`,
      svcKey: REAL_SVC_KEY,
      cronSecret: REAL_CRON_SECRET,
    })).toBe('JWT_REQUIRED')
  })

  it('CRON_SHARED_SECRET unset → arbitrary token rejected (JWT_REQUIRED)', () => {
    expect(checkAuth({
      authorizationHeader: `Bearer ${REAL_CRON_SECRET}`,
      svcKey: REAL_SVC_KEY,
      cronSecret: undefined, // env var not set → '' in production
    })).toBe('JWT_REQUIRED')
  })

  it('CRON_SHARED_SECRET empty string → arbitrary token rejected', () => {
    expect(checkAuth({
      authorizationHeader: `Bearer ${REAL_CRON_SECRET}`,
      svcKey: REAL_SVC_KEY,
      cronSecret: '',
    })).toBe('JWT_REQUIRED')
  })

  it('CRON_SHARED_SECRET empty + empty bearer → not authorized by empty match', () => {
    // Empty secret must never authorize an empty token
    expect(checkAuth({
      authorizationHeader: 'Bearer ',
      svcKey: REAL_SVC_KEY,
      cronSecret: '',
    })).toBe('JWT_REQUIRED')
  })

  it('CRON_SHARED_SECRET unset + no Authorization header → JWT_REQUIRED', () => {
    expect(checkAuth({
      authorizationHeader: '',
      svcKey: REAL_SVC_KEY,
      cronSecret: undefined,
    })).toBe('JWT_REQUIRED')
  })
})

// ── Service role path ─────────────────────────────────────────────────────────

describe('Growth edge auth — service role path', () => {
  it('service role key → ALLOWED', () => {
    expect(checkAuth({
      authorizationHeader: `Bearer ${REAL_SVC_KEY}`,
      svcKey: REAL_SVC_KEY,
      cronSecret: REAL_CRON_SECRET,
    })).toBe('ALLOWED')
  })

  it('service role key takes priority even when cron secret also configured', () => {
    // Both paths allow; service_role match fires first
    expect(checkAuth({
      authorizationHeader: `Bearer ${REAL_SVC_KEY}`,
      svcKey: REAL_SVC_KEY,
      cronSecret: REAL_SVC_KEY, // pathological: same value
    })).toBe('ALLOWED')
  })
})

// ── Unauthorized callers → JWT_REQUIRED ───────────────────────────────────────

describe('Growth edge auth — unauthorized callers fall through to JWT path', () => {
  it('ordinary JWT (non-elevated user) → JWT_REQUIRED', () => {
    // The function code then calls auth.getUser + role check; here we only test
    // the bypass layer. Non-svcKey, non-cronSecret tokens go to JWT path.
    expect(checkAuth({
      authorizationHeader: `Bearer ${RANDOM_JWT}`,
      svcKey: REAL_SVC_KEY,
      cronSecret: REAL_CRON_SECRET,
    })).toBe('JWT_REQUIRED')
  })

  it('no Authorization header → JWT_REQUIRED', () => {
    expect(checkAuth({
      authorizationHeader: '',
      svcKey: REAL_SVC_KEY,
      cronSecret: REAL_CRON_SECRET,
    })).toBe('JWT_REQUIRED')
  })
})
