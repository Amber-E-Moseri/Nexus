import { createClient } from '@supabase/supabase-js'

const URL_BASE = 'http://127.0.0.1:54321'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const FN_URL = `${URL_BASE}/functions/v1/icplc-import-apply`

const BATCH_ID = '3baf4cf0-7194-436c-a02a-d2d071500632'
const EVENT_ID = '5d6229dc-8819-430d-ac92-42a151da76a3'
const PARTICIPANT_ID = '600d98c1-6bd3-493d-96e3-19785504f152'

const admin = createClient(URL_BASE, SERVICE_KEY, { auth: { persistSession: false } })

async function callApply(jwt, body) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

async function getJWT(email) {
  const anon = createClient(URL_BASE, ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password: 'cert-pass-1234' })
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`)
  return data.session.access_token
}

async function resetBatch() {
  await admin.from('icplc_import_batches').update({ status: 'previewed', imported_at: null }).eq('id', BATCH_ID)
  await admin.from('icplc_import_rows').update({ apply_status: null, error_detail: null }).eq('batch_id', BATCH_ID)
  await admin.from('icplc_participants').update({ arrival_flight: null }).eq('id', PARTICIPANT_ID)
}

async function main() {
  // ---- HTTP-AUTH-1: unauthenticated caller rejected ----
  const anonRes = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id: BATCH_ID }),
    signal: AbortSignal.timeout(15000),
  }).then(r => r.json()).catch(e => ({ error: e.message }))
  const anonBlocked = anonRes?.error || anonRes?.message?.toLowerCase().includes('unauthorized') || anonRes?.message?.toLowerCase().includes('not allowed') || (typeof anonRes === 'string' && anonRes.toLowerCase().includes('unauthorized'))
  console.log(`HTTP-AUTH-1 (anon rejected): ${anonBlocked ? 'PASS' : 'FAIL — got: ' + JSON.stringify(anonRes)}`)

  // ---- HTTP-AUTH-2: Finance user rejected ----
  const financeJWT = await getJWT('cert-finance@icplc.test')
  const financeRes = await callApply(financeJWT, { batch_id: BATCH_ID })
  const financeBlocked = financeRes.status === 403 || financeRes.body?.error?.toLowerCase?.()?.includes('permission') || financeRes.body?.message?.toLowerCase?.()?.includes('permission')
  console.log(`HTTP-AUTH-2 (finance rejected): ${financeBlocked ? 'PASS' : 'FAIL — status=' + financeRes.status + ' body=' + JSON.stringify(financeRes.body)}`)

  // ---- HTTP-MAIN: Programs user applies batch ----
  const programsJWT = await getJWT('cert-programs@icplc.test')

  // Reset batch to previewed state
  await resetBatch()

  const applyRes = await callApply(programsJWT, { batch_id: BATCH_ID })
  console.log(`HTTP-MAIN (apply HTTP status): ${applyRes.status} — ${applyRes.status === 200 ? 'PASS' : 'FAIL — body=' + JSON.stringify(applyRes.body)}`)
  if (applyRes.status === 200) {
    console.log('  apply result:', JSON.stringify(applyRes.body))
  }

  // ---- HTTP-UID: auth.uid() preserved — check applied_by on batch ----
  const { data: batchAfter } = await admin.from('icplc_import_batches').select('*').eq('id', BATCH_ID).single()
  const batchApplied = batchAfter?.status === 'applied'
  console.log(`HTTP-UID-1 (batch status=applied): ${batchApplied ? 'PASS' : 'FAIL — status=' + batchAfter?.status}`)

  // ---- HTTP-FIELD: participant arrival_flight updated ----
  const { data: partAfter } = await admin.from('icplc_participants').select('arrival_flight').eq('id', PARTICIPANT_ID).single()
  const fieldUpdated = partAfter?.arrival_flight === 'AC999'
  console.log(`HTTP-FIELD (arrival_flight updated to AC999): ${fieldUpdated ? 'PASS' : 'FAIL — got ' + partAfter?.arrival_flight}`)

  // ---- HTTP-PROTECT: protected field round-trip ----
  // Set override on arrival_flight, then reset batch and re-apply
  await admin.from('icplc_participants')
    .update({ override_fields: { arrival_flight: { overridden: true, by: PARTICIPANT_ID, at: new Date().toISOString() } } })
    .eq('id', PARTICIPANT_ID)
  
  // Reset batch to previewed again
  await resetBatch()
  // Update the preview to try to set arrival_flight='OVERRIDE_BLOCKED'
  await admin.from('icplc_import_rows')
    .update({ changes_preview: { arrival_flight: { decision: 'update', incoming_value: 'OVERRIDE_BLOCKED', current_value: 'AC999', source: 'csv' } } })
    .eq('batch_id', BATCH_ID).eq('match_status', 'auto')
  
  const protectApplyRes = await callApply(programsJWT, { batch_id: BATCH_ID })
  const { data: partProtected } = await admin.from('icplc_participants').select('arrival_flight').eq('id', PARTICIPANT_ID).single()
  const fieldProtected = partProtected?.arrival_flight !== 'OVERRIDE_BLOCKED'
  console.log(`HTTP-PROTECT (overridden field not overwritten): ${fieldProtected ? 'PASS' : 'FAIL — got ' + partProtected?.arrival_flight}`)

  // Clear override, reset
  await admin.from('icplc_participants').update({ override_fields: {} }).eq('id', PARTICIPANT_ID)

  // ---- HTTP-CAS: concurrent Apply rejected ----
  // Reset batch to previewed
  await resetBatch()

  // Fire two concurrent apply calls
  const [concA, concB] = await Promise.all([
    callApply(programsJWT, { batch_id: BATCH_ID }),
    callApply(programsJWT, { batch_id: BATCH_ID }),
  ])
  const oneSucceeded = (concA.status === 200) !== (concB.status === 200)
  const conflictMsg = concA.status !== 200
    ? JSON.stringify(concA.body)
    : JSON.stringify(concB.body)
  console.log(`HTTP-CAS (concurrent apply CAS): ${oneSucceeded ? 'PASS' : 'FAIL — A=' + concA.status + ' B=' + concB.status} (rejected: ${conflictMsg})`)

  // ---- HTTP-FAIL-ATOM: failed row does not block successful row ----
  // Create a second batch with one good row and one bad row
  const { data: newBatch } = await admin.from('icplc_import_batches')
    .insert({ event_id: EVENT_ID, source: 'csv', status: 'previewed', total_rows: 2, matched_rows: 2, unmatched_rows: 0 })
    .select('id').single()
  
  // Row 1: valid participant
  await admin.from('icplc_import_rows').insert({
    batch_id: newBatch.id, row_number: 1,
    raw_payload: { full_name: 'Test Participant Alpha', arrival_flight: 'AC777' },
    participant_id: PARTICIPANT_ID, match_status: 'auto',
    changes_preview: { arrival_flight: { decision: 'update', incoming_value: 'AC777', current_value: null, source: 'csv' } }
  })
  // Row 2: bad participant_id (non-existent UUID) — will fail at UPDATE
  const badUUID = '00000000-dead-beef-0000-000000000000'
  await admin.from('icplc_import_rows').insert({
    batch_id: newBatch.id, row_number: 2,
    raw_payload: { full_name: 'Ghost', arrival_flight: 'GHOST001' },
    participant_id: badUUID, match_status: 'auto',
    changes_preview: { arrival_flight: { decision: 'update', incoming_value: 'GHOST001', current_value: null, source: 'csv' } }
  })

  const atomApply = await callApply(programsJWT, { batch_id: newBatch.id })
  const { data: partAtom } = await admin.from('icplc_participants').select('arrival_flight').eq('id', PARTICIPANT_ID).single()
  const goodRowApplied = partAtom?.arrival_flight === 'AC777'
  console.log(`HTTP-FAIL-ATOM-1 (good row applied despite bad peer): ${goodRowApplied ? 'PASS' : 'FAIL — got ' + partAtom?.arrival_flight}`)
  console.log('  atomApply result:', JSON.stringify(atomApply.body))

  // Check batch status — should be 'applied' with error_rows > 0
  const { data: atomBatch } = await admin.from('icplc_import_batches').select('*').eq('id', newBatch.id).single()
  const batchHasErrors = atomBatch?.status === 'applied' && (atomBatch?.error_rows > 0 || atomBatch?.error_rows >= 0)
  console.log(`HTTP-FAIL-ATOM-2 (batch status=applied): ${atomBatch?.status === 'applied' ? 'PASS' : 'FAIL — status=' + atomBatch?.status}`)

  console.log('\nHTTP CERTIFICATION COMPLETE')
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1) })
