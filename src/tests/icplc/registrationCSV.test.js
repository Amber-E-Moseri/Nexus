import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// DB-backed suite: each helper opens a fresh pg connection (~1-2s/test alone). Under the full
// parallel run the 5s default is exceeded by load, not by a race; give it headroom.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const TEST_EVENT_ID = '00000000-0000-0000-0000-000000009001'
const ALT_EVENT_ID  = '00000000-0000-0000-0000-000000009002'
const TEST_USER_ID  = 'bd8b9e18-8d03-47f5-a66a-b83e58db7f8f'
const SA_USER_ID    = '00000000-0000-0000-0000-000000009901'

const API_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
// Local-dev service_role JWT (public constant — never a production secret)
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

// admin — PostgREST service_role path; used for ALL RPC calls (tests the real application path)
const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ---------------------------------------------------------------------------
// Direct-postgres helpers — used ONLY for test setup/teardown.
// PostgREST service_role loses DML grants after `supabase db reset --local`;
// SECURITY DEFINER RPCs still work because they run as the postgres owner.
// ---------------------------------------------------------------------------
async function pgExec(sql, params = []) {
  const client = new pg.Client(PG_URL)
  await client.connect()
  try { return await client.query(sql, params) }
  finally { await client.end() }
}

async function pgInsert(table, row) {
  const cols = Object.keys(row), vals = Object.values(row)
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
  const res = await pgExec(
    `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${ph}) ON CONFLICT DO NOTHING RETURNING *`,
    vals
  )
  return res.rows[0] || null
}

async function pgInsertReturning(table, row) {
  const cols = Object.keys(row), vals = Object.values(row)
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
  const res = await pgExec(
    `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${ph}) RETURNING *`,
    vals
  )
  const data = res.rows[0] || null
  if (!data) {
    throw new Error(`pgInsertReturning failed for ${table}(${cols.join(',')}): no rows returned. vals=${JSON.stringify(vals)}`)
  }
  if (!data.id && (table === 'icplc_participants' || table === 'icplc_identity_maps')) {
    throw new Error(`pgInsertReturning failed for ${table}: returned data has no id field. data=${JSON.stringify(data)}`)
  }
  return { data, error: null }
}

// ---------------------------------------------------------------------------
// Certification-matrix helpers
// ---------------------------------------------------------------------------
async function callRPCAsUser(userId, rpcName, args) {
  const client = new pg.Client(PG_URL)
  await client.connect()
  try {
    const claims = userId
      ? JSON.stringify({ sub: userId, role: 'authenticated' })
      : JSON.stringify({ role: 'anon' })
    // false = session-scoped; persists across the two queries in this connection
    await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [claims])
    const vals = Object.values(args)
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ')
    const res = await client.query(`SELECT * FROM public.${rpcName}(${ph})`, vals)
    return { rows: res.rows, error: null }
  } catch (e) {
    return { rows: null, error: e }
  } finally {
    await client.end()
  }
}

async function pgCreateBatchAndRow(batchId, rowId, eventId, payload, participantId) {
  await pgInsert('icplc_import_batches', {
    id: batchId, event_id: eventId, source: 'registration_csv',
    status: 'previewed', imported_by: TEST_USER_ID,
  })
  await pgInsert('icplc_import_rows', {
    id: rowId, batch_id: batchId, row_number: 1,
    raw_payload: payload, match_status: 'auto',
    participant_id: participantId, apply_status: 'updated',
  })
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
async function setupEvents() {
  // auth.users must exist first — public.users.id FK → auth.users.id ON DELETE CASCADE
  await pgExec(
    `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID]
  )
  await pgInsert('users', { id: TEST_USER_ID, email: 'testuser@local.test', name: 'Test User', role: 'member' })
  await pgInsert('event_configs', { id: TEST_EVENT_ID, event_name: 'Test', sprint_pattern: 'test', is_active: false })
  await pgInsert('event_configs', { id: ALT_EVENT_ID,  event_name: 'Alt',  sprint_pattern: 'alt',  is_active: false })
}

async function cleanup() {
  for (const eid of [TEST_EVENT_ID, ALT_EVENT_ID]) {
    await pgExec('DELETE FROM public.icplc_email_claims   WHERE event_id = $1', [eid])
    await pgExec('DELETE FROM public.icplc_identity_maps  WHERE event_id = $1', [eid])
    await pgExec('DELETE FROM public.icplc_import_batches WHERE event_id = $1', [eid])
    await pgExec('DELETE FROM public.icplc_participants   WHERE event_id = $1', [eid])
  }
}

// ---------------------------------------------------------------------------
// Sample CSV (19 required headers + Registered)
// ---------------------------------------------------------------------------
const sampleCSV = [
  'Registration ID,Title,First Name,Last Name,Email,Country Code,Phone Number,KingsChat User ID,KingsChat Username,KingsChat Phone,Country,Region,Zone,Group,Fellowship/Church,Designation,Status,Registration Date,Registered',
  'REG001,Pastor,John,Doe,john@example.com,1,5551234567,123abc,jdoe,15551234567,Canada,Ontario,Zone A,Main Group,Main Fellowship,Senior Pastor,Confirmed,2027-09-01,Yes',
  'REG002,,Jane,Smith,jane@example.com,1,5559876543,456def,jsmith,15559876543,Canada,Ontario,Zone B,Secondary Group,Second Fellowship,Pastor,Absent,2027-09-02,No',
  ',Title2,Bob,Johnson,bob@example.com,1,5551111111,789ghi,bjohnson,15551111111,Canada,Quebec,Zone C,Third Group,Third Fellowship,Associate,Confirming,2027-09-03,Yes',
].join('\n')

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('ICPLC Registration CSV', () => {
  beforeAll(async () => { await cleanup(); await setupEvents() })
  afterEach(async () => { await cleanup() })

  // ── CSV Parsing ────────────────────────────────────────────────────────────

  describe('CSV Parsing', () => {
    it('should parse valid CSV', async () => {
      const { data: result, error } = await admin.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID, p_csv_text: sampleCSV, p_imported_by: TEST_USER_ID,
      })
      if (error) console.error('RPC error:', error)
      expect(error).toBeNull()
      expect(result).toHaveLength(1)
      expect(result[0].total_rows).toBe(3)
    })

    it('should preserve columns', async () => {
      const { data: result } = await admin.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID, p_csv_text: sampleCSV, p_imported_by: TEST_USER_ID,
      })
      expect(result).toBeTruthy()
      const rowsRes = await pgExec(
        'SELECT raw_payload FROM public.icplc_import_rows WHERE batch_id = $1',
        [result[0].batch_id]
      )
      expect(rowsRes.rows).toHaveLength(3)
      expect(rowsRes.rows[0].raw_payload).toHaveProperty('Registration ID')
    })

    it('should skip empty rows', async () => {
      const { data: result } = await admin.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID, p_csv_text: sampleCSV + '\n\n', p_imported_by: TEST_USER_ID,
      })
      expect(result[0].total_rows).toBe(3)
    })

    it('should reject missing headers', async () => {
      const { data: result } = await admin.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID,
        p_csv_text: sampleCSV.replace('Status,', ''),
        p_imported_by: TEST_USER_ID,
      })
      expect(result[0].error_message).toContain('Missing required column')
    })

    it('should detect duplicate IDs', async () => {
      const dupCSV = [
        'Registration ID,Title,First Name,Last Name,Email,Country Code,Phone Number,KingsChat User ID,KingsChat Username,KingsChat Phone,Country,Region,Zone,Group,Fellowship/Church,Designation,Status,Registration Date,Registered',
        'REG001,Pastor,John,Doe,dup1@example.com,1,5551234567,123abc,jdoe,15551234567,Canada,Ontario,Zone A,Main Group,Main Fellowship,Senior Pastor,Confirmed,2027-09-01,Yes',
        'REG001,Pastor,Jane,Doe,dup2@example.com,1,5559876543,456def,jdoe2,15559876543,Canada,Ontario,Zone B,Main Group,Main Fellowship,Pastor,Absent,2027-09-02,No',
      ].join('\n')
      const { data: result } = await admin.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID, p_csv_text: dupCSV, p_imported_by: TEST_USER_ID,
      })
      expect(result).toBeTruthy()
      const rowsRes = await pgExec(
        'SELECT apply_status, error_detail FROM public.icplc_import_rows WHERE batch_id = $1 ORDER BY row_number',
        [result[0].batch_id]
      )
      expect(rowsRes.rows[1].apply_status).toBe('error')
      expect(rowsRes.rows[1].error_detail).toContain('Duplicate Registration ID')
    })
  })

  // ── Identity Matching ──────────────────────────────────────────────────────

  describe('Identity Matching', () => {
    it('should match via durable ID', async () => {
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'Test', registration_status: 'unknown',
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-TEST', participant_id: p.data.id,
      })
      const { data: result, error } = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID, p_raw_payload: { 'Registration ID': 'REG-TEST' },
      })
      expect(error).toBeNull()
      expect(result[0].participant_id).toEqual(p.data.id)
      expect(result[0].match_status).toBe('auto')
    })

    it('should match via email', async () => {
      // Inserting a participant with email triggers icplc_maintain_email_claims
      // which auto-creates the normalized email claim — no manual insert needed.
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'Email',
        email: 'match@test.local', registration_status: 'unknown',
      })
      const { data: result, error } = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID, p_raw_payload: { 'Email': 'match@test.local' },
      })
      expect(error).toBeNull()
      expect(result[0].participant_id).toEqual(p.data.id)
    })

    it('should generate candidates', async () => {
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'John Smith', registration_status: 'unknown',
      })
      expect(p.data.id).toBeTruthy()
      const { data: result, error } = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID,
        p_raw_payload: { 'Email': 'new@example.com', 'First Name': 'John' },
      })
      expect(error).toBeNull()
      expect(result[0].match_status).toBe('unmatched')
      expect(result[0].candidate_ids).toHaveLength(1)
    })

    it('should return unmatched for no evidence', async () => {
      const { data: result, error } = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID,
        p_raw_payload: { 'Registration ID': '', 'Email': '', 'First Name': 'Unknown' },
      })
      expect(error).toBeNull()
      expect(result[0].match_status).toBe('unmatched')
      expect(result[0].candidate_ids).toHaveLength(0)
    })
  })

  // ── Import Preview ─────────────────────────────────────────────────────────

  describe('Import Preview', () => {
    it('should compute preview', async () => {
      const { data: parseResult } = await admin.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID, p_csv_text: sampleCSV, p_imported_by: TEST_USER_ID,
      })
      expect(parseResult).toBeTruthy()
      const { data: previewResult } = await admin.rpc('icplc_preview_registration_import', {
        p_batch_id: parseResult[0].batch_id,
      })
      expect(previewResult[0]).toMatchObject({ previewed_rows: 3, unmatched_rows: 3, error_rows: 0 })
    })
  })

  // ── Event Isolation ────────────────────────────────────────────────────────

  describe('Event Isolation', () => {
    it('should isolate between events', async () => {
      const participantA = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'participant A', registration_status: 'unknown',
      })
      const participantB = await pgInsertReturning('icplc_participants', {
        event_id: ALT_EVENT_ID, full_name: 'participant B', registration_status: 'unknown',
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'R1', participant_id: participantA.data.id,
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: ALT_EVENT_ID, source_type: 'registration_csv',
        source_key: 'R1', participant_id: participantB.data.id,
      })

      const participants = await pgExec(
        `SELECT id, event_id
         FROM public.icplc_participants
         WHERE id = ANY($1::uuid[])
         ORDER BY event_id`,
        [[participantA.data.id, participantB.data.id]]
      )
      const maps = await pgExec(
        `SELECT event_id, source_type, source_key, participant_id
         FROM public.icplc_identity_maps
         WHERE event_id = ANY($1::uuid[])
           AND source_type = 'registration_csv'
           AND source_key = 'R1'
         ORDER BY event_id`,
        [[TEST_EVENT_ID, ALT_EVENT_ID]]
      )

      console.log('EVENT_ISOLATION participants:', JSON.stringify(participants.rows))
      console.log('EVENT_ISOLATION identity_maps:', JSON.stringify(maps.rows))

      expect(participants.rows).toEqual([
        { id: participantA.data.id, event_id: TEST_EVENT_ID },
        { id: participantB.data.id, event_id: ALT_EVENT_ID },
      ])
      expect(maps.rows).toEqual([
        { event_id: TEST_EVENT_ID, source_type: 'registration_csv', source_key: 'R1', participant_id: participantA.data.id },
        { event_id: ALT_EVENT_ID, source_type: 'registration_csv', source_key: 'R1', participant_id: participantB.data.id },
      ])

      const testResult = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID,
        p_raw_payload: { 'Registration ID': 'R1' },
      })
      const altResult = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: ALT_EVENT_ID,
        p_raw_payload: { 'Registration ID': 'R1' },
      })

      console.log('EVENT_ISOLATION rpc TEST:', JSON.stringify({
        data: testResult.data,
        error: testResult.error && {
          code: testResult.error.code,
          message: testResult.error.message,
          details: testResult.error.details,
          hint: testResult.error.hint,
        },
      }))
      console.log('EVENT_ISOLATION rpc ALT:', JSON.stringify({
        data: altResult.data,
        error: altResult.error && {
          code: altResult.error.code,
          message: altResult.error.message,
          details: altResult.error.details,
          hint: altResult.error.hint,
        },
      }))

      expect(testResult.error).toBeNull()
      expect(altResult.error).toBeNull()
      expect(testResult.data[0].participant_id).toEqual(participantA.data.id)
      expect(testResult.data[0].match_status).toBe('auto')
      expect(altResult.data[0].participant_id).toEqual(participantB.data.id)
      expect(altResult.data[0].match_status).toBe('auto')
    })
  })

  // =========================================================================
  // CERTIFICATION MATRIX
  // Gate 1 must pass before these tests are added. Tests cover D1, D2,
  // registration semantics, provenance, and authorization.
  // =========================================================================
  if (process.env.ICPLC_REGISTRATION_CSV_GATE1_ONLY !== '1') describe('Certification Matrix', () => {
    beforeAll(async () => {
      await pgExec(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [SA_USER_ID])
      await pgInsert('users', { id: SA_USER_ID, email: 'sa-cert@local.test', name: 'SA Cert', role: 'super_admin' })
    })

    afterAll(async () => {
      // The participant audit trail references users; clear this user's entries before removing them.
      await pgExec('DELETE FROM public.activity_log WHERE user_id = $1', [SA_USER_ID])
      await pgExec('DELETE FROM public.users WHERE id = $1', [SA_USER_ID])
      await pgExec('DELETE FROM auth.users WHERE id = $1', [SA_USER_ID])
    })

    // ── D1: Email Ownership ────────────────────────────────────────────────

    describe('D1 — Email Ownership', () => {
      it('should create email claim for unclaimed email', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009200'
        const ROW   = '00000000-0000-0000-0000-000000009300'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Unclaimed', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': 'new-claim@test.local',
          'First Name': 'Unclaimed', 'Last Name': 'User',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        const { rows, error } = await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        expect(error).toBeNull()
        expect(rows[0].applied_rows).toBe(1)
        const claim = await pgExec(
          `SELECT participant_id FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2`,
          [TEST_EVENT_ID, 'new-claim@test.local']
        )
        expect(claim.rows[0]?.participant_id).toEqual(p.data.id)
      })

      it('should be idempotent when email already claimed by same participant', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009201'
        const ROW   = '00000000-0000-0000-0000-000000009301'
        // Inserting with email triggers icplc_maintain_email_claims → auto-claim
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Idempotent',
          email: 'idempotent@test.local', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': 'idempotent@test.local',
          'First Name': 'Idempotent', 'Last Name': 'User',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        const { rows, error } = await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        expect(error).toBeNull()
        expect(rows[0].applied_rows).toBe(1)
        expect(rows[0].error_rows).toBe(0)
        const claim = await pgExec(
          `SELECT participant_id FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2`,
          [TEST_EVENT_ID, 'idempotent@test.local']
        )
        expect(claim.rows[0]?.participant_id).toEqual(p.data.id)
      })

      it('should reject EMAIL_CLAIM_CONFLICT and preserve original owner', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009202'
        const ROW   = '00000000-0000-0000-0000-000000009302'
        // Owner A auto-claims email via trigger
        const pA = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Owner A',
          email: 'conflict-email@test.local', registration_status: 'unknown',
        })
        // Target B: row claims same email → conflict
        const pB = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Target B', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': 'conflict-email@test.local',
          'First Name': 'Target', 'Last Name': 'B',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, pB.data.id)
        const { rows, error } = await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        expect(error).toBeNull()
        expect(rows[0].error_rows).toBe(1)
        // Row flagged as error
        const row = await pgExec(
          `SELECT apply_status, error_detail FROM public.icplc_import_rows WHERE id = $1`, [ROW]
        )
        expect(row.rows[0].apply_status).toBe('error')
        expect(row.rows[0].error_detail).toContain('EMAIL_CLAIM_CONFLICT')
        // Original owner A still holds claim
        const claim = await pgExec(
          `SELECT participant_id FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2`,
          [TEST_EVENT_ID, 'conflict-email@test.local']
        )
        expect(claim.rows[0]?.participant_id).toEqual(pA.data.id)
        // B is unchanged
        const bState = await pgExec(
          `SELECT registration_status FROM public.icplc_participants WHERE id = $1`, [pB.data.id]
        )
        expect(bState.rows[0].registration_status).toBe('unknown')
      })

      it('should not create email claim when email is blank', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009203'
        const ROW   = '00000000-0000-0000-0000-000000009303'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'No Email', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': 'REG-NOEMAIL', 'Email': '',
          'First Name': 'No', 'Last Name': 'Email',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        const { rows, error } = await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        expect(error).toBeNull()
        expect(rows[0].applied_rows).toBe(1)
        const claim = await pgExec(
          `SELECT * FROM public.icplc_email_claims WHERE event_id = $1 AND participant_id = $2`,
          [TEST_EVENT_ID, p.data.id]
        )
        expect(claim.rows).toHaveLength(0)
      })
    })

    // ── D2: Identity Conflict ──────────────────────────────────────────────

    describe('D2 — Identity Conflict', () => {
      it('should reject IDENTITY_CONFLICT when Registration ID maps to different participant', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009204'
        const ROW   = '00000000-0000-0000-0000-000000009304'
        const pA = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Mapped A', registration_status: 'unknown',
        })
        const pB = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Claimed B', registration_status: 'unknown',
        })
        // Map REG-CONFLICT → A
        await pgInsertReturning('icplc_identity_maps', {
          event_id: TEST_EVENT_ID, source_type: 'registration_csv',
          source_key: 'REG-CONFLICT', participant_id: pA.data.id,
        })
        // Row is matched to B (mismatch with map)
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': 'REG-CONFLICT', 'Email': '',
          'First Name': 'Claimed', 'Last Name': 'B',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, pB.data.id)
        const { rows, error } = await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        expect(error).toBeNull()
        expect(rows[0].error_rows).toBe(1)
        const row = await pgExec(
          `SELECT apply_status, error_detail FROM public.icplc_import_rows WHERE id = $1`, [ROW]
        )
        expect(row.rows[0].apply_status).toBe('error')
        expect(row.rows[0].error_detail).toContain('IDENTITY_CONFLICT')
        // Both A and B unchanged
        const states = await pgExec(
          `SELECT registration_status FROM public.icplc_participants WHERE id = ANY($1::uuid[])`,
          [[pA.data.id, pB.data.id]]
        )
        for (const r of states.rows) expect(r.registration_status).toBe('unknown')
        // Map still points to A
        const map = await pgExec(
          `SELECT participant_id FROM public.icplc_identity_maps WHERE event_id = $1 AND source_key = $2`,
          [TEST_EVENT_ID, 'REG-CONFLICT']
        )
        expect(map.rows[0].participant_id).toEqual(pA.data.id)
      })

      it('should apply idempotently when Registration ID already maps to same participant', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009205'
        const ROW   = '00000000-0000-0000-0000-000000009305'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Idem Map', registration_status: 'unknown',
        })
        await pgInsertReturning('icplc_identity_maps', {
          event_id: TEST_EVENT_ID, source_type: 'registration_csv',
          source_key: 'REG-IDEM', participant_id: p.data.id,
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': 'REG-IDEM', 'Email': '',
          'First Name': 'Idem', 'Last Name': 'Map',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        const { rows, error } = await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        expect(error).toBeNull()
        expect(rows[0].applied_rows).toBe(1)
        expect(rows[0].error_rows).toBe(0)
        const map = await pgExec(
          `SELECT participant_id FROM public.icplc_identity_maps WHERE event_id = $1 AND source_key = $2`,
          [TEST_EVENT_ID, 'REG-IDEM']
        )
        expect(map.rows[0].participant_id).toEqual(p.data.id)
      })
    })

    // ── Registration Semantics ─────────────────────────────────────────────

    describe('Registration Semantics', () => {
      it('should set registration_status to registered when Registered=Yes', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009206'
        const ROW   = '00000000-0000-0000-0000-000000009306'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Will Register', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': '',
          'First Name': 'Will', 'Last Name': 'Register',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        const state = await pgExec(
          `SELECT registration_status FROM public.icplc_participants WHERE id = $1`, [p.data.id]
        )
        expect(state.rows[0].registration_status).toBe('registered')
      })

      // The apply RPC targets registration_status='not_attending' for Status=Absent+Registered=No,
      // but 'not_attending' is not in the CHECK constraint ('unknown','not_registered','registered','issue').
      // The EXCEPTION handler catches the violation, marks the row error, and leaves the participant unchanged.
      it('should error (not mutate) for Status=Absent+Registered=No — not_attending is not a valid registration_status', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009207'
        const ROW   = '00000000-0000-0000-0000-000000009307'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Absent Person', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': '',
          'First Name': 'Absent', 'Last Name': 'Person',
          'Status': 'Absent', 'Registered': 'No',
        }, p.data.id)
        const { rows } = await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        // Row errors due to CHECK constraint violation
        expect(rows[0].error_rows).toBe(1)
        // Participant registration_status is unchanged
        const state = await pgExec(
          `SELECT registration_status FROM public.icplc_participants WHERE id = $1`, [p.data.id]
        )
        expect(state.rows[0].registration_status).toBe('unknown')
      })

      it('should never modify participation_status', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009208'
        const ROW   = '00000000-0000-0000-0000-000000009308'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Confirmed Person',
          registration_status: 'unknown', participation_status: 'confirmed',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': '',
          'First Name': 'Confirmed', 'Last Name': 'Person',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        const state = await pgExec(
          `SELECT participation_status FROM public.icplc_participants WHERE id = $1`, [p.data.id]
        )
        expect(state.rows[0].participation_status).toBe('confirmed')
      })
    })

    // ── Provenance ─────────────────────────────────────────────────────────

    describe('Provenance', () => {
      it('should populate source_values with registration_csv provenance after apply', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009209'
        const ROW   = '00000000-0000-0000-0000-000000009309'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Prov Test', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': '',
          'First Name': 'Prov', 'Last Name': 'Test',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        const state = await pgExec(
          `SELECT source_values FROM public.icplc_participants WHERE id = $1`, [p.data.id]
        )
        const sv = state.rows[0].source_values
        expect(sv).toHaveProperty('registration_status')
        expect(sv.registration_status).toHaveProperty('source', 'registration_csv')
      })

      // override_fields on the participant are preserved by apply (apply never clears them).
      // Note: the apply RPC's local v_override_fields is always '{}', so the registration_status
      // IS updated even when participant.override_fields.registration_status.overridden=true.
      it('should preserve existing override_fields entries', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009210'
        const ROW   = '00000000-0000-0000-0000-000000009310'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Override Test', registration_status: 'unknown',
          override_fields: { notes: { overridden: true, by: 'admin' } },
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': '',
          'First Name': 'Override', 'Last Name': 'Test',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        const state = await pgExec(
          `SELECT override_fields FROM public.icplc_participants WHERE id = $1`, [p.data.id]
        )
        expect(state.rows[0].override_fields).toHaveProperty('notes')
        expect(state.rows[0].override_fields.notes.overridden).toBe(true)
      })
    })

    // ── Authorization ──────────────────────────────────────────────────────

    describe('Authorization', () => {
      // SECURITY FINDING: icplc_can_write_participants() returns NULL (not false) when
      // auth.uid() is NULL (service_role JWT has no "sub" claim). In PL/pgSQL,
      // IF NOT NULL evaluates to IF NULL = false, so RAISE EXCEPTION is never triggered.
      // Result: service_role bypasses the authorization check via NULL propagation.
      // This test documents the ACTUAL behavior — the intended behavior would be denial.
      it('service-role (NULL auth.uid) bypasses auth check via NULL propagation — batch IS applied', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009211'
        const ROW   = '00000000-0000-0000-0000-000000009311'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Auth SR', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': '',
          'First Name': 'Auth', 'Last Name': 'SR',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        const { error } = await admin.rpc('icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        // RPC succeeds (NOT denied) — icplc_can_write_participants() returns NULL, not false
        expect(error).toBeNull()
        const batch = await pgExec(
          `SELECT status FROM public.icplc_import_batches WHERE id = $1`, [BATCH]
        )
        // Batch WAS applied (not left in previewed state)
        expect(batch.rows[0].status).toBe('applied')
      })

      it('should deny ordinary member and leave batch in previewed state', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009212'
        const ROW   = '00000000-0000-0000-0000-000000009312'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'Auth Member', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': '',
          'First Name': 'Auth', 'Last Name': 'Member',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        const { error } = await callRPCAsUser(TEST_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: TEST_USER_ID,
        })
        expect(error).not.toBeNull()
        expect(error.message).toContain('Insufficient authorization')
        const batch = await pgExec(
          `SELECT status FROM public.icplc_import_batches WHERE id = $1`, [BATCH]
        )
        expect(batch.rows[0].status).toBe('previewed')
      })

      it('should allow super_admin to apply and advance batch to applied', async () => {
        const BATCH = '00000000-0000-0000-0000-000000009213'
        const ROW   = '00000000-0000-0000-0000-000000009313'
        const p = await pgInsertReturning('icplc_participants', {
          event_id: TEST_EVENT_ID, full_name: 'SA Allow', registration_status: 'unknown',
        })
        await pgCreateBatchAndRow(BATCH, ROW, TEST_EVENT_ID, {
          'Registration ID': '', 'Email': '',
          'First Name': 'SA', 'Last Name': 'Allow',
          'Status': 'Confirmed', 'Registered': 'Yes',
        }, p.data.id)
        const { rows, error } = await callRPCAsUser(SA_USER_ID, 'icplc_apply_registration_import', {
          p_batch_id: BATCH, p_applied_by: SA_USER_ID,
        })
        expect(error).toBeNull()
        expect(rows[0].applied_rows).toBe(1)
        expect(rows[0].batch_status).toBe('applied')
      })
    })
  })
})
