/**
 * Live-DB check that the null-department uniqueness constraints on
 * task_status_definitions actually reject a duplicate -- not just that an
 * index with the right name exists. This is the check that would have
 * caught the corruption fixed by migration
 * 20270723000004_restore_canonical_status_department_scope.sql, where the
 * canonical "To Do" row's department_id had drifted off NULL with nothing
 * flagging it.
 *
 * Opt-in only: `npm run test` runs against the real linked project (no local
 * or staging Postgres is wired into this repo's test suite). Running an
 * INSERT against task_status_definitions on every CI run isn't something to
 * wire in silently; the helper function is self-cleaning either way, but
 * this file only runs when explicitly requested via
 * RUN_DB_INTEGRATION_TESTS=true, so it's a deliberate pre-deploy/manual
 * check rather than a routine mutation of production data on every push.
 */

import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true'
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!shouldRun)('task_status_definitions null-department uniqueness guard', () => {
  // Guarded (not created unconditionally): describe.skipIf still evaluates
  // this function body to register the (skipped) tests, so constructing the
  // client outside the `shouldRun` check would throw on every normal test
  // run, where SUPABASE_URL/SERVICE_ROLE_KEY aren't expected to be set.
  const supabase = shouldRun
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null

  it('rejects a duplicate null-department "To Do" status', async () => {
    const { data, error } = await supabase.rpc('test_assert_status_duplicate_rejected', {
      p_name: 'To Do',
      p_category: 'open',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('rejects a duplicate null-department "In Progress" status', async () => {
    const { data, error } = await supabase.rpc('test_assert_status_duplicate_rejected', {
      p_name: 'In Progress',
      p_category: 'in_progress',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it('rejects a duplicate null-department "Completed" status', async () => {
    const { data, error } = await supabase.rpc('test_assert_status_duplicate_rejected', {
      p_name: 'Completed',
      p_category: 'completed',
    })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })
})
