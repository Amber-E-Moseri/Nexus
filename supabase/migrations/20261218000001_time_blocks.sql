-- ============================================================
-- TIME BLOCKS (Planner Phase 1)
-- Per-user scheduled work time for tasks, separate from the
-- immutable due_date. Supports parent/subtask block linking
-- with a preserved minute offset, plus an all-day flag for the
-- planner's all-day row.
--
-- Spec deviations (agreed in review):
--   * FK targets public.users (codebase convention; there is no
--     profiles table and public.auth.users is not addressable).
--   * UNIQUE allows multiple blocks per task (one per start slot);
--     the spec's later UNIQUE(task_id, user_id) would forbid
--     splitting a task across several work sessions.
--   * Blocks may not span midnight: valid_times enforces
--     start < end within one scheduled_date.
-- ============================================================

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,

  -- Scheduling
  scheduled_date date not null,
  scheduled_start_time time not null,
  scheduled_end_time time not null,
  is_all_day boolean not null default false,

  -- Subtask linking
  parent_time_block_id uuid references public.time_blocks(id) on delete set null,
  time_offset_from_parent int, -- minutes from parent block start; null when unlinked

  -- Calendar sync (Phase 2)
  synced_to_calendar boolean not null default false,
  google_calendar_event_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (task_id, user_id, scheduled_date, scheduled_start_time),
  constraint time_blocks_valid_times check (scheduled_start_time < scheduled_end_time),
  constraint time_blocks_no_self_parent check (parent_time_block_id is null or parent_time_block_id <> id)
);

create index if not exists idx_time_blocks_user_date on public.time_blocks(user_id, scheduled_date);
create index if not exists idx_time_blocks_task on public.time_blocks(task_id);
create index if not exists idx_time_blocks_parent on public.time_blocks(parent_time_block_id);

alter table public.time_blocks enable row level security;

-- Time blocks are strictly personal: each user sees and edits only their own.
drop policy if exists "users_manage_own_time_blocks" on public.time_blocks;
create policy "users_manage_own_time_blocks"
  on public.time_blocks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists time_blocks_updated_at on public.time_blocks;
create trigger time_blocks_updated_at
  before update on public.time_blocks
  for each row
  execute function public.set_updated_at();
