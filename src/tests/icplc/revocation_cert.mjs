import { createClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54321'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const PROGRAMS_ID = 'cc14f82d-79dd-45f8-91fb-686ce8bf364f'

async function main() {
  const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Step 1: programs user signs in, verifies they can read participants
  const anon = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: sessionBefore } = await anon.auth.signInWithPassword({
    email: 'cert-programs@icplc.test', password: 'cert-pass-1234'
  })
  const jwtBefore = sessionBefore.session.access_token
  const userClientBefore = createClient(URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwtBefore}` } }
  })
  const { data: readBefore, error: errBefore } = await userClientBefore
    .from('icplc_participants').select('id').limit(1)
  const canReadBefore = !errBefore && readBefore?.length > 0
  console.log(`REVOCATION-1 (before removal): programs can read = ${canReadBefore} → ${canReadBefore ? 'PASS' : 'FAIL (expected true)'}`)

  // Step 2: Remove programs user from sprint_team_members
  const { error: removeErr } = await admin
    .from('sprint_team_members')
    .delete()
    .eq('user_id', PROGRAMS_ID)
  if (removeErr) { console.error('Failed to remove team member:', removeErr.message); process.exit(1) }
  console.log('REVOCATION-2: Removed programs user from sprint_team_members')

  // Step 3: Same JWT — re-query (RLS is live, no cache)
  // RLS helper functions are STABLE, not IMMUTABLE, so they re-evaluate per statement
  const { data: readAfterSameJWT, error: errAfterSameJWT } = await userClientBefore
    .from('icplc_participants').select('id').limit(1)
  const blockedAfterSameJWT = !errAfterSameJWT ? (readAfterSameJWT?.length === 0) : true
  console.log(`REVOCATION-3 (same JWT, post-removal): blocked = ${blockedAfterSameJWT} → ${blockedAfterSameJWT ? 'PASS' : 'FAIL (expected empty, got ' + JSON.stringify(readAfterSameJWT) + ')'}`)

  // Step 4: New sign-in → new JWT → still blocked
  const anon2 = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
  const { data: sessionAfter } = await anon2.auth.signInWithPassword({
    email: 'cert-programs@icplc.test', password: 'cert-pass-1234'
  })
  const jwtAfter = sessionAfter.session.access_token
  const userClientAfter = createClient(URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwtAfter}` } }
  })
  const { data: readAfterNewJWT, error: errAfterNewJWT } = await userClientAfter
    .from('icplc_participants').select('id').limit(1)
  const blockedAfterNewJWT = !errAfterNewJWT ? (readAfterNewJWT?.length === 0) : true
  console.log(`REVOCATION-4 (new JWT, post-removal): blocked = ${blockedAfterNewJWT} → ${blockedAfterNewJWT ? 'PASS' : 'FAIL (expected empty, got ' + JSON.stringify(readAfterNewJWT) + ')'}`)

  console.log('\nREVOCATION GATE COMPLETE')
}

main().catch(e => { console.error(e); process.exit(1) })
