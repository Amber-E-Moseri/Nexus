import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import pg from 'pg'
import {
  CMP_FIELD_IDS,
  buildSourceValues,
  computeMutations,
  mergeSourceValues,
  mapCanadianStatus,
} from '../../features/icplc/lib/cmpDocumentation.js'
import { DOCUMENT_TYPE, deriveDocumentType } from '../../features/registration/icplcDocReadiness.js'

// DB-backed suite: each helper opens a fresh pg connection (~1-2s/test alone). Under the full
// parallel run the 5s default is exceeded by load, not by a race; give it headroom.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// Distinct from the registrationCSV* suites (9001/9002): vitest runs files in
// parallel against one DB, and each suite's cleanup deletes its own event rows.
const TEST_EVENT_ID = '00000000-0000-0000-0000-000000009401'
const ALT_EVENT_ID = '00000000-0000-0000-0000-000000009402'
const TEST_USER_ID = 'bd8b9e18-8d03-47f5-a66a-b83e58db7f8f'
const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

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
    vals,
  )
  return res.rows[0] || null
}

async function pgInsertReturning(table, row) {
  const cols = Object.keys(row), vals = Object.values(row)
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
  const res = await pgExec(
    `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${ph}) RETURNING *`,
    vals,
  )
  return res.rows[0]
}

function submission(id, answers = {}) {
  return {
    id,
    createdAt: '2026-09-28T00:00:00Z',
    submitterName: 'CMP Fixture',
    answers: {
      [CMP_FIELD_IDS.email]: '',
      [CMP_FIELD_IDS.firstName]: 'Cmp',
      [CMP_FIELD_IDS.lastName]: 'Fixture',
      [CMP_FIELD_IDS.phone]: '555-0100',
      [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
      [CMP_FIELD_IDS.passportRegion]: 'ECOWAS',
      [CMP_FIELD_IDS.canadianStatus]: 'Permanent Resident',
      [CMP_FIELD_IDS.canadianDocValidity]: 'Yes',
      [CMP_FIELD_IDS.assistanceRequested]: 'No',
      ...answers,
    },
  }
}

async function applyCmpDocumentation(sub, eventId = TEST_EVENT_ID) {
  const answers = sub.answers || {}
  const emailNorm = (answers[CMP_FIELD_IDS.email] || '').trim().toLowerCase() || null

  const map = await pgExec(
    `SELECT participant_id
     FROM public.icplc_identity_maps
     WHERE event_id = $1 AND source_type = 'cmp_documentation' AND source_key = $2`,
    [eventId, sub.id],
  )
  const mappedParticipantId = map.rows[0]?.participant_id || null

  let emailParticipantId = null
  if (emailNorm) {
    const claim = await pgExec(
      `SELECT participant_id
       FROM public.icplc_email_claims
       WHERE event_id = $1 AND normalized_email = $2`,
      [eventId, emailNorm],
    )
    emailParticipantId = claim.rows[0]?.participant_id || null
  }

  if (mappedParticipantId && emailParticipantId && mappedParticipantId !== emailParticipantId) {
    return { status: 'identity_conflict', participant_id: mappedParticipantId }
  }

  const participantId = mappedParticipantId || emailParticipantId
  if (!participantId) return { status: 'unmatched', participant_id: null }

  const participantRes = await pgExec(
    'SELECT * FROM public.icplc_participants WHERE id = $1 AND event_id = $2',
    [participantId, eventId],
  )
  const participant = participantRes.rows[0]
  if (!participant) return { status: 'error', issues: ['participant_not_found'] }

  const sourceValues = buildSourceValues(sub, answers)
  const mutations = computeMutations(participant, answers, sourceValues)
  if (mutations.unrecognized_passport_value || mutations.unrecognized_canadian_value
    || mutations.unrecognized_passport_region_value || mutations.unrecognized_doc_validity_value) {
    return { status: 'unknown_value', participant_id: participantId, mutations }
  }

  const nextSourceValues = mergeSourceValues(participant.source_values || {}, sourceValues)
  const updates = mutations.canonical
  await pgExec(
    `UPDATE public.icplc_participants
     SET passport_readiness = COALESCE($2, passport_readiness),
         canada_residency_status = COALESCE($3, canada_residency_status),
         source_values = $4,
         passport_region = COALESCE($5, passport_region),
         canada_status_document_readiness = COALESCE($6, canada_status_document_readiness)
     WHERE id = $1`,
    [
      participantId,
      updates.passport_readiness || null,
      updates.canada_residency_status || null,
      JSON.stringify(nextSourceValues),
      updates.passport_region || null,
      updates.canada_status_document_readiness || null,
    ],
  )
  await pgExec(
    `INSERT INTO public.icplc_identity_maps(event_id, source_type, source_key, participant_id)
     VALUES ($1, 'cmp_documentation', $2, $3)
     ON CONFLICT (event_id, source_type, source_key) DO NOTHING`,
    [eventId, sub.id, participantId],
  )

  return {
    status: Object.keys(updates).length ? 'matched_applied' : 'matched_source_only',
    participant_id: participantId,
    mutations,
  }
}

async function setupEvents() {
  await pgExec(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [TEST_USER_ID])
  await pgInsert('users', { id: TEST_USER_ID, email: 'cmpcert@local.test', name: 'CMP Cert', role: 'member' })
  await pgInsert('event_configs', { id: TEST_EVENT_ID, event_name: 'CMP Cert Event', sprint_pattern: 'cmp-cert', is_active: false })
  await pgInsert('event_configs', { id: ALT_EVENT_ID, event_name: 'CMP Cert Alt', sprint_pattern: 'cmp-alt', is_active: false })
}

async function cleanup() {
  for (const eid of [TEST_EVENT_ID, ALT_EVENT_ID]) {
    await pgExec('DELETE FROM public.icplc_email_claims WHERE event_id = $1', [eid])
    await pgExec('DELETE FROM public.icplc_identity_maps WHERE event_id = $1', [eid])
    await pgExec('DELETE FROM public.icplc_participants WHERE event_id = $1', [eid])
  }
}

describe('CMP documentation sync database certification', () => {
  beforeAll(async () => {
    await cleanup()
    await setupEvents()
  })
  afterEach(async () => { await cleanup() })

  it('writes Canadian status values accepted by documentation readiness helpers', async () => {
    const cases = [
      ['Canadian Citizen', 'CANADIAN_CITIZEN', DOCUMENT_TYPE.NONE],
      ['Permanent Resident', 'PERMANENT_RESIDENT', DOCUMENT_TYPE.PR_CARD],
      ['International Student / Study Permit Holder', 'INTERNATIONAL_STUDENT', DOCUMENT_TYPE.STUDY_PERMIT],
      ['Post-Graduation Work Permit Holder', 'POST_GRADUATION_WORKER', DOCUMENT_TYPE.PGWP],
      ['Visitor', 'VISITOR_OTHER', DOCUMENT_TYPE.REVIEW],
    ]
    for (const [raw, canonical, docType] of cases) {
      expect(mapCanadianStatus(raw)).toBe(canonical)
      expect(deriveDocumentType(canonical)).toBe(docType)
    }
  })

  it('applies only approved documentation fields and preserves prohibited canonical fields', async () => {
    const p = await pgInsertReturning('icplc_participants', {
      event_id: TEST_EVENT_ID,
      full_name: 'Original Name',
      email: 'owner@local.test',
      participation_status: 'confirmed',
      registration_status: 'registered',
      visa_requirement: 'required',
      visa_process_status: 'approved',
      passport_country: 'Ghana',
      passport_readiness: 'unknown',
      canada_residency_status: null,
      source_values: JSON.stringify({ unrelated: { value: 'keep' } }),
      override_fields: JSON.stringify({ passport_readiness: { overridden: true, source: 'manual' } }),
    })
    const result = await applyCmpDocumentation(submission('cmp-safe-write', {
      [CMP_FIELD_IDS.email]: 'OWNER@LOCAL.TEST',
      [CMP_FIELD_IDS.firstName]: 'Changed',
      [CMP_FIELD_IDS.lastName]: 'Name',
      [CMP_FIELD_IDS.phone]: '555-9999',
      [CMP_FIELD_IDS.passportRegion]: 'Non-ECOWAS',
      [CMP_FIELD_IDS.assistanceRequested]: 'Yes',
    }))

    expect(result.status).toBe('matched_applied')
    const row = (await pgExec('SELECT * FROM public.icplc_participants WHERE id = $1', [p.id])).rows[0]
    expect(row.full_name).toBe('Original Name')
    expect(row.email).toBe('owner@local.test')
    expect(row.participation_status).toBe('confirmed')
    expect(row.registration_status).toBe('registered')
    expect(row.visa_requirement).toBe('required')
    expect(row.visa_process_status).toBe('approved')
    expect(row.passport_country).toBe('Ghana')
    expect(row.passport_readiness).toBe('unknown')
    expect(row.canada_residency_status).toBe('PERMANENT_RESIDENT')
    expect(row.source_values.unrelated.value).toBe('keep')
    expect(row.source_values.cmp_documentation.email).toBe('OWNER@LOCAL.TEST')
    expect(row.source_values.cmp_documentation.phone).toBe('555-9999')
    expect(row.source_values.cmp_documentation.passport_region).toBe('Non-ECOWAS')
    // reported region and document validity are approved CMP fields; the country is not touched
    expect(row.passport_region).toBe('NON_ECOWAS')
    expect(row.canada_status_document_readiness).toBe('READY')
    expect(row.override_fields.passport_readiness.overridden).toBe(true)
  })

  it('maps document validity to readiness and passport region to its own field', async () => {
    const yes = await pgInsertReturning('icplc_participants', { event_id: TEST_EVENT_ID, full_name: 'Valid Doc', email: 'valid@local.test', canada_residency_status: 'PERMANENT_RESIDENT' })
    const no = await pgInsertReturning('icplc_participants', { event_id: TEST_EVENT_ID, full_name: 'Expiring Doc', email: 'expiring@local.test', canada_residency_status: 'PERMANENT_RESIDENT' })
    await applyCmpDocumentation(submission('cmp-validity-yes', { [CMP_FIELD_IDS.email]: 'valid@local.test', [CMP_FIELD_IDS.canadianDocValidity]: 'Yes', [CMP_FIELD_IDS.passportRegion]: 'ECOWAS' }))
    await applyCmpDocumentation(submission('cmp-validity-no', { [CMP_FIELD_IDS.email]: 'expiring@local.test', [CMP_FIELD_IDS.canadianDocValidity]: 'No', [CMP_FIELD_IDS.passportRegion]: 'Non-ECOWAS' }))
    const rows = (await pgExec('SELECT id, canada_status_document_readiness, passport_region, passport_country FROM public.icplc_participants WHERE id = ANY($1::uuid[])', [[yes.id, no.id]])).rows
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId[yes.id].canada_status_document_readiness).toBe('READY')
    expect(byId[yes.id].passport_region).toBe('ECOWAS')
    expect(byId[no.id].canada_status_document_readiness).toBe('RENEWAL_NEEDED')
    expect(byId[no.id].passport_region).toBe('NON_ECOWAS')
    expect(byId[yes.id].passport_country).toBeNull()
  })

  it('does not set a status-document readiness for Canadian citizens', async () => {
    const p = await pgInsertReturning('icplc_participants', { event_id: TEST_EVENT_ID, full_name: 'Citizen', email: 'citizen@local.test', canada_status_document_readiness: 'NOT_APPLICABLE' })
    await applyCmpDocumentation(submission('cmp-citizen', { [CMP_FIELD_IDS.email]: 'citizen@local.test', [CMP_FIELD_IDS.canadianStatus]: 'Canadian Citizen', [CMP_FIELD_IDS.canadianDocValidity]: 'No' }))
    const row = (await pgExec('SELECT canada_residency_status, canada_status_document_readiness FROM public.icplc_participants WHERE id = $1', [p.id])).rows[0]
    expect(row.canada_residency_status).toBe('CANADIAN_CITIZEN')
    expect(row.canada_status_document_readiness).toBe('NOT_APPLICABLE')
  })

  it('protects overridden readiness and region, and rejects unrecognised answers without mutating', async () => {
    const p = await pgInsertReturning('icplc_participants', {
      event_id: TEST_EVENT_ID, full_name: 'Protected', email: 'protected@local.test',
      canada_residency_status: 'PERMANENT_RESIDENT', canada_status_document_readiness: 'RENEWAL_IN_PROGRESS', passport_region: 'NON_ECOWAS',
      override_fields: JSON.stringify({ canada_status_document_readiness: { overridden: true }, passport_region: { overridden: true } }),
    })
    const applied = await applyCmpDocumentation(submission('cmp-protected', { [CMP_FIELD_IDS.email]: 'protected@local.test', [CMP_FIELD_IDS.canadianDocValidity]: 'Yes', [CMP_FIELD_IDS.passportRegion]: 'ECOWAS' }))
    expect(applied.status).toBe('matched_applied') // passport readiness still updates
    let row = (await pgExec('SELECT canada_status_document_readiness, passport_region FROM public.icplc_participants WHERE id = $1', [p.id])).rows[0]
    expect(row.canada_status_document_readiness).toBe('RENEWAL_IN_PROGRESS')
    expect(row.passport_region).toBe('NON_ECOWAS')

    const q = await pgInsertReturning('icplc_participants', { event_id: TEST_EVENT_ID, full_name: 'Odd Answers', email: 'odd@local.test', canada_residency_status: 'PERMANENT_RESIDENT' })
    const odd = await applyCmpDocumentation(submission('cmp-odd', { [CMP_FIELD_IDS.email]: 'odd@local.test', [CMP_FIELD_IDS.canadianDocValidity]: 'Not sure', [CMP_FIELD_IDS.passportRegion]: 'Kenya' }))
    expect(odd.status).toBe('unknown_value')
    row = (await pgExec('SELECT canada_status_document_readiness, passport_region, passport_readiness FROM public.icplc_participants WHERE id = $1', [q.id])).rows[0]
    expect(row.canada_status_document_readiness).toBeNull()
    expect(row.passport_region).toBeNull()
    expect(row.passport_readiness).toBe('unknown')
  })

  it('protects each overridden canonical field independently while refreshing CMP source evidence', async () => {
    const p = await pgInsertReturning('icplc_participants', {
      event_id: TEST_EVENT_ID,
      full_name: 'Override Owner',
      email: 'override@local.test',
      passport_readiness: 'unknown',
      canada_residency_status: 'PERMANENT_RESIDENT',
      source_values: JSON.stringify({ keep: { marker: true } }),
      override_fields: JSON.stringify({
        canada_residency_status: { overridden: true, source: 'manual' },
      }),
    })

    const result = await applyCmpDocumentation(submission('cmp-independent-overrides', {
      [CMP_FIELD_IDS.email]: 'override@local.test',
      [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
      [CMP_FIELD_IDS.canadianStatus]: 'Canadian Citizen',
      [CMP_FIELD_IDS.assistanceRequested]: 'Yes',
    }))

    expect(result.status).toBe('matched_applied')
    const row = (await pgExec('SELECT passport_readiness, canada_residency_status, source_values, override_fields FROM public.icplc_participants WHERE id = $1', [p.id])).rows[0]
    expect(row.passport_readiness).toBe('ready')
    expect(row.canada_residency_status).toBe('PERMANENT_RESIDENT')
    expect(row.source_values.keep.marker).toBe(true)
    expect(row.source_values.cmp_documentation.assistance_requested).toBe('Yes')
    expect(row.override_fields.canada_residency_status.overridden).toBe(true)
  })

  it('refreshes CMP provenance without erasing unrelated namespaces or prior optional CMP evidence', async () => {
    const p = await pgInsertReturning('icplc_participants', {
      event_id: TEST_EVENT_ID,
      full_name: 'Provenance Owner',
      email: 'provenance@local.test',
      passport_readiness: 'unknown',
      source_values: JSON.stringify({
        registration_csv: { registration_id: 'REG-CMP-PROV', registered: 'Yes' },
        manual_notes: { note: 'keep me' },
      }),
      override_fields: JSON.stringify({ passport_readiness: { overridden: true } }),
    })

    const first = await applyCmpDocumentation(submission('cmp-provenance', {
      [CMP_FIELD_IDS.email]: 'provenance@local.test',
      [CMP_FIELD_IDS.phone]: '555-1111',
      [CMP_FIELD_IDS.assistanceRequested]: 'Yes',
      [CMP_FIELD_IDS.canadianDocValidity]: 'No',
      [CMP_FIELD_IDS.passportRegion]: 'Non-ECOWAS',
    }))
    expect(first.participant_id).toBe(p.id)

    const second = await applyCmpDocumentation(submission('cmp-provenance', {
      [CMP_FIELD_IDS.email]: 'provenance@local.test',
      [CMP_FIELD_IDS.phone]: '555-2222',
      [CMP_FIELD_IDS.passportStatus]: 'My passport application or renewal is in progress',
      [CMP_FIELD_IDS.canadianStatus]: 'Visitor',
      [CMP_FIELD_IDS.passportRegion]: undefined,
      [CMP_FIELD_IDS.assistanceRequested]: undefined,
      [CMP_FIELD_IDS.canadianDocValidity]: undefined,
    }))
    expect(second.participant_id).toBe(p.id)

    const row = (await pgExec('SELECT passport_readiness, canada_residency_status, source_values, override_fields FROM public.icplc_participants WHERE id = $1', [p.id])).rows[0]
    expect(row.passport_readiness).toBe('unknown')
    expect(row.canada_residency_status).toBe('VISITOR_OTHER')
    expect(row.source_values.registration_csv.registration_id).toBe('REG-CMP-PROV')
    expect(row.source_values.manual_notes.note).toBe('keep me')
    expect(row.source_values.cmp_documentation.phone).toBe('555-2222')
    expect(row.source_values.cmp_documentation.assistance_requested).toBe('Yes')
    expect(row.source_values.cmp_documentation.canadian_doc_valid_through_nov).toBe('No')
    expect(row.source_values.cmp_documentation.passport_region).toBe('Non-ECOWAS')
    expect(row.override_fields.passport_readiness.overridden).toBe(true)
  })

  it('durable CMP mapping wins, conflicts fail safely, and unmatched submissions do not create participants', async () => {
    const a = await pgInsertReturning('icplc_participants', {
      event_id: TEST_EVENT_ID, full_name: 'Participant A', registration_status: 'unknown',
    })
    const b = await pgInsertReturning('icplc_participants', {
      event_id: TEST_EVENT_ID, full_name: 'Participant B', email: 'b@local.test', registration_status: 'unknown',
    })
    await pgInsertReturning('icplc_identity_maps', {
      event_id: TEST_EVENT_ID, source_type: 'cmp_documentation',
      source_key: 'cmp-conflict', participant_id: a.id,
    })

    const before = await pgExec('SELECT COUNT(*) FROM public.icplc_participants WHERE event_id = $1', [TEST_EVENT_ID])
    const result = await applyCmpDocumentation(submission('cmp-conflict', {
      [CMP_FIELD_IDS.email]: 'b@local.test',
    }))
    expect(result.status).toBe('identity_conflict')
    const after = await pgExec('SELECT COUNT(*) FROM public.icplc_participants WHERE event_id = $1', [TEST_EVENT_ID])
    expect(after.rows[0].count).toBe(before.rows[0].count)

    const map = await pgExec(
      `SELECT participant_id FROM public.icplc_identity_maps
       WHERE event_id = $1 AND source_type = 'cmp_documentation' AND source_key = 'cmp-conflict'`,
      [TEST_EVENT_ID],
    )
    expect(map.rows[0].participant_id).toBe(a.id)
    const bRow = (await pgExec('SELECT email, canada_residency_status FROM public.icplc_participants WHERE id = $1', [b.id])).rows[0]
    expect(bRow.email).toBe('b@local.test')
    expect(bRow.canada_residency_status).toBeNull()

    const unmatched = await applyCmpDocumentation(submission('cmp-unmatched', {
      [CMP_FIELD_IDS.email]: 'nobody@local.test',
    }))
    expect(unmatched.status).toBe('unmatched')
    const finalCount = await pgExec('SELECT COUNT(*) FROM public.icplc_participants WHERE event_id = $1', [TEST_EVENT_ID])
    expect(finalCount.rows[0].count).toBe(before.rows[0].count)
  })

  it('email evidence links once, does not claim or transfer email ownership, and repeated sync stays attached', async () => {
    const p = await pgInsertReturning('icplc_participants', {
      event_id: TEST_EVENT_ID,
      full_name: 'Email Owner',
      email: 'email-owner@local.test',
      registration_status: 'unknown',
    })
    const first = await applyCmpDocumentation(submission('cmp-repeat', {
      [CMP_FIELD_IDS.email]: 'email-owner@local.test',
      [CMP_FIELD_IDS.passportStatus]: 'I do not currently have a valid passport',
    }))
    expect(first.participant_id).toBe(p.id)
    expect(first.status).toBe('matched_applied')

    const second = await applyCmpDocumentation(submission('cmp-repeat', {
      [CMP_FIELD_IDS.email]: 'new-unclaimed@local.test',
      [CMP_FIELD_IDS.passportStatus]: 'My passport application or renewal is in progress',
    }))
    expect(second.participant_id).toBe(p.id)

    const row = (await pgExec('SELECT email, passport_readiness FROM public.icplc_participants WHERE id = $1', [p.id])).rows[0]
    expect(row.email).toBe('email-owner@local.test')
    expect(row.passport_readiness).toBe('renewal_in_progress')

    const newClaim = await pgExec(
      'SELECT COUNT(*) FROM public.icplc_email_claims WHERE event_id = $1 AND normalized_email = $2',
      [TEST_EVENT_ID, 'new-unclaimed@local.test'],
    )
    expect(newClaim.rows[0].count).toBe('0')
    const maps = await pgExec(
      `SELECT COUNT(*), MIN(participant_id::text) AS participant_id
       FROM public.icplc_identity_maps
       WHERE event_id = $1 AND source_type = 'cmp_documentation' AND source_key = 'cmp-repeat'`,
      [TEST_EVENT_ID],
    )
    expect(maps.rows[0].count).toBe('1')
    expect(maps.rows[0].participant_id).toBe(p.id)
  })

  it('keeps CMP durable identity and email evidence scoped to the requested event', async () => {
    const a = await pgInsertReturning('icplc_participants', {
      event_id: TEST_EVENT_ID,
      full_name: 'Event A Owner',
      email: 'shared-cmp@local.test',
      passport_readiness: 'unknown',
      registration_status: 'registered',
      participation_status: 'confirmed',
      source_values: JSON.stringify({ registration_csv: { registration_id: 'A-R1' } }),
    })
    const b = await pgInsertReturning('icplc_participants', {
      event_id: ALT_EVENT_ID,
      full_name: 'Event B Owner',
      email: 'shared-cmp@local.test',
      passport_readiness: 'unknown',
      registration_status: 'registered',
      participation_status: 'confirmed',
      source_values: JSON.stringify({ registration_csv: { registration_id: 'B-R1' } }),
    })
    await pgInsertReturning('icplc_identity_maps', {
      event_id: TEST_EVENT_ID, source_type: 'cmp_documentation',
      source_key: 'cmp-event-scoped', participant_id: a.id,
    })
    await pgInsertReturning('icplc_identity_maps', {
      event_id: ALT_EVENT_ID, source_type: 'cmp_documentation',
      source_key: 'cmp-event-scoped', participant_id: b.id,
    })

    const resA = await applyCmpDocumentation(submission('cmp-event-scoped', {
      [CMP_FIELD_IDS.email]: 'shared-cmp@local.test',
      [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
    }), TEST_EVENT_ID)
    const resB = await applyCmpDocumentation(submission('cmp-event-scoped', {
      [CMP_FIELD_IDS.email]: 'shared-cmp@local.test',
      [CMP_FIELD_IDS.passportStatus]: 'I do not currently have a valid passport',
    }), ALT_EVENT_ID)

    expect(resA.participant_id).toBe(a.id)
    expect(resB.participant_id).toBe(b.id)
    const rows = await pgExec(
      `SELECT id, event_id, passport_readiness, registration_status, participation_status, email, source_values
       FROM public.icplc_participants
       WHERE id = ANY($1::uuid[])
       ORDER BY event_id`,
      [[a.id, b.id]],
    )
    expect(rows.rows.find((r) => r.id === a.id).passport_readiness).toBe('ready')
    expect(rows.rows.find((r) => r.id === b.id).passport_readiness).toBe('no_passport')
    for (const row of rows.rows) {
      expect(row.registration_status).toBe('registered')
      expect(row.participation_status).toBe('confirmed')
      expect(row.email).toBe('shared-cmp@local.test')
      expect(row.source_values.registration_csv.registration_id).toMatch(/^[AB]-R1$/)
    }
  })
})
