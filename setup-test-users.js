import { createClient } from '@supabase/supabase-js'

const API_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const test = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } })

const TEST_USER_ID = '00000000-0000-0000-0000-000000000099'
const TEST_USER_EMAIL = 'test-icplc@example.com'

async function setup() {
  console.log('Setting up test users...\n')

  try {
    // Create auth user
    console.log('1. Auth user...')
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      user_id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      password: 'Test@123456',
      email_confirm: true,
    })

    if (authErr && !authErr.message.includes('already')) {
      console.error('✗', authErr.message)
      return false
    }
    console.log(authErr ? '  ✓ exists' : '  ✓ created')

    // Create DB user record
    console.log('2. Database record...')
    const { error: dbErr } = await admin
      .from('users')
      .upsert({
        id: TEST_USER_ID,
        email: TEST_USER_EMAIL,
        role: 'super_admin',
        name: 'Test ICPLC',
        status: 'active',
        created_at: new Date().toISOString(),
        activated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (dbErr) {
      console.error('✗', dbErr.message)
      return false
    }
    console.log('  ✓ ready')

    // Test auth
    console.log('3. Authentication...')
    const { error: signinErr } = await test.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: 'Test@123456',
    })

    if (signinErr) {
      console.error('✗', signinErr.message)
      return false
    }
    console.log('  ✓ works')

    // Test ICPLC access
    console.log('4. ICPLC access...')
    const { error: queryErr } = await test
      .from('icplc_participants')
      .select('count(*)', { count: 'exact', head: true })

    if (queryErr) {
      console.error('✗', queryErr.message)
      return false
    }
    console.log('  ✓ granted')

    console.log('\n✓ Ready for tests\n')
    return true
  } catch (e) {
    console.error('✗', e.message)
    return false
  }
}

setup().then(ok => process.exit(ok ? 0 : 1))
