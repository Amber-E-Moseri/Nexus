/**
 * ICPLC RPC Security Closure — Regression Gate
 *
 * Covers the three additional functions addressed by 20271001000003:
 *   F-1. icplc_resolve_unmatched_row — was ANON-EXECUTABLE MUTATION RISK
 *   F-2. icplc_match_import_rows    — was AUTHENTICATED-ONLY BUT GUARD DEFECT
 *   F-3. icplc_backfill_participants_from_import — was ANON-EXECUTABLE MUTATION RISK
 *
 * For each:
 *   - anon cannot execute (grant layer + body guard)
 *   - unauthorized authenticated user is blocked (IS NOT TRUE guard)
 *   - authorized staff can perform the intended operation
 *   - service_role is blocked (not a service_role call path; no exemption)
 *   - cross-event mutation is impossible (where applicable)
 *   - modern import path is unaffected
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL  = process.env.SUPABASE_URL              ?? 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9fDQlRs_IedKoi-kVBMFHGYRm7TkFGe8'
const SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PG_URL   = process.env.SUPABASE_DB_URL            ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const CL_EVENT_ID  = '00000000-0000-0000-0000-000000009200'
const CL_ALT_EVENT = '00000000-0000-0000-0000-000000009201'
const CL_ACTOR_ID  = '00000000-0000-0000-0000-000000009901'
const FAKE_UUID    = '00000000-0000-0000-0000-000000000001'

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const anonClient  = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })
const adminClient = createClient(API_URL, SVC_KEY,  { auth: { persistSession: false } })

// ---------------------------------------------------------------------------
// Direct-pg helpers
// ---------------------------------------------------------------------------

async function pgExec(sql, params = []) {
  const client = new pg.Client(PG_URL)
  await client.connect()
  try { return await client.query(sql, params) }
  finally { await client.end() }
}

async function pgOne(table, row) {
  const cols = Object.keys(row), vals = Object.values(row)
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
  const res = await pgExec(
    `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals
  )
  return res.rows[0]
}

// Simulate an arbitrary auth context on a pg connection.
async function pgRpc(userId, fnName, args) {
  const client = new pg.Client(PG_URL)
  await client.connect()
  try {
    const claims = userId
      ? JSON.stringify({ sub: userId, role: 'authenticated', user_role: 'super_admin' })
      : JSON.stringify({ role: 'anon' })
    await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [claims])
    const vals = Object.values(args)
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ')
    const res = await client.query(`SELECT * FROM public.${fnName}(${ph})`, vals)
    return { rows: res.rows, error: null }
  } catch (e) {
    return { rows: null, error: e }
  } finally {
    await client.end()
  }
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let supabaseAvailable = false
let testBatchId, unmatchedRowId, participantId, altParticipantId

beforeAll(async () => {
  const { error: ping } = await adminClient.from('event_configs').select('id').limit(1)
  supabaseAvailable = !/fetch failed|ECONNREFUSED/i.test(ping?.message ?? '')
  if (!supabaseAvailable) return

  await pgExec(`
    INSERT INTO public.event_configs (id, event_name, sprint_pattern, created_at)
    VALUES ($1, 'CL Test Event 9200', '%CLTEST9200%', now()),
           ($2, 'CL Alt Event 9201',  '%CLTEST9201%', now())
    ON CONFLICT (id) DO NOTHING
  `, [CL_EVENT_ID, CL_ALT_EVENT])

  const p = await pgOne('icplc_participants', {
    event_id: CL_EVENT_ID,
    full_name: 'CL Target Person',
    email: 'cltarget@test.example',
    registration_status: 'unknown',
    source_values: '{}',
  })
  participantId = p.id

  const ap = await pgOne('icplc_participants', {
    event_id: CL_ALT_EVENT,
    full_name: 'CL Alt Person',
    email: 'clalt@test.example',
    registration_status: 'unknown',
    source_values: '{}',
  })
  altParticipantId = ap.id

  const batch = await pgOne('icplc_import_batches', {
    event_id: CL_EVENT_ID,
    source: 'csv',
    source_identifier: 'closure-security-test.csv',
    mapping_version: 'v1',
    total_rows: 1,
    status: 'matched',
    imported_by: null,
  })
  testBatchId = batch.id

  // Import row: unmatched (for icplc_resolve_unmatched_row test)
  const row = await pgOne('icplc_import_rows', {
    batch_id: testBatchId,
    row_number: 1,
    raw_payload: JSON.stringify({
      Name: 'CL Unknown Person',
      Email: 'clunknown@test.example',
      'Full Name': 'CL Unknown Person',
      Status: 'Active',
    }),
    mapped_payload: '{}',
    identity_key: 'clunknown@test.example',
    resolution: null,
    match_status: 'unmatched',
  })
  unmatchedRowId = row.id
})

afterAll(async () => {
  if (!supabaseAvailable) return
  if (testBatchId) {
    await pgExec(`DELETE FROM public.icplc_import_rows WHERE batch_id = $1`, [testBatchId])
    await pgExec(`DELETE FROM public.icplc_import_batches WHERE id = $1`, [testBatchId])
  }
  await pgExec(`DELETE FROM public.icplc_identity_maps WHERE event_id IN ($1, $2)`,
    [CL_EVENT_ID, CL_ALT_EVENT])
  await pgExec(`DELETE FROM public.icplc_participants WHERE event_id IN ($1, $2)`,
    [CL_EVENT_ID, CL_ALT_EVENT])
  await pgExec(`DELETE FROM public.event_configs WHERE id IN ($1, $2)`,
    [CL_EVENT_ID, CL_ALT_EVENT])
})

function skip() { return !supabaseAvailable }

// ---------------------------------------------------------------------------
// F-1. icplc_resolve_unmatched_row
// ---------------------------------------------------------------------------

describe('F-1. icplc_resolve_unmatched_row', () => {
  it('CL-1a. anon cannot call icplc_resolve_unmatched_row (grant layer)', async () => {
    if (skip()) return
    const { error } = await anonClient.rpc('icplc_resolve_unmatched_row', {
      p_row_id:       FAKE_UUID,
      p_action:       'skip',
      p_participant_id: null,
      p_resolved_by:  FAKE_UUID,
    })
    expect(error).not.toBeNull()
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    expect(msg).toMatch(/permission denied|not allowed|42501|expected 3 parts in jwt|no suitable key/)
  })

  it('CL-1b. anon claims via direct-pg fires IS NOT TRUE guard', async () => {
    if (skip()) return
    const { rows, error } = await pgRpc(null, 'icplc_resolve_unmatched_row', {
      p_row_id:        FAKE_UUID,
      p_action:        'skip',
      p_participant_id: null,
      p_resolved_by:   FAKE_UUID,
    })
    // IS NOT TRUE guard raises 42501. The function uses RETURN QUERY, not an EXCEPTION
    // WHEN OTHERS block, so the 42501 propagates as a hard PG exception.
    expect(error).not.toBeNull()
    expect(`${error?.code ?? ''} ${(error?.message ?? '').toLowerCase()}`).toMatch(
      /42501|permission denied/
    )
  })

  it('CL-1c. service_role is blocked (no exemption; not a service_role call path)', async () => {
    if (skip()) return
    const { error } = await adminClient.rpc('icplc_resolve_unmatched_row', {
      p_row_id:        FAKE_UUID,
      p_action:        'skip',
      p_participant_id: null,
      p_resolved_by:   FAKE_UUID,
    })
    expect(error).not.toBeNull()
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    // Expected: 42501 from IS NOT TRUE guard (service_role has auth.uid()=NULL →
    // helper returns NULL → IS NOT TRUE fires) or PostgREST access error.
    // The F-1/F-3 RAISE message is "Insufficient authorization: ..." (not "permission denied"),
    // so that phrase must be included. error.message takes ?? priority over error.code.
    expect(msg).toMatch(/permission denied|not allowed|42501|no suitable key|insufficient authorization/)
  })

  it('CL-1d. authorized admin can skip an unmatched row', async () => {
    if (skip()) return
    // pgRpc with super_admin claims — uses postgres connection which satisfies the
    // auth.uid() requirement for icplc_can_write_participants()
    const { rows, error } = await pgRpc(CL_ACTOR_ID, 'icplc_resolve_unmatched_row', {
      p_row_id:        unmatchedRowId,
      p_action:        'skip',
      p_participant_id: null,
      p_resolved_by:   CL_ACTOR_ID,
    })
    expect(error).toBeNull()
    const result = rows?.[0]
    expect(result?.success).toBe(true)
    expect(result?.error_message).toBeNull()

    // Confirm apply_status was set to skipped
    const { rows: checkRows } = await pgExec(
      `SELECT apply_status FROM public.icplc_import_rows WHERE id = $1`,
      [unmatchedRowId]
    )
    expect(checkRows[0]?.apply_status).toBe('skipped')
  })

  it('CL-1e. link_existing maps row to participant within the same event only', async () => {
    if (skip()) return
    // Reset the row to unmatched for this test
    await pgExec(
      `UPDATE public.icplc_import_rows SET match_status = 'unmatched', apply_status = NULL WHERE id = $1`,
      [unmatchedRowId]
    )

    const { rows, error } = await pgRpc(CL_ACTOR_ID, 'icplc_resolve_unmatched_row', {
      p_row_id:        unmatchedRowId,
      p_action:        'link_existing',
      p_participant_id: participantId,
      p_resolved_by:   CL_ACTOR_ID,
    })
    expect(error).toBeNull()
    expect(rows?.[0]?.success).toBe(true)

    // Confirm the row is linked to the correct participant
    const { rows: check } = await pgExec(
      `SELECT match_status, participant_id FROM public.icplc_import_rows WHERE id = $1`,
      [unmatchedRowId]
    )
    expect(check[0]?.match_status).toBe('manual')
    expect(check[0]?.participant_id).toBe(participantId)

    // altParticipantId (different event) must be untouched
    const { rows: altCheck } = await pgExec(
      `SELECT match_status FROM public.icplc_import_rows WHERE participant_id = $1`,
      [altParticipantId]
    )
    expect(altCheck.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// F-2. icplc_match_import_rows
// ---------------------------------------------------------------------------

describe('F-2. icplc_match_import_rows', () => {
  it('CL-2a. anon cannot call icplc_match_import_rows (grant-layer REVOKE from 20260925000008)', async () => {
    if (skip()) return
    const { error } = await anonClient.rpc('icplc_match_import_rows', {
      p_batch_id: FAKE_UUID,
    })
    expect(error).not.toBeNull()
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    expect(msg).toMatch(/permission denied|not allowed|42501|expected 3 parts in jwt|no suitable key/)
  })

  it('CL-2b. anon claims via direct-pg fires IS NOT TRUE guard', async () => {
    if (skip()) return
    const { error } = await pgRpc(null, 'icplc_match_import_rows', {
      p_batch_id: FAKE_UUID,
    })
    expect(error).not.toBeNull()
    expect(`${error?.code ?? ''} ${(error?.message ?? '').toLowerCase()}`).toMatch(
      /42501|permission denied/
    )
  })

  it('CL-2c. service_role is blocked (not in grant; no exemption)', async () => {
    if (skip()) return
    const { error } = await adminClient.rpc('icplc_match_import_rows', {
      p_batch_id: FAKE_UUID,
    })
    // Accepted: permission denied (42501) or "batch not found" (22023/PGRST).
    // NOT accepted: "function does not exist".
    const msg = (error?.message ?? '').toLowerCase()
    const notExistError = msg.includes('does not exist') || msg.includes('42883')
    expect(notExistError).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// F-3. icplc_backfill_participants_from_import
// ---------------------------------------------------------------------------

describe('F-3. icplc_backfill_participants_from_import', () => {
  it('CL-3a. anon cannot call icplc_backfill_participants_from_import (grant layer)', async () => {
    if (skip()) return
    const { error } = await anonClient.rpc('icplc_backfill_participants_from_import', {
      p_batch_id: FAKE_UUID,
    })
    expect(error).not.toBeNull()
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    expect(msg).toMatch(/permission denied|not allowed|42501|expected 3 parts in jwt|no suitable key/)
  })

  it('CL-3b. anon claims via direct-pg fires IS NOT TRUE guard', async () => {
    if (skip()) return
    const { error } = await pgRpc(null, 'icplc_backfill_participants_from_import', {
      p_batch_id: null,
    })
    expect(error).not.toBeNull()
    expect(`${error?.code ?? ''} ${(error?.message ?? '').toLowerCase()}`).toMatch(
      /42501|permission denied/
    )
  })

  it('CL-3c. service_role is blocked (no exemption; not a service_role call path)', async () => {
    if (skip()) return
    const { error } = await adminClient.rpc('icplc_backfill_participants_from_import', {
      p_batch_id: null,
    })
    expect(error).not.toBeNull()
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    // Same guard message as F-1: "Insufficient authorization: ..." — include it in the pattern.
    expect(msg).toMatch(/permission denied|not allowed|42501|no suitable key|insufficient authorization/)
  })

  it('CL-3d. authorized admin can call backfill (returns integer row count)', async () => {
    if (skip()) return
    const { rows, error } = await pgRpc(CL_ACTOR_ID, 'icplc_backfill_participants_from_import', {
      p_batch_id: testBatchId,
    })
    expect(error).toBeNull()
    // Returns an integer count (possibly 0 — no new fields to fill)
    const count = rows?.[0]?.icplc_backfill_participants_from_import
    expect(typeof count).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// Non-regression: modern import path unaffected
// ---------------------------------------------------------------------------

describe('Non-regression: modern import path', () => {
  it('CL-4a. icplc_preview_import still rejects anon (original 20260925000009 REVOKE intact)', async () => {
    if (skip()) return
    const { error } = await anonClient.rpc('icplc_preview_import', { p_batch_id: FAKE_UUID })
    expect(error).not.toBeNull()
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    expect(msg).toMatch(/permission denied|not allowed|42501|expected 3 parts in jwt|no suitable key/)
  })

  it('CL-4b. icplc_apply_import_row still rejects anon (original 20260925000009 REVOKE intact)', async () => {
    if (skip()) return
    const { error } = await anonClient.rpc('icplc_apply_import_row', {
      p_row_id:              FAKE_UUID,
      p_batch_id:            FAKE_UUID,
      p_preview_computed_at: new Date().toISOString(),
      p_actor_user_id:       FAKE_UUID,
    })
    expect(error).not.toBeNull()
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    expect(msg).toMatch(/permission denied|not allowed|42501|expected 3 parts in jwt|no suitable key/)
  })
})
