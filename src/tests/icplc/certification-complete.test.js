/**
 * ICPLC Registration + CMP catalog and contract checks (local database).
 *
 * Deliberately small: behaviour (matching, conflicts, overrides, authorization,
 * idempotency) is certified by registrationCSV*.test.js, cmpDocumentationCertification.test.js
 * and cmpDocumentationAuthorization.test.js. This file only checks the schema objects and
 * value contracts those suites rely on, using real exports and direct Postgres queries.
 * There are no placeholder assertions here.
 */

import { describe, it, expect, afterAll } from 'vitest'
import pg from 'pg'
import { mapCanadianStatus, mapPassportStatus } from '../../features/icplc/lib/cmpDocumentation.js'
import { RESIDENCY_STATUS } from '../../features/registration/icplcDocReadiness.js'

const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const client = new pg.Client(PG_URL)
const ready = client.connect()
afterAll(async () => { await ready.catch(() => {}); await client.end().catch(() => {}) })

async function query(sql, params = []) {
  await ready
  return (await client.query(sql, params)).rows
}

describe('Catalog', () => {
  it.each(['icplc_participants', 'icplc_identity_maps', 'icplc_email_claims', 'icplc_import_batches', 'icplc_import_rows'])(
    'table public.%s exists with RLS enabled',
    async (table) => {
      const rows = await query(
        `SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'`,
        [table],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].relrowsecurity).toBe(true)
    },
  )

  it.each([
    'icplc_parse_registration_csv',
    'icplc_match_registration_identity',
    'icplc_preview_registration_import',
    'icplc_apply_registration_import',
  ])('RPC public.%s exists', async (fn) => {
    const rows = await query(
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = $1`,
      [fn],
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  it('identity map source_type constraint allows registration_csv and cmp_documentation', async () => {
    const rows = await query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'public.icplc_identity_maps'::regclass AND contype = 'c'`,
    )
    const defs = rows.map((r) => r.def).join('\n')
    expect(defs).toContain('registration_csv')
    expect(defs).toContain('cmp_documentation')
  })

  it('email claims are unique per event and normalized email', async () => {
    const rows = await query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'icplc_email_claims'`,
    )
    expect(rows.some((r) => /UNIQUE/i.test(r.indexdef) && r.indexdef.includes('event_id') && r.indexdef.includes('normalized_email'))).toBe(true)
  })
})

describe('CMP value contracts', () => {
  it('Canadian status mapper writes canonical constants, never display labels', () => {
    const canonical = new Set(Object.values(RESIDENCY_STATUS))
    const answers = [
      'Canadian Citizen',
      'Permanent Resident',
      'International Student / Study Permit Holder',
      'Post-Graduation Work Permit Holder',
      'Visitor',
    ]
    for (const answer of answers) {
      const mapped = mapCanadianStatus(answer)
      expect(canonical.has(mapped), `${answer} -> ${mapped}`).toBe(true)
    }
    expect(mapCanadianStatus('Canadian Citizen')).toBe('CANADIAN_CITIZEN')
  })

  it('Canadian status mapper rejects unknown answers instead of guessing', () => {
    expect(mapCanadianStatus('Something else')).toBeNull()
    expect(mapCanadianStatus(undefined)).toBeNull()
  })

  it('passport status mapper uses the allowed passport_readiness values', () => {
    expect(mapPassportStatus('I have a valid passport')).toBe('ready')
    expect(mapPassportStatus('I do not currently have a valid passport')).toBe('no_passport')
    expect(mapPassportStatus('My passport application or renewal is in progress')).toBe('renewal_in_progress')
    expect(mapPassportStatus('unrecognised')).toBeNull()
  })
})
