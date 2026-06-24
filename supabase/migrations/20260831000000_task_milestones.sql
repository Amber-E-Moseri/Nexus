-- ============================================================
-- TASK MILESTONES
-- Personal target dates for tasks (separate from rigid due_date)
-- ============================================================

create table if not exists public.task_milestones (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  milestone_date date not null,
  label text,  -- optional: "Target", "Start", "Review", "Personal deadline", etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_id, user_id)  -- one milestone per task per user
);

-- Indexes
create index if not exists idx_task_milestones_task on public.task_milestones(task_id);
create index if not exists idx_task_milestones_user on public.task_milestones(user_id);
create index if not exists idx_task_milestones_user_date on public.task_milestones(user_id, milestone_date);

-- Enable RLS
alter table public.task_milestones enable row level security;

-- Policy: Users can read/write only their own milestones
drop policy if exists "users_see_own_milestones" on public.task_milestones;
create policy "users_see_own_milestones"
  on public.task_milestones for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Updated_at trigger
drop trigger if exists task_milestones_updated_at on public.task_milestones;
create trigger task_milestones_updated_at
  before update on public.task_milestones
  for each row
  execute function public.set_updated_at();
