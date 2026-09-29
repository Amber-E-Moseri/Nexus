/**
 * ICPLC participant audit trail (local database).
 * Every change to a tracked participant field is written to activity_log with who / what / from / to,
 * whichever path made it. Bookkeeping-only changes are not logged.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'

const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const EVENT_ID = '00000000-0000-0000-0000-000000009301'
const STAFF_ID = '00000000-0000-0000-0000-000000009311'
const GHOST_ID = '00000000-0000-0000-0000-000000009312' // authenticated but has no public.users row

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

const logFor = async (id) =>
  (await run(`SELECT user_id, action, metadata FROM public.activity_log WHERE entity_type = 'icplc_participant' AND entity_id = $1 ORDER BY "timestamp", id`, [id])).rows

async function cleanup() {
  await run(`DELETE FROM public.activity_log WHERE entity_id IN (SELECT id FROM public.icplc_participants WHERE event_id = $1)`, [EVENT_ID])
  await run(`DELETE FROM public.icplc_email_claims WHERE event_id = $1`, [EVENT_ID])
  await run(`DELETE FROM public.icplc_participants WHERE event_id = $1`, [EVENT_ID])
}

describe('ICPLC participant audit trail', () => {
  beforeAll(async () => {
    await cleanup()
    await run(`INSERT INTO auth.users (id) VALUES ($1), ($2) ON CONFLICT (id) DO NOTHING`, [STAFF_ID, GHOST_ID])
    await run(`INSERT INTO public.users (id, email, name, role) VALUES ($1, 'audit-staff@local.test', 'Audit Staff', 'member') ON CONFLICT (id) DO NOTHING`, [STAFF_ID])
    await run(`INSERT INTO public.event_configs (id, event_name, sprint_pattern, is_active) VALUES ($1, 'Audit Event', 'audit', false) ON CONFLICT (id) DO NOTHING`, [EVENT_ID])
  })
  afterAll(async () => { await cleanup() })

  it('logs who changed what, with the old and new value', async () => {
    const id = await newParticipant('Ada Obi', { subgroup: 'BLW West Subgroup A' })
    await run(`UPDATE public.icplc_participants SET subgroup = 'BLW West Subgroup B', notes = 'moved' WHERE id = $1`, [id], STAFF_ID)
    const [created, updated] = await logFor(id)
    expect(created.action).toBe('participant_created')
    expect(updated.action).toBe('participant_updated')
    expect(updated.user_id).toBe(STAFF_ID)
    expect(updated.metadata.source).toBe('app')
    expect(updated.metadata.changes.subgroup).toEqual({ from: 'BLW West Subgroup A', to: 'BLW West Subgroup B' })
    expect(updated.metadata.changes.notes).toEqual({ from: null, to: 'moved' })
  })

  it('does not log when nothing tracked changed (bookkeeping only)', async () => {
    const id = await newParticipant('Quiet Person')
    await run(`UPDATE public.icplc_participants SET source_values = '{"x":1}'::jsonb, override_fields = '{"y":true}'::jsonb WHERE id = $1`, [id], STAFF_ID)
    await run(`UPDATE public.icplc_participants SET full_name = full_name WHERE id = $1`, [id], STAFF_ID)
    expect((await logFor(id)).map((r) => r.action)).toEqual(['participant_created'])
  })

  it('attributes work with no signed-in user to the system', async () => {
    const id = await newParticipant('Synced Person')
    await run(`UPDATE public.icplc_participants SET passport_readiness = 'ready' WHERE id = $1`, [id])
    const updated = (await logFor(id)).find((r) => r.action === 'participant_updated')
    expect(updated.user_id).toBeNull()
    expect(updated.metadata.source).toBe('system')
    expect(updated.metadata.changes.passport_readiness.to).toBe('ready')
  })

  it('keeps the actor id even when the user has no public.users row', async () => {
    const id = await newParticipant('Ghost Edit')
    await run(`UPDATE public.icplc_participants SET gender = 'female' WHERE id = $1`, [id], GHOST_ID)
    const updated = (await logFor(id)).find((r) => r.action === 'participant_updated')
    expect(updated.user_id).toBeNull()
    expect(updated.metadata.actor_id).toBe(GHOST_ID)
  })

  it('auto-confirm is recorded as automatic with a reason, and only promotes tracking/likely', async () => {
    const tracking = await newParticipant('Auto One', { participation_status: 'tracking' })
    const likely = await newParticipant('Auto Two', { participation_status: 'likely' })
    const uncertain = await newParticipant('Stays Put', { participation_status: 'uncertain' })
    const res = await run(`SELECT public.icplc_apply_auto_confirm($1::uuid[]) AS n`, [[tracking, likely, uncertain]], STAFF_ID)
    expect(res.rows[0].n).toBe(2)

    const entry = (await logFor(tracking)).find((r) => r.action === 'participant_updated')
    expect(entry.user_id).toBe(STAFF_ID)
    expect(entry.metadata.source).toBe('automatic')
    expect(entry.metadata.reason).toMatch(/readiness reached Ready/)
    expect(entry.metadata.changes.participation_status).toEqual({ from: 'tracking', to: 'confirmed' })
    expect((await logFor(uncertain)).map((r) => r.action)).toEqual(['participant_created'])
  })

  it('a later normal edit is not mislabelled as automatic', async () => {
    const id = await newParticipant('Later Edit', { participation_status: 'tracking' })
    await run(`SELECT public.icplc_apply_auto_confirm($1::uuid[])`, [[id]], STAFF_ID)
    await run(`UPDATE public.icplc_participants SET participation_status = 'not_attending' WHERE id = $1`, [id], STAFF_ID)
    const updates = (await logFor(id)).filter((r) => r.action === 'participant_updated')
    expect(updates).toHaveLength(2)
    expect(updates[1].metadata.source).toBe('app')
    expect(updates[1].metadata.reason).toBeUndefined()
  })
})
