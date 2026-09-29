/**
 * Standalone local Supabase authentication probe
 *
 * Tests if the service-role credential works against the local API.
 * Does not modify any data; only reads configuration.
 */

import { createClient } from '@supabase/supabase-js'

const API_URL = 'http://127.0.0.1:54321'

// Get service-role key from environment
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('=== Local Supabase Auth Probe ===\n')
console.log(`API URL: ${API_URL}`)
console.log(`Credential type: SERVICE_ROLE_KEY`)
console.log(`Credential present: ${SERVICE_ROLE_KEY ? 'yes' : 'no'}`)
console.log(`Credential length: ${SERVICE_ROLE_KEY ? SERVICE_ROLE_KEY.length : 0}`)

if (!SERVICE_ROLE_KEY) {
  console.error('\n✗ ERROR: SUPABASE_SERVICE_ROLE_KEY not set in environment')
  process.exit(1)
}

try {
  console.log('\nCreating Supabase client...')
  const supabase = createClient(API_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  console.log('✓ Client created')

  console.log('\nAttempting minimal auth check...')
  console.log('(Reading auth settings - should not require table access)')

  // This should work if credentials are valid
  const { data, error } = await supabase.auth.admin.listUsers()

  if (error) {
    console.error(`✗ FAILED: ${error.message}`)
    console.error(`  Code: ${error.code}`)
    process.exit(1)
  }

  if (data) {
    console.log(`✓ SUCCESS: Authenticated and retrieved ${data.users?.length ?? 0} users`)
    console.log('\nAuth works. Credential is valid.')
    process.exit(0)
  }
} catch (e) {
  console.error(`✗ EXCEPTION: ${e.message}`)
  console.error(e.stack)
  process.exit(1)
}
