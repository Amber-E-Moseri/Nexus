-- READ-ONLY production inspection (catalog metadata only: no table rows, no personal data).
-- Run in the Supabase SQL editor against PRODUCTION and paste the output back. Every statement is a SELECT on
-- pg_catalog / information_schema. It changes nothing.

-- 1. Columns of the team / membership tables (does sprint_team_members have sprint_id, and is it NOT NULL?)
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('sprint_team_members', 'sprint_teams', 'sprint_members')
order by table_name, ordinal_position;

-- 2. Constraints (PK, unique, FK incl. delete rule, check)
select conrelid::regclass as table_name, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.sprint_team_members'::regclass, 'public.sprint_teams'::regclass, 'public.sprint_members'::regclass)
order by 1, 3, 2;

-- 3. Indexes
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in ('sprint_team_members', 'sprint_teams', 'sprint_members') order by 1, 2;

-- 4. RLS enabled / forced
select relname, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class where oid in ('public.sprint_team_members'::regclass, 'public.sprint_teams'::regclass, 'public.sprint_members'::regclass,
  'public.sprints'::regclass, 'public.departments'::regclass, 'public.group_space_members'::regclass, 'public.users'::regclass, 'public.pastor_members'::regclass);

-- 5. ALL policies on the tables involved in the recursion cycles (definitions are policy text, not data)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('sprint_team_members', 'sprint_teams', 'sprint_members', 'sprints', 'departments', 'group_space_members', 'users', 'pastor_members')
order by tablename, policyname;

-- 6. Triggers on the membership tables (incl. any audit or sprint_id-filling trigger)
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public' and event_object_table in ('sprint_team_members', 'sprint_teams', 'sprint_members', 'event_configs')
order by 1, 2;

-- 7. Function definitions used by membership changes and by the policies (prosecdef = SECURITY DEFINER)
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'delete_sprint_team', 'add_existing_user_to_sprint', 'create_sprint_with_template', 'can_manage_sprint', 'is_sprint_member',
  'has_sprint_viewer_privilege', 'can_view_space', 'current_user_department', 'is_programs_team', 'is_super_admin',
  'has_space_role_anywhere', 'current_user_can_bypass_department', 'current_user_role', 'is_temp_member_expired',
  'icplc_event_sprint_ids', 'icplc_can_read_participants', 'icplc_can_write_participants', 'icplc_can_import', 'icplc_is_sprint_member',
  'icplc_has_event_team_membership', 'icplc_resolve_unmatched_row', 'icplc_backfill_participants_from_import')
order by 1, 2;

-- 8. Which migrations production believes it has applied (versions and names only; compare with supabase/migrations)
select count(*) as applied_count, max(version) as latest_version from supabase_migrations.schema_migrations;
select version, name from supabase_migrations.schema_migrations order by version;

-- 9. Does anything in production reference sprint_id on sprint_team_members (column default / dependent objects)?
select 'view/function mentions sprint_team_members.sprint_id' as what, p.proname as name
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc ilike '%sprint_team_members%sprint_id%';
