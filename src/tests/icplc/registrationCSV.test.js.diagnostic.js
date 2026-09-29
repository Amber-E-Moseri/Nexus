import { createClient } from '@supabase/supabase-js'

const TEST_EVENT_ID = '00000000-0000-0000-0000-000000009001'
const TEST_PARTICIPANT_ID = '00000000-0000-0000-0000-000000009101'
const TEST_REGISTRATION_ID = 'REG-DIAGNOSTIC-001'
const TEST_EMAIL = 'diag@test.local'

const API_URL = 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function diagnose() {
  console.log('\n=== REGISTRATION IDENTITY VISIBILITY AUDIT ===\n')

  // Cleanup old data
  await admin.from('icplc_email_claims').delete().eq('event_id', TEST_EVENT_ID)
  await admin.from('icplc_identity_maps').delete().eq('event_id', TEST_EVENT_ID)
  await admin.from('icplc_participants').delete().eq('event_id', TEST_EVENT_ID)
  await admin.from('event_configs').delete().eq('id', TEST_EVENT_ID)

  // Setup event
  console.log('1. SETUP EVENT')
  const { data: evt, error: evtErr } = await admin.from('event_configs').insert({
    id: TEST_EVENT_ID, event_name: 'Diagnostic', sprint_pattern: 'diag', is_active: false
  }).select().single()
  if (evtErr) { console.error('❌ Event insert failed:', evtErr); return }
  console.log('✅ Event created:', evt.id)

  // Setup participant
  console.log('\n2. SETUP PARTICIPANT')
  const { data: p, error: pErr } = await admin.from('icplc_participants').insert({
    id: TEST_PARTICIPANT_ID, event_id: TEST_EVENT_ID, full_name: 'Diagnostic', registration_status: 'unknown'
  }).select().single()
  if (pErr) { console.error('❌ Participant insert failed:', pErr); return }
  console.log('✅ Participant created:', p.id)

  // Insert identity map
  console.log('\n3. INSERT IDENTITY MAP')
  const { data: map, error: mapErr } = await admin.from('icplc_identity_maps').insert({
    event_id: TEST_EVENT_ID, source_type: 'registration_csv', source_key: TEST_REGISTRATION_ID, participant_id: TEST_PARTICIPANT_ID
  }).select().single()
  if (mapErr) { console.error('❌ Map insert failed:', mapErr); return }
  console.log('✅ Map created:', map.id)

  // Query via Supabase API
  console.log('\n4. QUERY IDENTITY MAP VIA SUPABASE API')
  const { data: apiMaps, error: apiErr } = await admin.from('icplc_identity_maps').select('*').eq('event_id', TEST_EVENT_ID).eq('source_key', TEST_REGISTRATION_ID)
  if (apiErr) console.error('❌ API query error:', apiErr)
  console.log('✅ API query result:', apiMaps ? `${apiMaps.length} rows` : 'null')
  if (apiMaps && apiMaps.length > 0) {
    console.log('   First row:', { event_id: apiMaps[0].event_id, source_key: apiMaps[0].source_key, participant_id: apiMaps[0].participant_id })
  }

  // Call RPC
  console.log('\n5. CALL icplc_match_registration_identity RPC')
  const { data: rpcResult, error: rpcErr } = await admin.rpc('icplc_match_registration_identity', {
    p_event_id: TEST_EVENT_ID, p_raw_payload: { 'Registration ID': TEST_REGISTRATION_ID }
  })
  if (rpcErr) console.error('❌ RPC error:', rpcErr)
  console.log('✅ RPC result:', rpcResult ? `${rpcResult.length} rows` : 'null')
  if (rpcResult && rpcResult.length > 0) {
    console.log('   First result:', { participant_id: rpcResult[0].participant_id, match_status: rpcResult[0].match_status })
  }

  console.log('\n=== END AUDIT ===\n')
}

diagnose().catch(e => console.error('Fatal:', e))
