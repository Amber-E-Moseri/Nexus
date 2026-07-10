-- ============================================================
-- PERSONAL LIST
-- ============================================================
-- A user's Personal List is (a) their private tasks (tasks.is_personal = true,
-- which the schema + insert policy already support) and (b) references to
-- team tasks "added" to the list without moving them — the task keeps living
-- in its original space/list; the pin is just a second location.
--
-- Two parts:
--   1. personal_list_tasks — per-user pins of existing tasks.
--   2. Privacy hardening — personal tasks were readable by every super_admin
--      (tasks_select_admin), by dept leads when the task carried a
--      department_id (tasks_select_lead; TaskModal preserves the opening
--      space's department_id on personal tasks), and by a member's pastor
--      (tasks_select_pastor matches on assignee). Personal tasks are private
--      to their creator/assignee, so each of those policies now excludes
--      other people's personal rows. tasks_select_member already handles
--      creator/assignee visibility, so owners lose nothing.

-- ─── 1. Pins ────────────────────────────────────────────────

create table if not exists public.personal_list_tasks (
  user_id uuid not null references public.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  sort_order bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

create index if not exists idx_personal_list_tasks_task
  on public.personal_list_tasks(task_id);

alter table public.personal_list_tasks enable row level security;

drop policy if exists "personal_list_tasks_owner" on public.personal_list_tasks;
create policy "personal_list_tasks_owner"
on public.personal_list_tasks
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Reading a pinned task still goes through the tasks_select_* policies, so a
-- pin never widens access: if the underlying task becomes invisible to the
-- user, the join simply returns nothing for it.

-- ─── 2. Privacy hardening on tasks selects ──────────────────

drop policy if exists "tasks_select_admin" on public.tasks;
create policy "tasks_select_admin"
on public.tasks
for select
to authenticated
using (
  deleted_at is null
  and public.current_user_role() = 'super_admin'
  and (is_personal = false or created_by = auth.uid() or assignee_id = auth.uid())
);

drop policy if exists "tasks_select_pastor" on public.tasks;
create policy "tasks_select_pastor"
on public.tasks
for select
to authenticated
using (
  deleted_at is null
  and is_personal = false
  and exists (
    select 1
    from public.pastor_members pm
    where pm.pastor_id = auth.uid() and pm.member_id = tasks.assignee_id
  )
);

-- tasks_select_lead exists in two shapes: the live one
-- (current_user_role/current_user_department) and the Phase 3 space_roles
-- version (has_space_role, 20261216000000_phase3_rls_swap.sql — staged but
-- not yet pushed). Recreate whichever shape applies so this migration works
-- whether or not Phase 3 has run first, adding the is_personal guard to both.
do $$
begin
  drop policy if exists "tasks_select_lead" on public.tasks;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_space_role'
  ) then
    execute $pol$
      create policy "tasks_select_lead" on public.tasks
        for select to authenticated
        using (
          deleted_at is null
          and is_personal = false
          and public.has_space_role(auth.uid(), department_id, 'dept_lead')
        )
    $pol$;
  else
    execute $pol$
      create policy "tasks_select_lead" on public.tasks
        for select to authenticated
        using (
          deleted_at is null
          and is_personal = false
          and public.current_user_role() = 'dept_lead'
          and public.current_user_department() = department_id
        )
    $pol$;
  end if;
end $$;
