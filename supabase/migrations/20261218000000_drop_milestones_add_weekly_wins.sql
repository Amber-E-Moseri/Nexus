-- ============================================================
-- SCRAP MILESTONES → WEEKLY WINS
-- task_milestones ("personal target dates") was a misread of the
-- original ask: a testimonial sheet of wins for the week. The
-- milestone system (targets, reminders, templates) is removed and
-- replaced by a department-shared weekly_wins board.
-- None of these tables had shipped to users yet.
-- ============================================================

-- ---- Drop the milestone system --------------------------------
drop function if exists public.create_milestone_reminders(uuid, uuid);
drop table if exists public.milestone_reminders;
drop table if exists public.milestone_templates;
drop table if exists public.task_milestones;

-- ---- Weekly wins / testimonies --------------------------------
-- One row per win. Shared across the author's department; optionally
-- linked to the task the win came from.
create table if not exists public.weekly_wins (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  week_start date not null, -- Sunday of the week, matching Planner weeks
  content text not null,
  task_id uuid references public.tasks(id) on delete set null,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_weekly_wins_dept_week on public.weekly_wins(department_id, week_start);
create index if not exists idx_weekly_wins_created_by on public.weekly_wins(created_by);

alter table public.weekly_wins enable row level security;

-- Department members see and add their department's wins; super admins
-- see all departments.
drop policy if exists "dept_members_read_wins" on public.weekly_wins;
create policy "dept_members_read_wins"
  on public.weekly_wins for select
  using (
    department_id = current_user_department()
    or current_user_role() = 'super_admin'
  );

drop policy if exists "dept_members_add_wins" on public.weekly_wins;
create policy "dept_members_add_wins"
  on public.weekly_wins for insert
  with check (
    created_by = auth.uid()
    and (
      department_id = current_user_department()
      or current_user_role() = 'super_admin'
    )
  );

-- Only the author (or a super admin) can edit or remove a win.
drop policy if exists "authors_update_own_wins" on public.weekly_wins;
create policy "authors_update_own_wins"
  on public.weekly_wins for update
  using (created_by = auth.uid() or current_user_role() = 'super_admin')
  with check (created_by = auth.uid() or current_user_role() = 'super_admin');

drop policy if exists "authors_delete_own_wins" on public.weekly_wins;
create policy "authors_delete_own_wins"
  on public.weekly_wins for delete
  using (created_by = auth.uid() or current_user_role() = 'super_admin');

drop trigger if exists weekly_wins_updated_at on public.weekly_wins;
create trigger weekly_wins_updated_at
  before update on public.weekly_wins
  for each row
  execute function public.set_updated_at();
