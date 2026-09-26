import { createClient } from "@supabase/supabase-js"

const URL = 'http://127.0.0.1:54321'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const TIERS = [
  { name: 'super_admin',        email: 'cert-super_admin@icplc.test',        expect_read: true,  expect_write: true  },
  { name: 'regional_secretary', email: 'cert-regional_secretary@icplc.test', expect_read: true,  expect_write: true  },
  { name: 'programs',           email: 'cert-programs@icplc.test',           expect_read: true,  expect_write: true  },
  { name: 'registration',       email: 'cert-registration@icplc.test',       expect_read: true,  expect_write: true  },
  { name: 'accommodation',      email: 'cert-accommodation@icplc.test',      expect_read: true,  expect_write: false },
  { name: 'hospitality',        email: 'cert-hospitality@icplc.test',        expect_read: true,  expect_write: false },
  { name: 'transportation',     email: 'cert-transportation@icplc.test',     expect_read: true,  expect_write: false },
  { name: 'finance',            email: 'cert-finance@icplc.test',            expect_read: false, expect_write: false },
  { name: 'unrelated',          email: 'cert-unrelated@icplc.test',          expect_read: false, expect_write: false },
]

const EVENT_ID_QUERY = async (admin) => {
  const { data } = await admin.from('event_configs').select('id').eq('event_name', 'ICPLC CERT 2026').single()
  return data?.id
}

async function runRLSMatrix() {
  const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })
  const eventId = await EVENT_ID_QUERY(admin)
  console.log('Event ID:', eventId)

  const results = []

  for (const tier of TIERS) {
    // Get JWT via sign-in
    const { data: signIn, error: signInErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: tier.email,
    })
    if (signInErr) { console.error(`${tier.name}: generateLink failed:`, signInErr.message); continue }

    // Sign in with password to get real JWT
    const anonClient = createClient(URL, ANON_KEY, { auth: { persistSession: false } })
    const { data: session, error: authErr } = await anonClient.auth.signInWithPassword({
      email: tier.email,
      password: 'cert-pass-1234'
    })
    if (authErr) { console.error(`${tier.name}: signIn failed:`, authErr.message); continue }

    const jwt = session.session.access_token
    const userClient = createClient(URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } }
    })

    // Test 1: SELECT from icplc_participants
    const { data: readData, error: readErr } = await userClient
      .from('icplc_participants')
      .select('id,full_name')
      .eq('event_id', eventId)

    const canRead = !readErr && Array.isArray(readData) && readData.length > 0
    const readResult = tier.expect_read
      ? (canRead ? 'PASS' : `FAIL (expected rows, got ${readErr?.message || 'empty'}`)
      : (!canRead ? 'PASS' : `FAIL (expected blocked, got ${readData?.length} rows)`)

    // Test 2: INSERT into icplc_participants
    const { data: writeData, error: writeErr } = await userClient
      .from('icplc_participants')
      .insert({ event_id: eventId, full_name: `${tier.name} probe`, email: `${tier.name}-probe@cert.test` })
      .select('id')
      .single()

    const canWrite = !writeErr && !!writeData?.id
    const writeResult = tier.expect_write
      ? (canWrite ? 'PASS' : `FAIL (expected write, got ${writeErr?.message}`)
      : (!canWrite ? 'PASS' : `FAIL (expected blocked, inserted ${writeData?.id})`)

    // Clean up any probe row
    if (canWrite && writeData?.id) {
      await admin.from('icplc_participants').delete().eq('id', writeData.id)
    }

    results.push({ tier: tier.name, read: readResult, write: writeResult })
    console.log(`${tier.name.padEnd(22)} read=${readResult} write=${writeResult}`)
  }

  return results
}

runRLSMatrix().then(() => {
  console.log('\nRLS MATRIX COMPLETE')
  process.exit(0)
}).catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
