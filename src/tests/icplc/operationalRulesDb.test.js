/**
 * ICPLC operational rules against the local database: the new fields are audited by the existing participant
 * audit trigger, a Flight Not Required record creates no itinerary, and registration cannot be waived.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import pg from 'pg'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const EVENT_ID = '00000000-0000-0000-0000-000000009601'
const STAFF_ID = '00000000-0000-0000-0000-000000009611'
const migration = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8')

async function run(sql, params = [], claimsSub = null) {
  const client = new pg.Client(PG_URL)
  await client.connect()
  try {
    if (claimsSub) {
      await client.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: claimsSub, role: 'authenticated' })])
    }
    return await client.query(sql, params)
  } finally {
    await client.end()
  }
}

async function newParticipant(name, extra = {}) {
  const cols = { event_id: EVENT_ID, full_name: name, ...extra }
  const keys = Object.keys(cols)
  const res = await run(
    `INSERT INTO public.icplc_participants (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(cols),
  )
  return res.rows[0].id
}

const changesFor = async (id) =>
  (await run(`SELECT metadata FROM public.activity_log WHERE entity_type = 'icplc_participant' AND entity_id = $1 AND action = 'participant_updated' ORDER BY "timestamp", id`, [id])).rows.map((r) => r.metadata)

async function cleanup() {
  await run(`DELETE FROM public.activity_log WHERE entity_id IN (SELECT id FROM public.icplc_participants WHERE event_id = $1)`, [EVENT_ID])
  await run(`DELETE FROM public.icplc_email_claims WHERE event_id = $1`, [EVENT_ID])
  await run(`DELETE FROM public.icplc_participants WHERE event_id = $1`, [EVENT_ID])
}

describe('ICPLC operational rules (local database)', () => {
  beforeAll(async () => {
    // A database built from the migrations already has these. Only a stale local database needs them applied, and
    // ALTER TABLE takes a table lock that would stall the other database suites running in parallel, so skip it otherwise.
    const have = (await run(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'icplc_participants' AND column_name IN ('documentation_assistance_requested', 'flight_not_required_reason', 'documentation_review_at', 'documentation_review_fingerprint')`)).rows.length
    if (have < 4) {
      await run(migration('20271001000000_icplc_documentation_assistance.sql'))
      await run(migration('20271001000001_icplc_operational_rules.sql'))
    }
    await cleanup()
    await run(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [STAFF_ID])
    await run(`INSERT INTO public.users (id, email, name, role) VALUES ($1, 'ops-staff-9611@local.test', 'Ops Staff', 'member') ON CONFLICT (id) DO NOTHING`, [STAFF_ID])
    await run(`INSERT INTO public.event_configs (id, event_name, sprint_pattern, is_active) VALUES ($1, 'Ops Event', 'ops', false) ON CONFLICT (id) DO NOTHING`, [EVENT_ID])
  })
  afterAll(async () => { await cleanup() })

  it('audits documentation_assistance_requested with who, old and new value', async () => {
    const id = await newParticipant('Asks For Help')
    await run(`UPDATE public.icplc_participants SET documentation_assistance_requested = true WHERE id = $1`, [id], STAFF_ID)
    const [entry] = await changesFor(id)
    expect(entry.actor_id).toBe(STAFF_ID)
    expect(entry.changes.documentation_assistance_requested).toEqual({ from: null, to: true })
  })

  it('audits Flight Not Required with reason and note, and creates no itinerary', async () => {
    const id = await newParticipant('Already There')
    await run(
      `UPDATE public.icplc_participants SET flight_not_required_reason = 'already_in_nigeria', flight_not_required_note = 'Attended the pre-conference',
         flight_not_required_by = $2, flight_not_required_at = now() WHERE id = $1`,
      [id, STAFF_ID], STAFF_ID,
    )
    const [entry] = await changesFor(id)
    expect(entry.changes.flight_not_required_reason).toEqual({ from: null, to: 'already_in_nigeria' })
    expect(entry.changes.flight_not_required_note.to).toBe('Attended the pre-conference')
    const row = (await run(`SELECT arrival_date, arrival_flight, departure_date, departure_flight, flight_not_required_by, flight_not_required_at FROM public.icplc_participants WHERE id = $1`, [id])).rows[0]
    expect(row).toMatchObject({ arrival_date: null, arrival_flight: null, departure_date: null, departure_flight: null, flight_not_required_by: STAFF_ID })
    expect(row.flight_not_required_at).toBeTruthy()
  })

  it('audits the documentation review acknowledgement', async () => {
    const id = await newParticipant('Reviewed Person')
    await run(`UPDATE public.icplc_participants SET documentation_review_by = $2, documentation_review_at = now(), documentation_review_fingerprint = 'form_not_received,passport_status' WHERE id = $1`, [id, STAFF_ID], STAFF_ID)
    const [entry] = await changesFor(id)
    expect(entry.changes.documentation_review_at.from).toBeNull()
    expect(entry.changes.documentation_review_at.to).toBeTruthy()
    expect(entry.changes.documentation_review_fingerprint).toEqual({ from: null, to: 'form_not_received,passport_status' })
  })

  it('still audits the fields it audited before (trigger replaced, not narrowed)', async () => {
    const id = await newParticipant('Old Field', { subgroup: 'BLW West Subgroup A' })
    await run(`UPDATE public.icplc_participants SET subgroup = 'BLW West Subgroup B', passport_readiness = 'ready' WHERE id = $1`, [id], STAFF_ID)
    const [entry] = await changesFor(id)
    expect(Object.keys(entry.changes).sort()).toEqual(['passport_readiness', 'subgroup'])
  })

  it('a blank Flight Not Required reason is rejected; open reason values are accepted', async () => {
    const id = await newParticipant('Reason Rules')
    await expect(run(`UPDATE public.icplc_participants SET flight_not_required_reason = '   ' WHERE id = $1`, [id])).rejects.toThrow(/flight_not_required_reason_chk/)
    await run(`UPDATE public.icplc_participants SET flight_not_required_reason = 'attending_another_event' WHERE id = $1`, [id])
    const row = (await run(`SELECT flight_not_required_reason FROM public.icplc_participants WHERE id = $1`, [id])).rows[0]
    expect(row.flight_not_required_reason).toBe('attending_another_event')
  })

  it('registration cannot be marked not required: the database has no such value', async () => {
    const id = await newParticipant('Must Register')
    for (const bad of ['not_required', 'waived', 'exempt']) {
      await expect(run(`UPDATE public.icplc_participants SET registration_status = $2 WHERE id = $1`, [id, bad])).rejects.toThrow(/registration_status/)
    }
    // ... and a Flight Not Required record does not touch it
    await run(`UPDATE public.icplc_participants SET flight_not_required_reason = 'already_in_nigeria' WHERE id = $1`, [id])
    const row = (await run(`SELECT registration_status FROM public.icplc_participants WHERE id = $1`, [id])).rows[0]
    expect(row.registration_status).toBe('unknown')
  })
})
