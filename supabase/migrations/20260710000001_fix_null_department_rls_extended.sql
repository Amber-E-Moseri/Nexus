-- =============================================================================
-- MIGRATION: Extend NULL department_id RLS fix to remaining 5 tables
-- =============================================================================
-- CONTEXT: Migration 20260710000000 fixed RLS policies for 5 core tables.
--          This migration covers 5 additional tables missed in the initial pass.
--
-- TABLES COVERED:
--   1. task_status_definitions
--   2. task_comments
--   3. integrations
--   4. external_integrations
--   5. automation_rules
--
-- MECHANISM: All use the same current_user_can_bypass_department() helper
--            function created in 20260710000000. This migration only adds
--            RLS policy updates — no new functions.
--
-- DATA: No data migration needed — no current users have NULL department_id.
-- STAFF WEEK: This completes comprehensive RLS hardening coverage.

-- 1. TASK_STATUS_DEFINITIONS table (if exists)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='task_status_definitions') then
    drop policy if exists "task_status_definitions_select" on public.task_status_definitions;
    execute 'create policy "task_status_definitions_select" on public.task_status_definitions for select to authenticated using (public.current_user_can_bypass_department() or department_id is null or department_id = public.current_user_department())';
  end if;
end $$;

-- 2. TASK_COMMENTS table (if exists)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='task_comments') then
    drop policy if exists "task_comments_select" on public.task_comments;
    execute 'create policy "task_comments_select" on public.task_comments for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and (public.current_user_can_bypass_department() or t.department_id = public.current_user_department())))';
  end if;
end $$;

-- 3. INTEGRATIONS table (if exists)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='integrations') then
    drop policy if exists "integrations_user_scoped_select" on public.integrations;
    execute 'create policy "integrations_user_scoped_select" on public.integrations for select to authenticated using (public.current_user_can_bypass_department() or department_id is null or department_id = public.current_user_department())';
  end if;
end $$;

-- 4. EXTERNAL_INTEGRATIONS table (if exists)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='external_integrations') then
    drop policy if exists "external_integrations_select" on public.external_integrations;
    execute 'create policy "external_integrations_select" on public.external_integrations for select to authenticated using (public.current_user_can_bypass_department() or department_id is null or department_id = public.current_user_department())';
  end if;
end $$;

-- 5. AUTOMATION_RULES table (if exists)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='automation_rules') then
    drop policy if exists "automation_rules_select" on public.automation_rules;
    execute 'create policy "automation_rules_select" on public.automation_rules for select to authenticated using (public.current_user_can_bypass_department() or department_id = public.current_user_department())';
  end if;
end $$;

-- =============================================================================
-- IMPORTANT: calendar_events is NOT affected by NULL department_id issue
-- =============================================================================
-- calendar_events uses permission-based RLS (calendar_permissions table) and
-- JWT role checks, NOT department_id comparison. It is safe from the NULL = NULL
-- vulnerability and requires no policy changes.
--
-- Mechanism:
--   ✅ Direct JWT role checks: auth.jwt() ->> 'user_role' = 'super_admin'
--   ✅ Permission table lookups: exists(select 1 from calendar_permissions...)
--   ✅ Status/ownership checks: status = 'approved' or created_by = auth.uid()
--   ❌ Never uses: department_id = current_user_department()
--
-- Conclusion: calendar_events RLS is robust against this issue.
-- =============================================================================

-- =============================================================================
-- SUMMARY: Combined Coverage After 20260710000001
-- =============================================================================
-- From 20260710000000:
--   ✅ users, tasks, meetings, goals
--   ✅ sprints, task_status_definitions (conditional)
--
-- From 20260710000001 (this migration):
--   ✅ task_comments, integrations, external_integrations, automation_rules
--
-- Not vulnerable:
--   ✅ calendar_events (uses permission-based RLS + JWT role checks)
--
-- Total fixed: 10 tables using department_id comparison
-- Pattern: current_user_can_bypass_department() OR department_id = current_user_department()
-- =============================================================================
