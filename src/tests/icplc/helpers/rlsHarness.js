/**
 * Throwaway-database harness for ICPLC authorization tests.
 *
 * Builds a NEW database from the repo's real migration SQL plus minimal stub data tables, and drops it afterwards. The
 * database named by ICPLC_RLS_ADMIN_URL (or SUPABASE_DB_URL) is only used to CREATE/DROP the throwaway one; none of
 * its data is read or written. Tests skip when no Postgres is reachable (ICPLC_REQUIRE_DB=1 makes that a failure).
 * Queries run as a persona through `set role authenticated` + a JWT subject, the way PostgREST does.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

export const MIG = (f) => readFileSync(resolve(process.cwd(), 'supabase/migrations', f), 'utf8')
export const ADMIN_URL = process.env.ICPLC_RLS_ADMIN_URL || process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export const REQUIRE_DB = process.env.ICPLC_REQUIRE_DB === '1'

export const STUB = `
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
create table public.departments (id uuid primary key, name text, is_programs boolean default false);
create table public.users (id uuid primary key, role text, department_id uuid);
create table public.event_configs (id uuid primary key, event_name text, sprint_pattern text);
create table public.sprints (id uuid primary key, name text);
create table public.sprint_members (sprint_id uuid, user_id uuid, role text);
create table public.sprint_teams (id uuid primary key, sprint_id uuid, name text);
create table public.sprint_team_members (team_id uuid, user_id uuid);
create table public.icplc_participants (
  id uuid primary key default gen_random_uuid(), event_id uuid not null, full_name text, email text, subgroup text,
  leadership text, nexus_user_id uuid, passport_country text, participation_status text default 'tracking',
  override_fields jsonb not null default '{}');
create table public.icplc_participant_tags (participant_id uuid, tag_id uuid);
create table public.icplc_tags (id uuid primary key default gen_random_uuid(), event_id uuid, name text);
create table public.icplc_identity_maps (id uuid primary key default gen_random_uuid(), event_id uuid not null, participant_id uuid, source_type text, source_key text);
create table public.icplc_import_batches (id uuid primary key default gen_random_uuid(), event_id uuid not null);
create table public.icplc_import_rows (id uuid primary key default gen_random_uuid(), batch_id uuid not null);
create table public.icplc_email_claims (id uuid primary key default gen_random_uuid(), participant_id uuid);
create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid);
create table public.communication_email_templates (id uuid primary key default gen_random_uuid(), event_config_id uuid);
do $$ declare t text; begin
  foreach t in array array['icplc_participants','icplc_participant_tags','icplc_tags','icplc_identity_maps','icplc_import_batches','icplc_import_rows','icplc_email_claims','activity_log','communication_email_templates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select on public.%I to anon', t);
  end loop; end $$;
`


export const CURRENT_USER_ROLE_SQL = (() => {
  const s = MIG('20270720000006_current_user_helpers_db_first.sql')
  const a = s.indexOf('create or replace function public.current_user_role()')
  return s.slice(a, s.indexOf('$$;', s.indexOf('$$', a) + 2) + 3)
})()

/** Policy/function state as shipped before F2, in migration order. */
export const PRE_F2 = ['20270930000031_icplc_programs_department_access.sql', '20271003000001_icplc_group_pastor_authorization.sql',
  '20271003000012_icplc_gp_auth_normalization.sql', '20271003000002_icplc_sprint_member_direct_read.sql']

const urlFor = (name) => { const u = new URL(ADMIN_URL); u.pathname = `/${name}`; return u.toString() }

export async function openThrowawayDb({ migrations = PRE_F2, seed = '' } = {}) {
  const h = { available: false, skipReason: '', db: null, admin: null, dbName: '' }
  try {
    h.admin = new pg.Client({ connectionString: ADMIN_URL }); await h.admin.connect()
  } catch (e) { h.skipReason = `no Postgres reachable at ${ADMIN_URL}: ${e.code || e.message}`; h.admin = null; return wrap(h) }
  h.dbName = `icplc_rls_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  await h.admin.query(`create database ${h.dbName}`)
  h.db = new pg.Client({ connectionString: urlFor(h.dbName) }); await h.db.connect()
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await h.admin.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$`)
  }
  await h.db.query(STUB)
  await h.db.query(CURRENT_USER_ROLE_SQL)
  for (const f of migrations) await h.db.query(MIG(f))
  if (seed) await h.db.query(seed)
  h.available = true
  return wrap(h)
}

function wrap(h) {
  return {
    get available() { return h.available },
    get skipReason() { return h.skipReason },
    get db() { return h.db },
    /** A second independent connection to the throwaway DB (for real concurrency tests). */
    async newClient() { const c = new pg.Client({ connectionString: urlFor(h.dbName) }); await c.connect(); return c },
    /**
     * Run fn(q) as `uid` (a JWT subject) under `role` inside one transaction. Rolled back unless { commit: true }
     * (and always rolled back if fn throws, e.g. a refused statement).
     */
    async asUser(uid, fn, role = 'authenticated', { commit = false } = {}) {
      await h.db.query('begin')
      let ok = false
      try {
        await h.db.query(`set local role ${role}`)
        await h.db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ''])
        const out = await fn((q, p) => h.db.query(q, p))
        ok = true
        return out
      } finally { await h.db.query(ok && commit ? 'commit' : 'rollback') }
    },
    /** Skip (or fail, with ICPLC_REQUIRE_DB=1) when no database is available. */
    need(ctx) { if (!h.available) { if (REQUIRE_DB) throw new Error(h.skipReason); ctx.skip(h.skipReason) } },
    async close() {
      try { if (h.db) await h.db.end() } catch { /* ignore */ }
      try { if (h.admin && h.dbName) await h.admin.query(`drop database if exists ${h.dbName}`) } catch { /* ignore */ }
      try { if (h.admin) await h.admin.end() } catch { /* ignore */ }
    },
  }
}
