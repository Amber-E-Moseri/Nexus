/**
 * ICPLC merge / delete participants (migration 20270930000014).
 * Runs against the local Supabase database inside a transaction that is always rolled back.
 *   - delete: only super_admin / regional_secretary (RLS and RPC); member and role-less callers are refused
 *   - merge: fills blanks, honours per-field choices, keeps both emails, moves tags/links, removes the duplicate
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'

const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const EVENT = 'bbbbbbbb-1111-0000-0000-000000000001'
const USERS = {
  admin: ['aaaaaaaa-1111-0000-0000-000000000001', 'super_admin'],
  secretary: ['aaaaaaaa-1111-0000-0000-000000000002', 'regional_secretary'],
  member: ['aaaaaaaa-1111-0000-0000-000000000003', 'member'],
}
const KEEP = 'cccccccc-1111-0000-0000-000000000001'
const DUP = 'cccccccc-1111-0000-0000-000000000002'

let pool
let available = false

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: PG_URL, max: 1 })
  try {
    const { rows } = await pool.query("select to_regprocedure('public.icplc_merge_participants(uuid,uuid,jsonb)') as f")
    available = !!rows[0].f
  } catch {
    available = false
  }
})
afterAll(async () => { await pool?.end() })

/** Run `fn(client)` inside a transaction that is rolled back, with fixtures loaded. */
async function inTx(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    for (const [id, role] of Object.values(USERS)) {
      await client.query(
        `insert into auth.users(id,email,instance_id,aud,role)
         values ($1,$2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated') on conflict do nothing`,
        [id, `${id}@merge.test`])
      await client.query(
        `insert into public.users(id,email,name,role,status) values ($1,$2,$2,$3,'active')
         on conflict (id) do update set role = excluded.role`,
        [id, `${id}@merge.test`, role])
    }
    await client.query(
      `insert into public.event_configs(id,event_name,sprint_pattern,is_active)
       values ($1,'Merge Delete Test','merge-delete-test',false) on conflict do nothing`, [EVENT])
    await client.query(
      `insert into public.icplc_participants(id,event_id,full_name,email,subgroup,notes) values
       ($1,$3,'Keep Person','keep@merge.test','BLW West Subgroup A','keep note'),
       ($2,$3,'Dup Person','dup@merge.test','BLW Central Subgroup B',null)`, [KEEP, DUP, EVENT])
    await client.query(`update public.icplc_participants set kingschat_username='dupkc', region='Dup Campus' where id=$1`, [DUP])
    await client.query(
      `insert into public.icplc_identity_maps(event_id,source_type,source_key,participant_id)
       values ($1,'registration_csv','MERGE-REG-1',$2)`, [EVENT, DUP])
    await client.query(`insert into public.icplc_participant_tags(participant_id,tag_id) select $1, id from public.icplc_tags limit 2`, [DUP])
    await client.query('grant select, insert, update, delete on public.icplc_participants to authenticated') // local DBs lack default grants
    return await fn(client)
  } finally {
    await client.query('rollback').catch(() => {})
    client.release()
  }
}

async function asUser(client, userKey, sql, params) {
  const claims = userKey ? JSON.stringify({ sub: USERS[userKey][0], role: 'authenticated' }) : JSON.stringify({ role: 'authenticated' })
  await client.query("select set_config('request.jwt.claims', $1, true)", [claims])
  await client.query('set local role authenticated')
  try {
    return await client.query(sql, params)
  } finally {
    // After a refused call the transaction is aborted and RESET fails; the caller rolls back to its savepoint.
    await client.query('reset role').catch(() => {})
  }
}

describe('ICPLC delete participant', () => {
  it('lets super_admin and regional_secretary delete', async () => {
    if (!available) return
    await inTx(async (c) => {
      await asUser(c, 'admin', 'select public.icplc_delete_participant($1)', [DUP])
      await asUser(c, 'secretary', 'select public.icplc_delete_participant($1)', [KEEP])
      const { rows } = await c.query('select count(*)::int n from public.icplc_participants where id = any($1)', [[KEEP, DUP]])
      expect(rows[0].n).toBe(0)
    })
  })

  it('refuses members and callers with no role (function and direct DELETE)', async () => {
    if (!available) return
    await inTx(async (c) => {
      await c.query('savepoint a')
      await expect(asUser(c, 'member', 'select public.icplc_delete_participant($1)', [KEEP])).rejects.toThrow(/super admin or regional secretary/)
      await c.query('rollback to savepoint a')
      await expect(asUser(c, null, 'select public.icplc_delete_participant($1)', [KEEP])).rejects.toThrow(/super admin or regional secretary/)
      await c.query('rollback to savepoint a')
      const direct = await asUser(c, 'member', 'delete from public.icplc_participants where id = $1', [KEEP])
      expect(direct.rowCount).toBe(0)
    })
  })
})

describe('ICPLC merge participants', () => {
  it('fills blanks, honours per-field choices, keeps both emails, moves links and removes the duplicate', async () => {
    if (!available) return
    await inTx(async (c) => {
      const res = await asUser(c, 'admin',
        'select public.icplc_merge_participants($1,$2,$3::jsonb) as r', [KEEP, DUP, JSON.stringify({ subgroup: 'remove' })])
      expect(res.rows[0].r.filled_from_duplicate).toEqual(expect.arrayContaining(['region', 'kingschat_username']))
      expect(res.rows[0].r.chose_duplicate_value).toEqual(['subgroup'])

      const keep = (await c.query('select * from public.icplc_participants where id = $1', [KEEP])).rows[0]
      expect(keep.full_name).toBe('Keep Person')            // no choice -> survivor wins
      expect(keep.notes).toBe('keep note')
      expect(keep.region).toBe('Dup Campus')                 // blank filled
      expect(keep.kingschat_username).toBe('dupkc')
      expect(keep.subgroup).toBe('BLW Central Subgroup B')   // chosen from the duplicate
      expect(keep.group_name).toBe('Central')                // group follows subgroup
      expect(keep.email).toBe('keep@merge.test')
      expect(keep.alternate_email).toBe('dup@merge.test')    // other email kept, not lost
      expect(keep.source_values.merged_from[0].full_name).toBe('Dup Person')

      expect((await c.query('select 1 from public.icplc_participants where id = $1', [DUP])).rowCount).toBe(0)
      const map = await c.query("select participant_id from public.icplc_identity_maps where source_key = 'MERGE-REG-1'")
      expect(map.rows[0].participant_id).toBe(KEEP)
      const tags = await c.query('select count(*)::int n from public.icplc_participant_tags where participant_id = $1', [KEEP])
      expect(tags.rows[0].n).toBe(2)
      const claims = await c.query('select email_slot, normalized_email from public.icplc_email_claims where participant_id = $1 order by email_slot', [KEEP])
      expect(claims.rows.map((r) => `${r.email_slot}=${r.normalized_email}`)).toEqual(['alternate=dup@merge.test', 'primary=keep@merge.test'])
    })
  })

  it('can take the duplicate email as primary when chosen', async () => {
    if (!available) return
    await inTx(async (c) => {
      await asUser(c, 'secretary', 'select public.icplc_merge_participants($1,$2,$3::jsonb)', [KEEP, DUP, JSON.stringify({ email: 'remove' })])
      const keep = (await c.query('select email, alternate_email from public.icplc_participants where id = $1', [KEEP])).rows[0]
      expect(keep).toEqual({ email: 'dup@merge.test', alternate_email: 'keep@merge.test' })
    })
  })

  it('refuses members, merging a person into themselves, and cross-event merges', async () => {
    if (!available) return
    await inTx(async (c) => {
      await c.query('savepoint a')
      await expect(asUser(c, 'member', 'select public.icplc_merge_participants($1,$2,$3::jsonb)', [KEEP, DUP, '{}'])).rejects.toThrow(/super admin or regional secretary/)
      await c.query('rollback to savepoint a')
      await expect(asUser(c, 'admin', 'select public.icplc_merge_participants($1,$1,$2::jsonb)', [KEEP, '{}'])).rejects.toThrow(/two different participants/)
      await c.query('rollback to savepoint a')
      await c.query(
        `insert into public.event_configs(id,event_name,sprint_pattern,is_active) values ('bbbbbbbb-1111-0000-0000-000000000002','Other','other-merge',false)`)
      await c.query('delete from public.icplc_identity_maps where participant_id = $1', [DUP]) // links pin a person to their event
      await c.query(`update public.icplc_participants set event_id = 'bbbbbbbb-1111-0000-0000-000000000002' where id = $1`, [DUP])
      await expect(asUser(c, 'admin', 'select public.icplc_merge_participants($1,$2,$3::jsonb)', [KEEP, DUP, '{}'])).rejects.toThrow(/different events/)
    })
  })
})
