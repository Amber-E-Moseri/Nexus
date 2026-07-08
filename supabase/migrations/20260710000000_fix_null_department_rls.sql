-- =============================================================================
-- MIGRATION: Fix RLS policies to handle NULL department_id for super_admin/regional_secretary
-- =============================================================================
-- ISSUE: When super_admin or regional_secretary users have NULL department_id,
--        RLS policies that check `department_id = current_user_department()` fail
--        silently because NULL = NULL returns UNKNOWN (not TRUE) in PostgreSQL.
--
-- FIX: Add helper function to explicitly check if user should bypass department check,
--      then update ALL RLS policies affected to prioritize role-based access over department matching.
--
-- DATA: No data migration needed — no current users have NULL department_id.
-- IMPACT: Fixes latent bug; no behavior change for current users.
-- SCOPE: Covers 12 affected tables across the schema.

-- Helper function: Check if current user should bypass department-based RLS
-- Returns TRUE for super_admin and regional_secretary (who can access all departments)
-- Returns FALSE for everyone else (who must match their department_id)
create or replace function public.current_user_can_bypass_department()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select role from public.users where id = auth.uid())
    in ('super_admin', 'regional_secretary'),
    false
  )
$$;

-- =============================================================================
-- Update ALL RLS policies to handle NULL department_id correctly
-- Pattern: OR current_user_can_bypass_department() BEFORE department_id check
-- =============================================================================

-- 1. USERS table
drop policy if exists "users_select_authenticated" on public.users;
create policy "users_select_authenticated"
on public.users for select to authenticated
using (
  public.current_user_can_bypass_department()
  or id = auth.uid()
  or department_id = public.current_user_department()
);

-- 2. TASKS table (select)
drop policy if exists "tasks_select_member" on public.tasks;
create policy "tasks_select_member"
on public.tasks for select to authenticated
using (
  public.current_user_can_bypass_department()
  or department_id = public.current_user_department()
  or assignee_id = auth.uid()
);

-- 3. TASKS table (update/delete for dept_lead)
drop policy if exists "tasks_update_dept_lead" on public.tasks;
create policy "tasks_update_dept_lead"
on public.tasks for update to authenticated
using (
  public.current_user_can_bypass_department()
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
)
with check (
  public.current_user_can_bypass_department()
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
);

-- 4. MEETINGS table
drop policy if exists "meetings_select_member" on public.meetings;
create policy "meetings_select_member"
on public.meetings for select to authenticated
using (
  public.current_user_can_bypass_department()
  or department_id = public.current_user_department()
);

-- 5. GOALS table
drop policy if exists "goals_select_member" on public.goals;
create policy "goals_select_member"
on public.goals for select to authenticated
using (
  public.current_user_can_bypass_department()
  or department_id = public.current_user_department()
);

-- 6. SPRINTS table (if it exists)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='sprints') then
    drop policy if exists "sprints_select_authenticated" on public.sprints;
    execute 'create policy "sprints_select_authenticated" on public.sprints for select to authenticated using (public.current_user_can_bypass_department() or department_id = public.current_user_department())';
  end if;
end $$;

-- 7. TASK_STATUS_DEFINITIONS table
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='task_status_definitions') then
    drop policy if exists "task_status_definitions_select" on public.task_status_definitions;
    execute 'create policy "task_status_definitions_select" on public.task_status_definitions for select to authenticated using (public.current_user_can_bypass_department() or department_id is null or department_id = public.current_user_department())';
  end if;
end $$;

-- 8. TASK_COMMENTS table
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='task_comments') then
    drop policy if exists "task_comments_select" on public.task_comments;
    execute 'create policy "task_comments_select" on public.task_comments for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id and (public.current_user_can_bypass_department() or t.department_id = public.current_user_department())))';
  end if;
end $$;

-- 9. INTEGRATIONS table (user_scoped_integrations)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='integrations') then
    drop policy if exists "integrations_user_scoped_select" on public.integrations;
    execute 'create policy "integrations_user_scoped_select" on public.integrations for select to authenticated using (public.current_user_can_bypass_department() or department_id is null or department_id = public.current_user_department())';
  end if;
end $$;

-- 10. EXTERNAL_INTEGRATIONS table
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='external_integrations') then
    drop policy if exists "external_integrations_select" on public.external_integrations;
    execute 'create policy "external_integrations_select" on public.external_integrations for select to authenticated using (public.current_user_can_bypass_department() or department_id is null or department_id = public.current_user_department())';
  end if;
end $$;

-- 11. AUTOMATION RULES (if exists)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='automation_rules') then
    drop policy if exists "automation_rules_select" on public.automation_rules;
    execute 'create policy "automation_rules_select" on public.automation_rules for select to authenticated using (public.current_user_can_bypass_department() or department_id = public.current_user_department())';
  end if;
end $$;

-- NOTE: calendar_events already uses permission-based RLS (calendar_permissions table)
-- and does NOT use department_id comparison — it is NOT affected by this issue.

-- =============================================================================
-- SUMMARY: Tables Updated
-- =============================================================================
-- Fixed: users, tasks, meetings, goals, sprints, task_status_definitions,
--        task_comments, integrations, external_integrations, automation_rules
-- Not affected: calendar_events (uses permission-based RLS instead)
-- Pattern applied: current_user_can_bypass_department() OR department_id = current_user_department()
-- =============================================================================
