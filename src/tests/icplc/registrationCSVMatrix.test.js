import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// DB-backed suite: each helper opens a fresh pg connection (~1-2s/test alone). Under the full
// parallel run the 5s default is exceeded by load, not by a race; give it headroom.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_EVENT_ID   = '00000000-0000-0000-0000-000000009501'
const ALT_EVENT_ID    = '00000000-0000-0000-0000-000000009502'
const SPRINT_EVENT_ID = '00000000-0000-0000-0000-000000009503'
const TEST_USER_ID    = 'bd8b9e18-8d03-47f5-a66a-b83e58db7f8f'

const API_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7kyqHnmVMkJQklVUhLsPSnT5HKPZ4Z2MWsA'
const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── Direct-postgres helpers (setup/teardown only) ────────────────────────────

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
  return { data: res.rows[0] || null }
}

// ── CSV builder ──────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'Registration ID', 'Title', 'First Name', 'Last Name', 'Email',
  'Country Code', 'Phone Number', 'KingsChat User ID', 'KingsChat Username',
  'KingsChat Phone', 'Country', 'Region', 'Zone', 'Group',
  'Fellowship/Church', 'Designation', 'Status', 'Registration Date', 'Registered',
]
const CSV_DEFAULTS = {
  'Registration ID': '', 'Title': '', 'First Name': 'Test', 'Last Name': 'User',
  'Email': '', 'Country Code': '1', 'Phone Number': '5550000000',
  'KingsChat User ID': '', 'KingsChat Username': '', 'KingsChat Phone': '',
  'Country': 'Canada', 'Region': 'Ontario', 'Zone': 'Zone A', 'Group': 'Main Group',
  'Fellowship/Church': 'Fellowship', 'Designation': 'Member',
  'Status': 'Confirmed', 'Registration Date': '2027-09-01', 'Registered': 'Yes',
}

function buildCSV(rows, extraHeaders = []) {
  const allHeaders = [...CSV_HEADERS, ...extraHeaders]
  const headerLine = allHeaders.join(',')
  const dataLines = rows.map(row => {
    const merged = { ...CSV_DEFAULTS, ...row }
    return allHeaders.map(h => merged[h] ?? '').join(',')
  })
  return [headerLine, ...dataLines].join('\n')
}

// ── Parse + Preview helper ───────────────────────────────────────────────────

async function parseAndPreview(eventId, csvRows, extraHeaders = []) {
  const csvText = buildCSV(csvRows, extraHeaders)
  const { data: parseResult, error: pe } = await admin.rpc('icplc_parse_registration_csv', {
    p_event_id: eventId, p_csv_text: csvText, p_imported_by: TEST_USER_ID,
  })
  if (pe) throw new Error('parse error: ' + pe.message)
  const batchId = parseResult[0].batch_id
  const { error: pre } = await admin.rpc('icplc_preview_registration_import', { p_batch_id: batchId })
  if (pre) throw new Error('preview error: ' + pre.message)
  const rowsRes = await pgExec(
    'SELECT id, match_status, participant_id, apply_status, error_detail FROM public.icplc_import_rows WHERE batch_id = $1 ORDER BY row_number',
    [batchId]
  )
  return { batchId, importRows: rowsRes.rows }
}

// ── Setup / Cleanup ──────────────────────────────────────────────────────────

async function setupEvents() {
  await pgExec(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [TEST_USER_ID])
  await pgInsert('users', { id: TEST_USER_ID, email: 'testuser@local.test', name: 'Test User', role: 'member' })
  await pgInsert('event_configs', { id: TEST_EVENT_ID, event_name: 'Test Event', sprint_pattern: 'test', is_active: false })
  await pgInsert('event_configs', { id: ALT_EVENT_ID,  event_name: 'Alt Event',  sprint_pattern: 'alt',  is_active: false })
}

async function cleanup() {
  for (const eid of [TEST_EVENT_ID, ALT_EVENT_ID]) {
    await pgExec('DELETE FROM public.icplc_email_claims   WHERE event_id = $1', [eid])
    await pgExec('DELETE FROM public.icplc_identity_maps  WHERE event_id = $1', [eid])
    await pgExec('DELETE FROM public.icplc_import_batches WHERE event_id = $1', [eid])
    await pgExec('DELETE FROM public.icplc_participants   WHERE event_id = $1', [eid])
  }
}

// ── Auth user helper ─────────────────────────────────────────────────────────

// Auth users that ran the apply RPC own activity_log rows (FK, no cascade), so a bare
// deleteUser fails silently and the next run's createUser hits 'already registered'.
async function deleteAuthUser(userId) {
  await pgExec('DELETE FROM public.activity_log WHERE user_id = $1', [userId])
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error('deleteUser ' + userId + ': ' + error.message)
}

async function createTestAuthUser(email, password, role) {
  // Idempotent: delete if exists before creating
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch(() => ({ data: { users: [] } }))
  const prev = existing?.users?.find(u => u.email === email)
  if (prev) await deleteAuthUser(prev.id)

  const { data: createData, error: ce } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (ce) throw new Error('createUser ' + email + ': ' + ce.message)
  const userId = createData.user.id

  await pgExec(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [userId])
  await pgExec(
    `INSERT INTO public.users (id, email, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET role = $4`,
    [userId, email, role, role]
  )

  const anonClient = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: sd, error: se } = await anonClient.auth.signInWithPassword({ email, password })
  if (se) throw new Error('signIn ' + email + ': ' + se.message)

  const client = createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${sd.session.access_token}` } },
  })
  return { userId, client }
}

// ── Main describe ─────────────────────────────────────────────────────────────

describe('ICPLC Registration CSV — Certification Matrix', () => {
  let superAdmin = null

  beforeAll(async () => {
    await cleanup()
    await setupEvents()
    superAdmin = await createTestAuthUser('matrix_super@local.test', 'Password123!', 'super_admin')
  })

  afterAll(async () => {
    if (superAdmin) await deleteAuthUser(superAdmin.userId)
  })

  afterEach(async () => { await cleanup() })

  // ══════════════════════════════════════════════════════════════════════════
  // D1 — Email Ownership
  // ══════════════════════════════════════════════════════════════════════════

  describe('D1 — Email Ownership', () => {

    it('D1A: blank reg ID + same email → idempotent apply, no conflict', async () => {
      const p1 = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'P1 D1A',
        email: 'shared_d1a@local.test', registration_status: 'unknown',
      })
      // icplc_maintain_email_claims trigger auto-created claim for p1

      const { batchId, importRows } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Email': 'shared_d1a@local.test', 'First Name': 'P1', 'Last Name': 'D1A', 'Registered': 'Yes' },
      ])
      expect(importRows[0].match_status).toBe('auto')
      expect(importRows[0].participant_id).toBe(p1.data.id)

      const { data: applyResult, error } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      expect(error).toBeNull()
      expect(applyResult[0].applied_rows).toBe(1)
      expect(applyResult[0].error_rows).toBe(0)

      // Claim still owned by P1
      const claims = await pgExec(
        'SELECT participant_id FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2',
        [TEST_EVENT_ID, 'shared_d1a@local.test']
      )
      expect(claims.rows).toHaveLength(1)
      expect(claims.rows[0].participant_id).toBe(p1.data.id)
    })

    it('D1B: different reg ID resolved to different participant than email owner → EMAIL_CLAIM_CONFLICT', async () => {
      // P1 owns the email claim
      const p1 = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'P1 D1B',
        email: 'shared_d1b@local.test', registration_status: 'unknown',
      })
      // P2 has identity map, no email
      const p2 = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'P2 D1B', registration_status: 'unknown',
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-D1B-2', participant_id: p2.data.id,
      })

      // CSV: reg ID → P2 via identity map, but email is P1's
      const { batchId, importRows } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': 'REG-D1B-2', 'Email': 'shared_d1b@local.test', 'First Name': 'P2', 'Last Name': 'D1B', 'Registered': 'Yes' },
      ])
      expect(importRows[0].match_status).toBe('auto')
      expect(importRows[0].participant_id).toBe(p2.data.id)

      const { data: applyResult, error } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      expect(error).toBeNull()
      expect(applyResult[0].error_rows).toBe(1)
      expect(applyResult[0].applied_rows).toBe(0)

      // Verify conflict detail
      const rows = await pgExec(
        'SELECT apply_status, error_detail FROM public.icplc_import_rows WHERE batch_id = $1',
        [batchId]
      )
      expect(rows.rows[0].apply_status).toBe('error')
      expect(rows.rows[0].error_detail).toMatch(/EMAIL_CLAIM_CONFLICT/i)

      // P1 still owns claim
      const claims = await pgExec(
        'SELECT participant_id FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2',
        [TEST_EVENT_ID, 'shared_d1b@local.test']
      )
      expect(claims.rows[0].participant_id).toBe(p1.data.id)
    })

    it('D1C: create_new with email already claimed → rejected (trigger conflict)', async () => {
      // Parse first (no email claim yet)
      const { importRows } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Email': 'claimed_d1c@local.test', 'First Name': 'New', 'Last Name': 'D1C', 'Registered': 'Yes' },
      ])
      // Row is unmatched (no claim existed at preview time)
      expect(importRows[0].match_status).toBe('unmatched')
      const rowId = importRows[0].id

      // Now establish email ownership AFTER preview
      const p1 = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'P1 D1C',
        email: 'claimed_d1c@local.test', registration_status: 'unknown',
      })
      // Trigger auto-created claim for p1

      // Try create_new on the unmatched row — trigger fires and fails
      const { data, error } = await superAdmin.client.rpc('icplc_resolve_unmatched_row', {
        p_row_id: rowId,
        p_action: 'create_new',
        p_participant_id: null,
        p_resolved_by: superAdmin.userId,
      })
      // Must fail (unique constraint from trigger)
      expect(error).not.toBeNull()
      expect(error.message).toMatch(/duplicate key|unique constraint/i)

      // No new participant was created
      const pCount = await pgExec(
        'SELECT COUNT(*) FROM public.icplc_participants WHERE event_id = $1',
        [TEST_EVENT_ID]
      )
      expect(parseInt(pCount.rows[0].count)).toBe(1) // only p1

      // P1 still owns claim
      const claims = await pgExec(
        'SELECT participant_id FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2',
        [TEST_EVENT_ID, 'claimed_d1c@local.test']
      )
      expect(claims.rows[0].participant_id).toBe(p1.data.id)
    })

    it('D1D: link_existing to participant other than email owner → EMAIL_CLAIM_CONFLICT on apply', async () => {
      // Parse first (no claim yet)
      const { batchId, importRows } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Email': 'claimed_d1d@local.test', 'First Name': 'Link', 'Last Name': 'D1D', 'Registered': 'Yes' },
      ])
      expect(importRows[0].match_status).toBe('unmatched')
      const rowId = importRows[0].id

      // Establish email claim for P1, create P2 as the link target
      const p1 = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'P1 D1D',
        email: 'claimed_d1d@local.test', registration_status: 'unknown',
      })
      const p2 = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'P2 D1D', registration_status: 'unknown',
      })

      // Link the unmatched row to P2
      const { data: resolveData, error: re } = await superAdmin.client.rpc('icplc_resolve_unmatched_row', {
        p_row_id: rowId,
        p_action: 'link_existing',
        p_participant_id: p2.data.id,
        p_resolved_by: superAdmin.userId,
      })
      expect(re).toBeNull()
      expect(resolveData[0].success).toBe(true)

      // Apply: row is now manual + P2, but email belongs to P1 → conflict
      const { data: applyResult, error: ae } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      expect(ae).toBeNull()
      expect(applyResult[0].error_rows).toBe(1)
      expect(applyResult[0].applied_rows).toBe(0)

      const rows = await pgExec(
        'SELECT apply_status, error_detail FROM public.icplc_import_rows WHERE batch_id = $1',
        [batchId]
      )
      expect(rows.rows[0].error_detail).toMatch(/EMAIL_CLAIM_CONFLICT/i)

      // P1 still owns claim
      const claims = await pgExec(
        'SELECT participant_id FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2',
        [TEST_EVENT_ID, 'claimed_d1d@local.test']
      )
      expect(claims.rows[0].participant_id).toBe(p1.data.id)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // D2 — Identity Disagreement
  // ══════════════════════════════════════════════════════════════════════════

  describe('D2 — Identity Disagreement', () => {

    it('D2: reg ID→P_A added after preview that matched via email→P_B → IDENTITY_CONFLICT', async () => {
      const pA = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'PA D2', registration_status: 'unknown',
      })
      const pB = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'PB D2',
        email: 'b_d2@local.test', registration_status: 'unknown',
      })
      // No identity map for REG-D2 at preview time → email matches P_B

      const { batchId, importRows } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': 'REG-D2', 'Email': 'b_d2@local.test', 'First Name': 'Test', 'Registered': 'Yes' },
      ])
      // Durable ID not found → falls through to email → P_B
      expect(importRows[0].participant_id).toBe(pB.data.id)

      // AFTER preview: insert identity map REG-D2 → P_A (race condition)
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-D2', participant_id: pA.data.id,
      })

      // Apply: v_participant_id = P_B, existing_mapping = P_A → CONFLICT
      const { data: applyResult, error } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      expect(error).toBeNull()
      expect(applyResult[0].error_rows).toBe(1)

      const rows = await pgExec(
        'SELECT error_detail FROM public.icplc_import_rows WHERE batch_id = $1',
        [batchId]
      )
      expect(rows.rows[0].error_detail).toMatch(/IDENTITY_CONFLICT/i)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Durable Identity Matrix
  // ══════════════════════════════════════════════════════════════════════════

  describe('Durable Identity Matrix', () => {

    it('Replay: second import of same CSV is idempotent', async () => {
      const p1 = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'P1 Replay', registration_status: 'unknown',
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-REPLAY', participant_id: p1.data.id,
      })

      // First apply
      const { batchId: b1 } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': 'REG-REPLAY', 'First Name': 'P1', 'Last Name': 'Replay', 'Registered': 'Yes' },
      ])
      const { data: r1 } = await superAdmin.client.rpc(
        'icplc_apply_registration_import', { p_batch_id: b1, p_applied_by: superAdmin.userId }
      )
      expect(r1[0].error_rows).toBe(0)

      // Second apply of identical data
      const { batchId: b2 } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': 'REG-REPLAY', 'First Name': 'P1', 'Last Name': 'Replay', 'Registered': 'Yes' },
      ])
      const { data: r2, error: e2 } = await superAdmin.client.rpc(
        'icplc_apply_registration_import', { p_batch_id: b2, p_applied_by: superAdmin.userId }
      )
      expect(e2).toBeNull()
      expect(r2[0].error_rows).toBe(0)
      expect(r2[0].applied_rows).toBe(1)

      // Participant still in consistent state
      const pRes = await pgExec('SELECT registration_status FROM public.icplc_participants WHERE id = $1', [p1.data.id])
      expect(pRes.rows[0].registration_status).toBe('registered')
    })

    it('Blank reg ID: unmatched row with no reg ID → no auto-create', async () => {
      const { batchId, importRows } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': '', 'Email': '', 'First Name': 'Ghost', 'Last Name': 'User', 'Registered': 'Yes' },
      ])
      expect(importRows[0].match_status).toBe('unmatched')

      const { data: applyResult } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      expect(applyResult[0].applied_rows).toBe(0)
      expect(applyResult[0].error_rows).toBe(0)

      // No participant was auto-created
      const pCount = await pgExec(
        'SELECT COUNT(*) FROM public.icplc_participants WHERE event_id = $1', [TEST_EVENT_ID]
      )
      expect(parseInt(pCount.rows[0].count)).toBe(0)
    })

    it('Changed email: apply updates participant email and swaps email claim', async () => {
      const p1 = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'P1 Email',
        email: 'orig_email@local.test', registration_status: 'unknown',
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-EMAIL-CHANGE', participant_id: p1.data.id,
      })

      // Import with new email
      const { batchId } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': 'REG-EMAIL-CHANGE', 'Email': 'new_email@local.test', 'First Name': 'P1', 'Registered': 'Yes' },
      ])
      const { data: applyResult, error } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      expect(error).toBeNull()
      expect(applyResult[0].error_rows).toBe(0)

      // New email claim exists for P1
      const newClaim = await pgExec(
        'SELECT participant_id FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2',
        [TEST_EVENT_ID, 'new_email@local.test']
      )
      expect(newClaim.rows).toHaveLength(1)
      expect(newClaim.rows[0].participant_id).toBe(p1.data.id)

      // Old email claim is gone (trigger swapped it)
      const oldClaim = await pgExec(
        'SELECT COUNT(*) FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2',
        [TEST_EVENT_ID, 'orig_email@local.test']
      )
      expect(parseInt(oldClaim.rows[0].count)).toBe(0)
    })

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
      expect(testResult.data[0].participant_id).toBe(participantA.data.id)
      expect(testResult.data[0].match_status).toBe('auto')
      expect(altResult.data[0].participant_id).toBe(participantB.data.id)
      expect(altResult.data[0].match_status).toBe('auto')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Matching Safety
  // ══════════════════════════════════════════════════════════════════════════

  describe('Matching Safety', () => {

    it('Exact email match → auto (no manual intervention needed)', async () => {
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'Email Match',
        email: 'exact_ms@local.test', registration_status: 'unknown',
      })
      const { data: result } = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID,
        p_raw_payload: { 'Email': 'exact_ms@local.test' },
      })
      expect(result[0].match_status).toBe('auto')
      expect(result[0].participant_id).toBe(p.data.id)
    })

    it('Name-only → unmatched (no auto-link, candidates listed)', async () => {
      await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'John Candidate', registration_status: 'unknown',
      })
      const { data: result } = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID,
        p_raw_payload: { 'First Name': 'John', 'Last Name': 'Candidate', 'Email': '', 'Registration ID': '' },
      })
      expect(result[0].match_status).toBe('unmatched')
      // Candidates may be populated but NO auto-link
      expect(result[0].participant_id).toBeNull()
    })

    it('Phone-only → unmatched, no candidate auto-link', async () => {
      const { data: result } = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID,
        p_raw_payload: {
          'Registration ID': '', 'Email': '', 'First Name': '',
          'Phone Number': '5551234567', 'KingsChat User ID': '',
        },
      })
      expect(result[0].match_status).toBe('unmatched')
      expect(result[0].participant_id).toBeNull()
      expect(result[0].candidate_ids).toHaveLength(0)
    })

    it('KingsChat-only → unmatched (step 2 disabled in V1)', async () => {
      await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'KingsChat User', registration_status: 'unknown',
      })
      const { data: result } = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID,
        p_raw_payload: {
          'Registration ID': '', 'Email': '', 'First Name': '',
          'KingsChat User ID': '999kingschat',
        },
      })
      expect(result[0].match_status).toBe('unmatched')
      expect(result[0].participant_id).toBeNull()
    })

    it('No evidence at all → unmatched, empty candidates, no participant created', async () => {
      const before = await pgExec(
        'SELECT COUNT(*) FROM public.icplc_participants WHERE event_id = $1', [TEST_EVENT_ID]
      )
      const { data: result } = await admin.rpc('icplc_match_registration_identity', {
        p_event_id: TEST_EVENT_ID,
        p_raw_payload: { 'Registration ID': '', 'Email': '', 'First Name': '', 'Last Name': '' },
      })
      expect(result[0].match_status).toBe('unmatched')
      expect(result[0].candidate_ids).toHaveLength(0)
      expect(result[0].participant_id).toBeNull()

      // Matching alone must not create participants
      const after = await pgExec(
        'SELECT COUNT(*) FROM public.icplc_participants WHERE event_id = $1', [TEST_EVENT_ID]
      )
      expect(after.rows[0].count).toBe(before.rows[0].count)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Registration Semantics
  // ══════════════════════════════════════════════════════════════════════════

  describe('Registration Semantics', () => {

    // afterEach(cleanup) between each semantic test so 'REG-SEM' is always free
    async function applyCSVRow(csvOverrides, initialStatus = 'unknown') {
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'Sem Test',
        registration_status: initialStatus,
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-SEM', participant_id: p.data.id,
      })
      const { batchId } = await parseAndPreview(TEST_EVENT_ID, [{
        'Registration ID': 'REG-SEM',
        ...csvOverrides,
      }])
      const { data, error } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      if (error) throw new Error('apply: ' + error.message)
      const pRes = await pgExec('SELECT * FROM public.icplc_participants WHERE id = $1', [p.data.id])
      return { participant: pRes.rows[0], applyResult: data[0] }
    }

    it('Confirmed+Yes → registration_status = registered', async () => {
      const { participant, applyResult } = await applyCSVRow({ 'Status': 'Confirmed', 'Registered': 'Yes' })
      expect(applyResult.error_rows).toBe(0)
      expect(participant.registration_status).toBe('registered')
    })

    it('Confirming+Yes → registration_status = registered', async () => {
      const { participant, applyResult } = await applyCSVRow({ 'Status': 'Confirming', 'Registered': 'Yes' })
      expect(applyResult.error_rows).toBe(0)
      expect(participant.registration_status).toBe('registered')
    })

    it('Existing registered + source No (non-Absent) → no silent downgrade', async () => {
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'No Downgrade',
        registration_status: 'registered',
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-NODOWN', participant_id: p.data.id,
      })
      const { batchId } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': 'REG-NODOWN', 'Status': 'Confirmed', 'Registered': 'No' },
      ])
      const { data: applyResult } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      expect(applyResult[0].error_rows).toBe(0)

      const pRes = await pgExec('SELECT registration_status FROM public.icplc_participants WHERE id = $1', [p.data.id])
      // Must NOT downgrade from 'registered'
      expect(pRes.rows[0].registration_status).toBe('registered')
    })

    it('participation_status is NEVER modified by apply', async () => {
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'Participation',
        registration_status: 'unknown', participation_status: 'confirmed',
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-PARTSTAT', participant_id: p.data.id,
      })
      // Registered='Yes' → registration_status='registered'; participation_status must remain 'confirmed'
      const { batchId } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': 'REG-PARTSTAT', 'Status': 'Confirmed', 'Registered': 'Yes' },
      ])
      const { data: applyResult, error } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      expect(error).toBeNull()
      expect(applyResult[0].error_rows).toBe(0)
      const pRes = await pgExec('SELECT participation_status, registration_status FROM public.icplc_participants WHERE id = $1', [p.data.id])
      // participation_status must be unchanged by apply — apply never touches it
      expect(pRes.rows[0].participation_status).toBe('confirmed')
      // registration_status WAS updated (Registered='Yes' → registered)
      expect(pRes.rows[0].registration_status).toBe('registered')
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Provenance
  // ══════════════════════════════════════════════════════════════════════════

  describe('Provenance', () => {

    it('raw_payload retained verbatim in import row', async () => {
      const { data: parseResult } = await admin.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID,
        p_csv_text: buildCSV([{ 'Registration ID': 'REG-PROV', 'First Name': 'Prov', 'Last Name': 'Test', 'Email': 'prov@local.test', 'Registered': 'Yes' }]),
        p_imported_by: TEST_USER_ID,
      })
      const rows = await pgExec(
        'SELECT raw_payload FROM public.icplc_import_rows WHERE batch_id = $1', [parseResult[0].batch_id]
      )
      const rp = rows.rows[0].raw_payload
      expect(rp['Registration ID']).toBe('REG-PROV')
      expect(rp['First Name']).toBe('Prov')
      expect(rp['Email']).toBe('prov@local.test')
    })

    it('Unknown CSV columns preserved in raw_payload', async () => {
      const { data: parseResult } = await admin.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID,
        p_csv_text: buildCSV([{ 'Registration ID': 'REG-UNKNOWN', 'Custom Field': 'xyz' }], ['Custom Field']),
        p_imported_by: TEST_USER_ID,
      })
      const rows = await pgExec(
        'SELECT raw_payload FROM public.icplc_import_rows WHERE batch_id = $1', [parseResult[0].batch_id]
      )
      // extra column must be in raw_payload
      expect(rows.rows[0].raw_payload['Custom Field']).toBe('xyz')
    })

    it('source_values namespace populated on apply', async () => {
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'SrcVal', registration_status: 'unknown',
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-SRCVAL', participant_id: p.data.id,
      })
      const { batchId } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': 'REG-SRCVAL', 'Status': 'Confirmed', 'Registered': 'Yes' },
      ])
      await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      const pRes = await pgExec('SELECT source_values FROM public.icplc_participants WHERE id = $1', [p.data.id])
      const sv = pRes.rows[0].source_values
      expect(sv).toHaveProperty('registration_status')
      expect(sv.registration_status).toHaveProperty('source', 'registration_csv')
    })

    it('Unrelated source_values namespaces preserved after apply', async () => {
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'Unrelated SV',
        registration_status: 'unknown',
        source_values: JSON.stringify({ other_source: { value: 'preserved_value', source: 'manual' } }),
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-UNREL', participant_id: p.data.id,
      })
      const { batchId } = await parseAndPreview(TEST_EVENT_ID, [
        { 'Registration ID': 'REG-UNREL', 'Status': 'Confirmed', 'Registered': 'Yes' },
      ])
      await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      const pRes = await pgExec('SELECT source_values FROM public.icplc_participants WHERE id = $1', [p.data.id])
      const sv = pRes.rows[0].source_values
      // Unrelated namespace must survive the merge
      expect(sv.other_source).toBeDefined()
      expect(sv.other_source.value).toBe('preserved_value')
      // CSV namespace also present
      expect(sv.registration_status).toBeDefined()
    })

    it('override_fields survive and protected canonical fields remain unchanged', async () => {
      const overrides = {
        full_name: { overridden: true, source: 'manual' },
        email: { overridden: true, source: 'manual' },
        registration_status: { overridden: true, source: 'manual' },
      }
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID,
        full_name: 'Protected Canonical',
        email: 'protected@local.test',
        registration_status: 'registered',
        override_fields: JSON.stringify(overrides),
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: TEST_EVENT_ID, source_type: 'registration_csv',
        source_key: 'REG-PROTECTED', participant_id: p.data.id,
      })
      const { batchId } = await parseAndPreview(TEST_EVENT_ID, [
        {
          'Registration ID': 'REG-PROTECTED',
          'First Name': 'Csv',
          'Last Name': 'Replacement',
          'Email': 'csv-replacement@local.test',
          'Status': 'Absent',
          'Registered': 'No',
        },
      ])
      const { data: applyResult, error } = await superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: superAdmin.userId }
      )
      expect(error).toBeNull()
      expect(applyResult[0].error_rows).toBe(0)

      const pRes = await pgExec(
        'SELECT full_name, email, registration_status, override_fields FROM public.icplc_participants WHERE id = $1',
        [p.data.id]
      )
      expect(pRes.rows[0].full_name).toBe('Protected Canonical')
      expect(pRes.rows[0].email).toBe('protected@local.test')
      expect(pRes.rows[0].registration_status).toBe('registered')
      expect(pRes.rows[0].override_fields).toMatchObject(overrides)
    })
  })

  // ══════════════════════════════════════════════════════════════════════════
  // Authorization Matrix (real auth users via admin.auth.admin.createUser)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Authorization Matrix', () => {
    let authUsers = {}
    let sprintId = null
    let allowedTeamId = null
    let financeTeamId = null
    let transportTeamId = null
    let accommodationTeamId = null
    let hospitalityTeamId = null

    beforeAll(async () => {
      authUsers.superAdmin      = await createTestAuthUser('auth_super@local.test',     'Password123!', 'super_admin')
      authUsers.regionalSec     = await createTestAuthUser('auth_regional@local.test',  'Password123!', 'regional_secretary')
      authUsers.sprintWriter    = await createTestAuthUser('auth_sprint@local.test',    'Password123!', 'member')
      authUsers.ordinary        = await createTestAuthUser('auth_ordinary@local.test',  'Password123!', 'member')
      authUsers.financeUser     = await createTestAuthUser('auth_finance@local.test',   'Password123!', 'member')
      authUsers.transportUser   = await createTestAuthUser('auth_transport@local.test', 'Password123!', 'member')
      authUsers.accomUser       = await createTestAuthUser('auth_accom@local.test',     'Password123!', 'member')
      authUsers.hospitalUser    = await createTestAuthUser('auth_hospital@local.test',  'Password123!', 'member')

      // Sprint infrastructure for team-based auth
      await pgInsert('event_configs', {
        id: SPRINT_EVENT_ID, event_name: 'ICPLC Auth Test', sprint_pattern: '%ICPLC Auth Sprint%', is_active: false,
      })
      const sprint = await pgInsertReturning('sprints', { name: 'ICPLC Auth Sprint Alpha', status: 'planning', sprint_type: 'custom' })
      sprintId = sprint.data.id
      // Authorization follows the explicit event -> sprint link, never the name pattern.
      await pgExec('UPDATE public.event_configs SET sprint_id = $1 WHERE id = $2', [sprintId, SPRINT_EVENT_ID])

      const allowed = await pgInsertReturning('sprint_teams', { sprint_id: sprintId, name: 'Delegate Relations' })
      allowedTeamId = allowed.data.id
      const finance = await pgInsertReturning('sprint_teams', { sprint_id: sprintId, name: 'Finance Team' })
      financeTeamId = finance.data.id
      const transport = await pgInsertReturning('sprint_teams', { sprint_id: sprintId, name: 'Transportation Team' })
      transportTeamId = transport.data.id
      const accom = await pgInsertReturning('sprint_teams', { sprint_id: sprintId, name: 'Accommodation Team' })
      accommodationTeamId = accom.data.id
      const hospital = await pgInsertReturning('sprint_teams', { sprint_id: sprintId, name: 'Hospitality Team' })
      hospitalityTeamId = hospital.data.id

      // Assign team members
      await pgInsert('sprint_team_members', { team_id: allowedTeamId,      user_id: authUsers.sprintWriter.userId })
      await pgInsert('sprint_team_members', { team_id: financeTeamId,       user_id: authUsers.financeUser.userId })
      await pgInsert('sprint_team_members', { team_id: transportTeamId,     user_id: authUsers.transportUser.userId })
      await pgInsert('sprint_team_members', { team_id: accommodationTeamId, user_id: authUsers.accomUser.userId })
      await pgInsert('sprint_team_members', { team_id: hospitalityTeamId,   user_id: authUsers.hospitalUser.userId })
    })

    afterAll(async () => {
      // Clean sprint infrastructure
      if (sprintId) {
        await pgExec('DELETE FROM public.sprint_team_members WHERE team_id = ANY($1)', [[allowedTeamId, financeTeamId, transportTeamId, accommodationTeamId, hospitalityTeamId].filter(Boolean)])
        await pgExec('DELETE FROM public.sprint_teams WHERE sprint_id = $1', [sprintId])
        await pgExec('DELETE FROM public.sprints WHERE id = $1', [sprintId])
      }
      // Remove any ICPLC rows referencing SPRINT_EVENT_ID before dropping the event_config (FK)
      await pgExec('DELETE FROM public.icplc_email_claims   WHERE event_id = $1', [SPRINT_EVENT_ID])
      await pgExec('DELETE FROM public.icplc_identity_maps  WHERE event_id = $1', [SPRINT_EVENT_ID])
      await pgExec('DELETE FROM public.icplc_import_batches WHERE event_id = $1', [SPRINT_EVENT_ID])
      await pgExec('DELETE FROM public.icplc_participants   WHERE event_id = $1', [SPRINT_EVENT_ID])
      await pgExec('DELETE FROM public.event_configs WHERE id = $1', [SPRINT_EVENT_ID])

      // Delete auth users (cascade deletes public.users rows)
      for (const u of Object.values(authUsers)) {
        await deleteAuthUser(u.userId).catch(() => {})
      }
    })

    // The batch (and its participants) belong to `eventId`. Authorization is evaluated for THAT event, so a sprint
    // writer is only allowed on the event whose sprint their team belongs to (SPRINT_EVENT_ID).
    async function freshBatch(eventId = TEST_EVENT_ID) {
      const regKey = 'REG-AUTH-' + Math.random().toString(36).slice(2, 8)
      const p = await pgInsertReturning('icplc_participants', {
        event_id: eventId, full_name: 'Auth Test', registration_status: 'unknown',
      })
      await pgInsertReturning('icplc_identity_maps', {
        event_id: eventId, source_type: 'registration_csv',
        source_key: regKey, participant_id: p.data.id,
      })
      const { batchId } = await parseAndPreview(eventId, [
        { 'Registration ID': regKey, 'First Name': 'Auth', 'Last Name': 'Test', 'Registered': 'Yes' },
      ])
      return { batchId, participantId: p.data.id }
    }

    async function parseOnly(client, regKey = 'REG-AUTH-PARSE-' + Math.random().toString(36).slice(2, 8)) {
      return client.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID,
        p_csv_text: buildCSV([{ 'Registration ID': regKey, 'First Name': 'Auth', 'Last Name': 'Parse', 'Registered': 'Yes' }]),
        p_imported_by: TEST_USER_ID,
      })
    }

    async function unmatchedRowForResolve() {
      const { data: parseResult, error: pe } = await superAdmin.client.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID,
        p_csv_text: buildCSV([{ 'Registration ID': '', 'Email': '', 'First Name': 'Unmatched', 'Last Name': 'Resolve', 'Registered': 'Yes' }]),
        p_imported_by: superAdmin.userId,
      })
      expect(pe).toBeNull()
      const batchId = parseResult[0].batch_id
      const { error: pre } = await superAdmin.client.rpc('icplc_preview_registration_import', { p_batch_id: batchId })
      expect(pre).toBeNull()
      const rows = await pgExec(
        'SELECT id, match_status, participant_id FROM public.icplc_import_rows WHERE batch_id = $1',
        [batchId]
      )
      return { batchId, rowId: rows.rows[0].id }
    }

    async function expectDeniedParseUnchanged(client) {
      const before = await pgExec('SELECT COUNT(*) FROM public.icplc_import_batches WHERE event_id = $1', [TEST_EVENT_ID])
      const { data, error } = await parseOnly(client)
      expect(error).not.toBeNull()
      expect(data).toBeNull()
      const after = await pgExec('SELECT COUNT(*) FROM public.icplc_import_batches WHERE event_id = $1', [TEST_EVENT_ID])
      expect(after.rows[0].count).toBe(before.rows[0].count)
    }

    async function expectDeniedPreviewUnchanged(client) {
      const { data: parseResult, error: pe } = await superAdmin.client.rpc('icplc_parse_registration_csv', {
        p_event_id: TEST_EVENT_ID,
        p_csv_text: buildCSV([{ 'Registration ID': '', 'Email': '', 'First Name': 'Preview', 'Last Name': 'Denied', 'Registered': 'Yes' }]),
        p_imported_by: superAdmin.userId,
      })
      expect(pe).toBeNull()
      const batchId = parseResult[0].batch_id
      const before = await pgExec('SELECT status, preview_computed_at FROM public.icplc_import_batches WHERE id = $1', [batchId])
      const { data, error } = await client.rpc('icplc_preview_registration_import', { p_batch_id: batchId })
      expect(error).not.toBeNull()
      expect(data).toBeNull()
      const after = await pgExec('SELECT status, preview_computed_at FROM public.icplc_import_batches WHERE id = $1', [batchId])
      expect(after.rows[0]).toEqual(before.rows[0])
    }

    async function expectDeniedResolveUnchanged(client) {
      const { rowId } = await unmatchedRowForResolve()
      const p = await pgInsertReturning('icplc_participants', {
        event_id: TEST_EVENT_ID, full_name: 'Denied Resolve Target', registration_status: 'unknown',
      })
      const before = await pgExec('SELECT match_status, participant_id, apply_status FROM public.icplc_import_rows WHERE id = $1', [rowId])
      const { data, error } = await client.rpc('icplc_resolve_unmatched_row', {
        p_row_id: rowId,
        p_action: 'link_existing',
        p_participant_id: p.data.id,
        p_resolved_by: authUsers.ordinary.userId,
      })
      expect(error).not.toBeNull()
      expect(data).toBeNull()
      const after = await pgExec('SELECT match_status, participant_id, apply_status FROM public.icplc_import_rows WHERE id = $1', [rowId])
      expect(after.rows[0]).toEqual(before.rows[0])
    }

    it('super_admin → ALLOWED', async () => {
      const { batchId, participantId } = await freshBatch()
      const { data, error } = await authUsers.superAdmin.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: authUsers.superAdmin.userId }
      )
      expect(error).toBeNull()
      expect(data[0].applied_rows).toBeGreaterThanOrEqual(1)
    })

    it('regional_secretary → ALLOWED', async () => {
      const { batchId } = await freshBatch()
      const { data, error } = await authUsers.regionalSec.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: authUsers.regionalSec.userId }
      )
      expect(error).toBeNull()
      expect(data[0].applied_rows).toBeGreaterThanOrEqual(1)
    })

    it('sprint-writer in allowed team → ALLOWED (for the event whose sprint their team belongs to)', async () => {
      const { batchId } = await freshBatch(SPRINT_EVENT_ID)
      const { data, error } = await authUsers.sprintWriter.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: authUsers.sprintWriter.userId }
      )
      expect(error).toBeNull()
      expect(data[0].applied_rows).toBeGreaterThanOrEqual(1)
    })

    it('sprint-writer in allowed team on ANOTHER event\'s batch → DENIED (membership in one event never authorizes another)', async () => {
      const { batchId } = await freshBatch(TEST_EVENT_ID)
      const { error } = await authUsers.sprintWriter.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: authUsers.sprintWriter.userId }
      )
      expect(error).not.toBeNull()
      expect(error.message).toMatch(/Insufficient authorization/i)
    })

    it('ordinary member (no sprint team) → DENIED', async () => {
      const { batchId } = await freshBatch()
      const { error } = await authUsers.ordinary.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: authUsers.ordinary.userId }
      )
      expect(error).not.toBeNull()
      expect(error.message).toMatch(/Insufficient authorization/i)
    })

    it('Finance team member → DENIED', async () => {
      const { batchId } = await freshBatch()
      const { error } = await authUsers.financeUser.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: authUsers.financeUser.userId }
      )
      expect(error).not.toBeNull()
      expect(error.message).toMatch(/Insufficient authorization/i)
    })

    it('Transportation team member → DENIED', async () => {
      const { batchId } = await freshBatch()
      const { error } = await authUsers.transportUser.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: authUsers.transportUser.userId }
      )
      expect(error).not.toBeNull()
      expect(error.message).toMatch(/Insufficient authorization/i)
    })

    it('Accommodation team member → DENIED', async () => {
      const { batchId } = await freshBatch()
      const { error } = await authUsers.accomUser.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: authUsers.accomUser.userId }
      )
      expect(error).not.toBeNull()
      expect(error.message).toMatch(/Insufficient authorization/i)
    })

    it('Hospitality team member → DENIED', async () => {
      const { batchId } = await freshBatch()
      const { error } = await authUsers.hospitalUser.client.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: authUsers.hospitalUser.userId }
      )
      expect(error).not.toBeNull()
      expect(error.message).toMatch(/Insufficient authorization/i)
    })

    it('anonymous (no JWT / anon key only) → DENIED (PostgREST rejects or auth check fails)', async () => {
      const { batchId } = await freshBatch()
      const anonOnly = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
      const { data, error } = await anonOnly.rpc(
        'icplc_apply_registration_import',
        { p_batch_id: batchId, p_applied_by: '00000000-0000-0000-0000-000000000000' }
      )
      // Must be denied: either JWT validation failure (PGRST301) or authorization check
      expect(error).not.toBeNull()
      expect(data).toBeNull()
    })

    it('ordinary member denied for parse/preview/resolve mutating RPCs with state unchanged', async () => {
      await expectDeniedParseUnchanged(authUsers.ordinary.client)
      await expectDeniedPreviewUnchanged(authUsers.ordinary.client)
      await expectDeniedResolveUnchanged(authUsers.ordinary.client)
    })
  })
})
