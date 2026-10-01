/**
 * ICPLC bulk operations against the local database (migration 20271001000005).
 * Every test runs in a transaction that is rolled back, impersonating real roles (anon / authenticated).
 *   - icplc_bulk_mark_documentation_reviewed: authorization (fail closed, NULL auth), optimistic concurrency,
 *     per-participant results, ONLY the review columns written, audit rows with source = bulk_action
 *   - icplc_bulk_set_tag: idempotent add / remove, other tags untouched, tag audit, authorization
 *   - no notification row is created by either
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import pg from 'pg'

const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const EVENT = 'bbbbbbbb-2222-0000-0000-000000000001'
const OTHER_EVENT = 'bbbbbbbb-2222-0000-0000-000000000002'
const USERS = {
  writer: ['aaaaaaaa-2222-0000-0000-000000000001', 'super_admin'],
  member: ['aaaaaaaa-2222-0000-0000-000000000002', 'member'],
}
const P = {
  a: 'cccccccc-2222-0000-0000-00000000000a',
  b: 'cccccccc-2222-0000-0000-00000000000b',
  c: 'cccccccc-2222-0000-0000-00000000000c',
  absent: 'cccccccc-2222-0000-0000-0000000000dd',
  tracking: 'cccccccc-2222-0000-0000-0000000000ee',
}
const TAG_X = 'dddddddd-2222-0000-0000-000000000001'
const TAG_Y = 'dddddddd-2222-0000-0000-000000000002'
const TAG_OTHER_EVENT = 'dddddddd-2222-0000-0000-000000000003'
const FP = 'form_not_received'

let pool
let available = false
const migration = readFileSync(new URL('../../../supabase/migrations/20271001000005_icplc_bulk_documentation_review_and_tag_audit.sql', import.meta.url), 'utf8')

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: PG_URL, max: 1 })
  try {
    const have = await pool.query("select to_regprocedure('public.icplc_bulk_mark_documentation_reviewed(jsonb)') as f, to_regprocedure('public.icplc_merge_participants(uuid,uuid,jsonb)') as m")
    available = !!have.rows[0].m
    // A local database built before this migration needs it applied once (local only; never run against a remote).
    if (available && !have.rows[0].f) await pool.query(migration)
  } catch {
    available = false
  }
})
afterAll(async () => { await pool?.end() })

async function inTx(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    for (const [id, role] of Object.values(USERS)) {
      await client.query(
        `insert into auth.users(id,email,instance_id,aud,role)
         values ($1,$2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated') on conflict do nothing`,
        [id, `${id}@bulk.test`])
      await client.query(
        `insert into public.users(id,email,name,role,status) values ($1,$2,$2,$3,'active')
         on conflict (id) do update set role = excluded.role`,
        [id, `${id}@bulk.test`, role])
    }
    for (const ev of [EVENT, OTHER_EVENT]) {
      await client.query(
        `insert into public.event_configs(id,event_name,sprint_pattern,is_active) values ($1,'Bulk Test','bulk-test-none',false) on conflict do nothing`, [ev])
    }
    await client.query(
      `insert into public.icplc_participants(id,event_id,full_name,email,participation_status) values
         ($1,$6,'Person A','a@bulk.test','confirmed'),
         ($2,$6,'Person B','b@bulk.test','likely'),
         ($3,$6,'Person C','c@bulk.test','confirmed'),
         ($4,$6,'Absent D','d@bulk.test','not_attending'),
         ($5,$6,'Tracking E','e@bulk.test','tracking')`,
      [P.a, P.b, P.c, P.absent, P.tracking, EVENT])
    await client.query(
      `insert into public.icplc_tags(id,event_id,name) values ($1,$4,'Bulk X'), ($2,$4,'Bulk Y'), ($3,$5,'Bulk Other Event')`,
      [TAG_X, TAG_Y, TAG_OTHER_EVENT, EVENT, OTHER_EVENT])
    // local databases lack default grants
    await client.query('grant select, insert, update, delete on public.icplc_participants, public.icplc_participant_tags, public.icplc_tags to authenticated')
    await client.query('grant select on public.activity_log to authenticated')
    return await fn(client)
  } finally {
    await client.query('rollback').catch(() => {})
    client.release()
  }
}

/** Run SQL as a role. userKey null => authenticated role with NO sub (NULL auth.uid()). role 'anon' => anon. */
async function as(client, who, sql, params) {
  const claims = who === 'anon' ? '{"role":"anon"}'
    : who ? JSON.stringify({ sub: USERS[who][0], role: 'authenticated' })
      : JSON.stringify({ role: 'authenticated' })
  await client.query("select set_config('request.jwt.claims', $1, true)", [claims])
  await client.query(`set local role ${who === 'anon' ? 'anon' : 'authenticated'}`)
  try {
    return await client.query(sql, params)
  } finally {
    await client.query('reset role').catch(() => {})
  }
}

const REVIEW = 'select public.icplc_bulk_mark_documentation_reviewed($1::jsonb) as r'
const TAG = 'select public.icplc_bulk_set_tag($1::uuid[], $2::uuid, $3) as r'

async function stamp(client, id) {
  return (await client.query('select updated_at::text as u from public.icplc_participants where id = $1', [id])).rows[0].u
}
async function item(client, id, fingerprint = FP) {
  return { id, fingerprint, expected_updated_at: await stamp(client, id) }
}
const byId = (res) => Object.fromEntries(res.rows[0].r.results.map((r) => [r.id, r]))
async function expectDenied(client, promise) {
  await client.query('savepoint s')
  await expect(promise).rejects.toThrow(/permission denied/i)
  await client.query('rollback to savepoint s')
}

describe('bulk review authorization', () => {
  it('AUTH-1 anon cannot execute either function', async () => {
    if (!available) return
    await inTx(async (c) => {
      await expectDenied(c, as(c, 'anon', REVIEW, [JSON.stringify([])]))
      await expectDenied(c, as(c, 'anon', TAG, [[P.a], TAG_X, 'add']))
    })
  })

  it('AUTH-2 NULL auth (authenticated role, no user) fails closed', async () => {
    if (!available) return
    await inTx(async (c) => {
      await expectDenied(c, as(c, null, REVIEW, [JSON.stringify([{ id: P.a, fingerprint: FP, expected_updated_at: await stamp(c, P.a) }])]))
      await expectDenied(c, as(c, null, TAG, [[P.a], TAG_X, 'add']))
      const { rows } = await c.query('select documentation_review_at from public.icplc_participants where id = $1', [P.a])
      expect(rows[0].documentation_review_at).toBeNull()
    })
  })

  it('AUTH-3 an authenticated user without ICPLC write access is denied and nothing changes', async () => {
    if (!available) return
    await inTx(async (c) => {
      await expectDenied(c, as(c, 'member', REVIEW, [JSON.stringify([await item(c, P.a)])]))
      await expectDenied(c, as(c, 'member', TAG, [[P.a], TAG_X, 'add']))
      const { rows } = await c.query('select documentation_review_at from public.icplc_participants where id = $1', [P.a])
      expect(rows[0].documentation_review_at).toBeNull()
      const tags = await c.query('select count(*)::int n from public.icplc_participant_tags where participant_id = $1', [P.a])
      expect(tags.rows[0].n).toBe(0)
    })
  })

  it('AUTH-4 an authorized writer succeeds', async () => {
    if (!available) return
    await inTx(async (c) => {
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([await item(c, P.a)])])
      expect(byId(res)[P.a].status).toBe('updated')
    })
  })
})

describe('bulk documentation review', () => {
  it('REV-1 updates an eligible participant: by, at and fingerprint only', async () => {
    if (!available) return
    await inTx(async (c) => {
      const before = (await c.query('select * from public.icplc_participants where id = $1', [P.a])).rows[0]
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([await item(c, P.a, 'canadian_status,form_not_received')])])
      expect(byId(res)[P.a]).toMatchObject({ status: 'updated' })
      const after = (await c.query('select * from public.icplc_participants where id = $1', [P.a])).rows[0]
      expect(after.documentation_review_by).toBe(USERS.writer[0])
      expect(after.documentation_review_at).not.toBeNull()
      expect(after.documentation_review_fingerprint).toBe('canadian_status,form_not_received')
      // Nothing else changed.
      const strip = (r) => { const { documentation_review_by, documentation_review_at, documentation_review_fingerprint, updated_at, ...rest } = r; return rest }
      expect(strip(after)).toEqual(strip(before))
    })
  })

  it('REV-2 reviewing the same state again is already_reviewed', async () => {
    if (!available) return
    await inTx(async (c) => {
      await as(c, 'writer', REVIEW, [JSON.stringify([await item(c, P.a)])])
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([await item(c, P.a)])])
      expect(byId(res)[P.a]).toMatchObject({ status: 'already_reviewed' })
    })
  })

  it('REV-3 a stale review (different stored fingerprint) can be reviewed again', async () => {
    if (!available) return
    await inTx(async (c) => {
      await as(c, 'writer', REVIEW, [JSON.stringify([await item(c, P.a, 'passport_status')])])
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([await item(c, P.a, 'form_not_received,passport_status')])])
      expect(byId(res)[P.a].status).toBe('updated')
      const { rows } = await c.query('select documentation_review_fingerprint f from public.icplc_participants where id = $1', [P.a])
      expect(rows[0].f).toBe('form_not_received,passport_status')
    })
  })

  it('REV-4 a row that changed since it was loaded is skipped_stale and left alone', async () => {
    if (!available) return
    await inTx(async (c) => {
      // Within one transaction now() is constant, so a real concurrent edit is simulated by presenting the
      // updated_at the page saw BEFORE that edit. The comparison the RPC makes is identical.
      const seen = (await c.query("select (updated_at - interval '1 second')::text as u from public.icplc_participants where id = $1", [P.a])).rows[0].u
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([{ id: P.a, fingerprint: FP, expected_updated_at: seen }])])
      expect(byId(res)[P.a]).toMatchObject({ status: 'skipped_stale', reason: 'changed_since_loaded' })
      const { rows } = await c.query('select documentation_review_at, documentation_review_by, documentation_review_fingerprint from public.icplc_participants where id = $1', [P.a])
      expect(rows[0]).toEqual({ documentation_review_at: null, documentation_review_by: null, documentation_review_fingerprint: null })
    })
  })

  it('REV-4b a missing expected_updated_at is never trusted', async () => {
    if (!available) return
    await inTx(async (c) => {
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([{ id: P.a, fingerprint: FP }])])
      expect(byId(res)[P.a]).toMatchObject({ status: 'skipped_stale' })
    })
  })

  it('REV-5 Not Attending, not-yet-committed and empty-fingerprint rows are ineligible', async () => {
    if (!available) return
    await inTx(async (c) => {
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([
        await item(c, P.absent), await item(c, P.tracking), await item(c, P.b, ''),
      ])])
      const r = byId(res)
      expect(r[P.absent]).toMatchObject({ status: 'skipped_ineligible', reason: 'not_attending' })
      expect(r[P.tracking]).toMatchObject({ status: 'skipped_ineligible', reason: 'not_committed' })
      expect(r[P.b]).toMatchObject({ status: 'skipped_ineligible', reason: 'nothing_missing' })
      const { rows } = await c.query('select count(*)::int n from public.icplc_participants where id = any($1) and documentation_review_at is not null', [[P.absent, P.tracking, P.b]])
      expect(rows[0].n).toBe(0)
    })
  })

  it('REV-6 results are per participant: one bad row does not undo the others', async () => {
    if (!available) return
    await inTx(async (c) => {
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([
        await item(c, P.a), { id: 'not-a-uuid', fingerprint: FP, expected_updated_at: null }, await item(c, P.c),
        { id: '00000000-0000-0000-0000-00000000dead', fingerprint: FP, expected_updated_at: null },
      ])])
      const results = res.rows[0].r.results
      expect(results.filter((r) => r.status === 'updated')).toHaveLength(2)
      expect(results.filter((r) => r.status === 'failed')).toHaveLength(2)
      const { rows } = await c.query('select count(*)::int n from public.icplc_participants where id = any($1) and documentation_review_at is not null', [[P.a, P.c]])
      expect(rows[0].n).toBe(2)
    })
  })

  it('REV-7 duplicate ids are processed once', async () => {
    if (!available) return
    await inTx(async (c) => {
      const i = await item(c, P.a)
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([i, i])])
      const results = res.rows[0].r.results
      expect(results.map((r) => r.status)).toEqual(['updated', 'skipped_ineligible'])
      expect(results[1].reason).toBe('duplicate_id')
    })
  })

  it('REV-8 each changed participant gets their own activity row: actor, source = bulk_action, reason, batch', async () => {
    if (!available) return
    await inTx(async (c) => {
      const res = await as(c, 'writer', REVIEW, [JSON.stringify([await item(c, P.a), await item(c, P.b)])])
      const batch = res.rows[0].r.batch_id
      for (const id of [P.a, P.b]) {
        const { rows } = await c.query(
          `select metadata, user_id from public.activity_log
            where entity_type = 'icplc_participant' and entity_id = $1 and action = 'participant_updated'
              and metadata -> 'changes' ? 'documentation_review_fingerprint'`, [id])
        expect(rows).toHaveLength(1)
        expect(rows[0].user_id).toBe(USERS.writer[0])
        expect(rows[0].metadata.actor_id).toBe(USERS.writer[0])
        expect(rows[0].metadata.source).toBe('bulk_action')
        expect(rows[0].metadata.reason).toMatch(/Bulk documentation review \(2 selected\)/)
        expect(rows[0].metadata.batch_id).toBe(batch)
        expect(rows[0].metadata.changes.documentation_review_fingerprint.to).toBe(FP)
      }
    })
  })

  it('REV-9 the bulk context does not leak into later writes in the same session', async () => {
    if (!available) return
    await inTx(async (c) => {
      await as(c, 'writer', REVIEW, [JSON.stringify([await item(c, P.a)])])
      await c.query("update public.icplc_participants set region = 'Later Edit' where id = $1", [P.c])
      const { rows } = await c.query(
        `select metadata from public.activity_log where entity_id = $1 and action = 'participant_updated' and metadata -> 'changes' ? 'region'`, [P.c])
      expect(rows[0].metadata.source).not.toBe('bulk_action')
      expect(rows[0].metadata.batch_id).toBeUndefined()
    })
  })

  it('REV-10 creates no notification', async () => {
    if (!available) return
    await inTx(async (c) => {
      const count = async () => (await c.query('select count(*)::int n from public.notifications')).rows[0].n
      const before = await count()
      await as(c, 'writer', REVIEW, [JSON.stringify([await item(c, P.a)])])
      await as(c, 'writer', TAG, [[P.a], TAG_X, 'add'])
      expect(await count()).toBe(before)
    })
  })

  it('REV-11 rejects an oversized request', async () => {
    if (!available) return
    await inTx(async (c) => {
      const items = Array.from({ length: 1001 }, () => ({ id: P.a, fingerprint: FP, expected_updated_at: null }))
      await c.query('savepoint s')
      await expect(as(c, 'writer', REVIEW, [JSON.stringify(items)])).rejects.toThrow(/too many/i)
      await c.query('rollback to savepoint s')
    })
  })
})

describe('bulk tags', () => {
  const tagNames = async (c, id) => (await c.query(
    `select t.name from public.icplc_participant_tags pt join public.icplc_tags t on t.id = pt.tag_id where pt.participant_id = $1 order by t.name`, [id])).rows.map((r) => r.name)

  it('TAG-1 add is idempotent and never replaces existing tags', async () => {
    if (!available) return
    await inTx(async (c) => {
      await c.query('insert into public.icplc_participant_tags(participant_id, tag_id) values ($1, $2)', [P.a, TAG_Y])
      const first = await as(c, 'writer', TAG, [[P.a, P.b], TAG_X, 'add'])
      expect(first.rows[0].r.results.map((r) => r.status)).toEqual(['updated', 'updated'])
      expect(await tagNames(c, P.a)).toEqual(['Bulk X', 'Bulk Y']) // Y kept
      const again = await as(c, 'writer', TAG, [[P.a, P.b], TAG_X, 'add'])
      expect(again.rows[0].r.results.map((r) => r.status)).toEqual(['no_change', 'no_change'])
      expect(await tagNames(c, P.a)).toEqual(['Bulk X', 'Bulk Y'])
    })
  })

  it('TAG-2 remove removes only that tag and is idempotent', async () => {
    if (!available) return
    await inTx(async (c) => {
      await c.query('insert into public.icplc_participant_tags(participant_id, tag_id) values ($1, $2), ($1, $3)', [P.a, TAG_X, TAG_Y])
      const res = await as(c, 'writer', TAG, [[P.a, P.b], TAG_X, 'remove'])
      expect(res.rows[0].r.results.map((r) => r.status)).toEqual(['updated', 'no_change'])
      expect(await tagNames(c, P.a)).toEqual(['Bulk Y'])
    })
  })

  it('TAG-3 tag changes are audited with actor, source = bulk_action and batch id', async () => {
    if (!available) return
    await inTx(async (c) => {
      const res = await as(c, 'writer', TAG, [[P.a], TAG_X, 'add'])
      await as(c, 'writer', TAG, [[P.a], TAG_X, 'remove'])
      const { rows } = await c.query(
        `select action, metadata from public.activity_log where entity_type = 'icplc_participant' and entity_id = $1 and action like 'participant_tag_%'`, [P.a])
      // now() is constant inside the test transaction, so identify rows by action rather than by time.
      expect(rows.map((r) => r.action).sort()).toEqual(['participant_tag_added', 'participant_tag_removed'])
      const added = rows.find((r) => r.action === 'participant_tag_added')
      const removed = rows.find((r) => r.action === 'participant_tag_removed')
      expect(added.metadata).toMatchObject({ actor_id: USERS.writer[0], source: 'bulk_action', tag_name: 'Bulk X', batch_id: res.rows[0].r.batch_id })
      expect(removed.metadata).toMatchObject({ actor_id: USERS.writer[0], source: 'bulk_action', tag_name: 'Bulk X' })
      expect(added.metadata.reason).toMatch(/Bulk tag add \(1 selected\)/)
    })
  })

  it('TAG-4 an idempotent no-op writes no audit row', async () => {
    if (!available) return
    await inTx(async (c) => {
      await as(c, 'writer', TAG, [[P.a], TAG_X, 'add'])
      await as(c, 'writer', TAG, [[P.a], TAG_X, 'add'])
      const { rows } = await c.query(`select count(*)::int n from public.activity_log where entity_id = $1 and action = 'participant_tag_added'`, [P.a])
      expect(rows[0].n).toBe(1)
    })
  })

  it('TAG-5 a tag from another event is not attached', async () => {
    if (!available) return
    await inTx(async (c) => {
      const res = await as(c, 'writer', TAG, [[P.a], TAG_OTHER_EVENT, 'add'])
      expect(res.rows[0].r.results[0]).toMatchObject({ status: 'skipped_ineligible', reason: 'tag_not_for_event' })
      expect(await tagNames(c, P.a)).toEqual([])
    })
  })

  it('TAG-6 invalid action and unknown tag are rejected', async () => {
    if (!available) return
    await inTx(async (c) => {
      await c.query('savepoint s')
      await expect(as(c, 'writer', TAG, [[P.a], TAG_X, 'replace'])).rejects.toThrow(/add or remove/)
      await c.query('rollback to savepoint s')
      await expect(as(c, 'writer', TAG, [[P.a], '00000000-0000-0000-0000-00000000beef', 'add'])).rejects.toThrow(/tag not found/)
      await c.query('rollback to savepoint s')
    })
  })

  it('TAG-7 deleting a participant (cascade) does not write tag audit noise', async () => {
    if (!available) return
    await inTx(async (c) => {
      await as(c, 'writer', TAG, [[P.c], TAG_X, 'add'])
      await c.query('delete from public.icplc_participants where id = $1', [P.c])
      const { rows } = await c.query(`select count(*)::int n from public.activity_log where entity_id = $1 and action = 'participant_tag_removed'`, [P.c])
      expect(rows[0].n).toBe(0)
    })
  })
})
