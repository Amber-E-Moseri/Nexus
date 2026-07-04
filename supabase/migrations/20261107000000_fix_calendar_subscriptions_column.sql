-- ============================================================
-- FIX: calendar_subscriptions schema drift — dept_id vs department_id
-- ============================================================
-- Root cause:
--   20260730000000_ministry_calendar_approval_and_subscriptions.sql
--     created calendar_subscriptions with column: department_id
--   20260805000000_ministry_calendar_approval_and_subscriptions.sql
--     attempted CREATE TABLE IF NOT EXISTS with column: dept_id
--     but the table already existed, so the column was never added.
--
-- All application code (src/features/calendar/lib/calendar.js,
-- src/types/calendar.types.ts) references dept_id as the canonical name.
--
-- This migration reconciles the schema to match the code.
-- It is safe to run repeatedly (all operations use IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- Step 1: Add dept_id column if it doesn't already exist.
-- If 20260730 ran first, the table has department_id but not dept_id.
-- If 20260805 somehow ran first, this is a no-op.
alter table public.calendar_subscriptions
  add column if not exists dept_id uuid references public.departments(id) on delete cascade;

-- Step 2: Back-fill dept_id from department_id where dept_id is null
-- and department_id is set (handles rows created before this fix).
update public.calendar_subscriptions
  set dept_id = department_id
  where dept_id is null
    and department_id is not null;

-- Step 3: Add the unique constraint the app relies on (user_id, scope, dept_id).
-- The constraint name matches what the upsert onConflict uses.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.calendar_subscriptions'::regclass
      and conname = 'calendar_subscriptions_user_id_scope_dept_id_key'
  ) then
    alter table public.calendar_subscriptions
      add constraint calendar_subscriptions_user_id_scope_dept_id_key
      unique (user_id, scope, dept_id);
  end if;
end $$;

-- Step 4: Add index on dept_id for query performance.
create index if not exists calendar_subscriptions_dept_id_idx
  on public.calendar_subscriptions(dept_id);

-- Step 5: Drop the old department_id index if it was created by 20260730.
-- We keep the department_id column for now (see note below) to avoid
-- dropping data. A follow-up migration can drop it after verification.
drop index if exists public.calendar_subscriptions_department_id_idx;

-- NOTE on rollback:
--   To revert: drop constraint calendar_subscriptions_user_id_scope_dept_id_key,
--   drop column dept_id, and recreate calendar_subscriptions_department_id_idx.
--   The department_id column is intentionally left in place during this migration
--   to allow safe rollback without data loss.
