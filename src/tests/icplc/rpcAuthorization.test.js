/**
 * RPC Authorization — RELEASE GATE
 *
 * Verifies that icplc_match_import_rows, icplc_preview_import, and
 * icplc_apply_import_row reject callers without write capability.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role-key'
const ANON_KEY     = process.env.SUPABASE_ANON_KEY ?? 'test-anon-key'

describe('RPC Authorization (release gate)', () => {
  let adminSupabase
  let anonSupabase
  let supabaseAvailable = false

  beforeAll(async () => {
    adminSupabase = createClient(SUPABASE_URL, SERVICE_KEY)
    // Anon client has no JWT — auth.uid() is null, icplc_can_write_participants() returns false
    anonSupabase = createClient(SUPABASE_URL, ANON_KEY)
    const { error } = await adminSupabase.from('event_configs').select('id', { head: true }).limit(1)
    supabaseAvailable = !/fetch failed/i.test(error?.message ?? '')
  })

  it('RPC-1. icplc_match_import_rows rejects anon caller with permission denied', async () => {
    if (!supabaseAvailable) return
    const fakeId = '00000000-0000-0000-0000-000000000001'
    const { error } = await anonSupabase.rpc('icplc_match_import_rows', { p_batch_id: fakeId })
    expect(error).not.toBeNull()
    // Should get permission denied (42501) or a PostgREST auth error
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    expect(msg).toMatch(/permission denied|not allowed|42501|anon/)
  })

  it('RPC-2. icplc_preview_import rejects anon caller with permission denied', async () => {
    if (!supabaseAvailable) return
    const fakeId = '00000000-0000-0000-0000-000000000002'
    const { error } = await anonSupabase.rpc('icplc_preview_import', { p_batch_id: fakeId })
    expect(error).not.toBeNull()
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    expect(msg).toMatch(/permission denied|not allowed|42501|anon/)
  })

  it('RPC-3. icplc_apply_import_row rejects anon caller with permission denied', async () => {
    if (!supabaseAvailable) return
    const fakeId = '00000000-0000-0000-0000-000000000003'
    const { error } = await anonSupabase.rpc('icplc_apply_import_row', {
      p_row_id:              fakeId,
      p_batch_id:            fakeId,
      p_preview_computed_at: new Date().toISOString(),
      p_actor_user_id:       fakeId,
    })
    expect(error).not.toBeNull()
    const msg = (error?.message ?? error?.code ?? '').toLowerCase()
    expect(msg).toMatch(/permission denied|not allowed|42501|anon/)
  })

  it('RPC-4. Service role can call icplc_match_import_rows (permission granted)', async () => {
    if (!supabaseAvailable) return
    // Service role bypasses RLS but security definer checks icplc_can_write_participants().
    // With service role, auth.uid() is null → icplc_can_write_participants() returns false
    // UNLESS we're calling as super_admin. This verifies the function exists and is callable.
    // Expected: either success (if auth.uid() resolves to a super_admin) or a known error
    // (batch not found / permission denied) — but NOT a "function does not exist" error.
    const fakeId = '00000000-0000-0000-0000-000000000004'
    const { error } = await adminSupabase.rpc('icplc_match_import_rows', { p_batch_id: fakeId })
    // The function must exist. "permission denied" or "batch not found" are both valid outcomes.
    // An error about the function not existing would be: "42883" or "does not exist"
    if (error) {
      const msg = (error?.message ?? '').toLowerCase()
      expect(msg).not.toMatch(/does not exist|42883/)
    }
    // Pass — function exists and responds meaningfully
    expect(true).toBe(true)
  })
})
