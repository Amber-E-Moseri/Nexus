-- Onboarding System: Layer 4 (User State)
-- Tables:
--   user_onboarding_state    — overall onboarding journey per user
--   user_onboarding_progress — per-step completion records
--   user_achievements        — badge-style milestones earned by users

-- ─── user_onboarding_state ────────────────────────────────────────────────────

create table if not exists public.user_onboarding_state (
  user_id             uuid        primary key references public.users(id) on delete cascade,
  onboarding_version  integer     not null default 1,
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  dismissed_at        timestamptz,
  last_seen_at        timestamptz,
  updated_at          timestamptz not null default now()
);

alter table public.user_onboarding_state enable row level security;

-- Users manage their own state; dept_lead can see their dept members' state
create policy onboarding_state_own on public.user_onboarding_state
  for all to authenticated
  using (
    user_id = auth.uid()
    or current_user_role() in ('super_admin', 'regional_secretary')
    or (
      current_user_role() in ('dept_lead', 'pastor')
      and user_id in (
        select id from public.users where department_id = current_user_department()
      )
    )
  )
  with check (user_id = auth.uid());

create or replace function public.set_onboarding_state_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger onboarding_state_updated_at
  before update on public.user_onboarding_state
  for each row execute function public.set_onboarding_state_updated_at();

-- ─── user_onboarding_progress ─────────────────────────────────────────────────

create table if not exists public.user_onboarding_progress (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users(id) on delete cascade,
  step_key     text        not null,
  completed_at timestamptz,
  metadata     jsonb       not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, step_key)
);

create index if not exists onboarding_progress_user_idx
  on public.user_onboarding_progress (user_id, completed_at);

alter table public.user_onboarding_progress enable row level security;

-- Users can see and update their own progress
create policy onboarding_progress_own on public.user_onboarding_progress
  for all to authenticated
  using (
    user_id = auth.uid()
    or current_user_role() in ('super_admin', 'regional_secretary')
    or (
      current_user_role() in ('dept_lead', 'pastor')
      and user_id in (
        select id from public.users where department_id = current_user_department()
      )
    )
  )
  with check (user_id = auth.uid());

create trigger onboarding_progress_updated_at
  before update on public.user_onboarding_progress
  for each row execute function public.set_onboarding_state_updated_at();

-- ─── user_achievements ────────────────────────────────────────────────────────
-- Lightweight badge milestones earned through natural Nexus use.
-- Populated automatically by the onboarding listener (client-side) or edge functions.
-- Keys defined in src/lib/adoption-config.ts:
--   profile_complete, first_task, first_task_update, first_meeting,
--   meeting_recorder, nova_explorer, dept_contributor, onboarding_complete

create table if not exists public.user_achievements (
  user_id         uuid        not null references public.users(id) on delete cascade,
  achievement_key text        not null,
  earned_at       timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

create index if not exists achievements_user_idx
  on public.user_achievements (user_id, earned_at desc);

alter table public.user_achievements enable row level security;

-- Users see their own; leads see dept achievements for team visibility
create policy achievements_select on public.user_achievements
  for select to authenticated
  using (
    user_id = auth.uid()
    or current_user_role() in ('super_admin', 'regional_secretary')
    or (
      current_user_role() in ('dept_lead', 'pastor')
      and user_id in (
        select id from public.users where department_id = current_user_department()
      )
    )
  );

-- Only system or the user themselves can insert achievements
create policy achievements_insert on public.user_achievements
  for insert to authenticated
  with check (user_id = auth.uid());

-- ─── RPC: mark_onboarding_step_complete ───────────────────────────────────────
-- Called by the frontend onboarding listener when an event fires.
-- Upserts step completion and, if all steps done, marks the journey complete.
-- v_total_steps is passed in so the function stays config-agnostic.

create or replace function public.mark_onboarding_step_complete(
  p_step_key     text,
  p_total_steps  integer,
  p_metadata     jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_completed    integer;
begin
  -- Ensure onboarding state row exists
  insert into public.user_onboarding_state (user_id)
  values (v_user_id)
  on conflict (user_id) do update set last_seen_at = now();

  -- Upsert step completion
  insert into public.user_onboarding_progress (user_id, step_key, completed_at, metadata)
  values (v_user_id, p_step_key, now(), p_metadata)
  on conflict (user_id, step_key) do nothing;

  -- Check if all steps are now complete
  select count(*) into v_completed
  from public.user_onboarding_progress
  where user_id = v_user_id and completed_at is not null;

  if v_completed >= p_total_steps then
    update public.user_onboarding_state
    set completed_at = now()
    where user_id = v_user_id and completed_at is null;
  end if;
end;
$$;

grant execute on function public.mark_onboarding_step_complete to authenticated;

-- ─── RPC: dismiss_onboarding ──────────────────────────────────────────────────

create or replace function public.dismiss_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_onboarding_state (user_id, dismissed_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set dismissed_at = now();
end;
$$;

grant execute on function public.dismiss_onboarding to authenticated;

-- ─── RPC: get_onboarding_status ───────────────────────────────────────────────
-- Returns the current onboarding state + completed steps for a user.
-- Used by the OnboardingChecklist component and Nova tool.

create or replace function public.get_onboarding_status(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := coalesce(p_user_id, auth.uid());
  v_state    public.user_onboarding_state;
  v_steps    jsonb;
begin
  -- Permission check: only self, leads for their dept, or admins
  if v_user_id <> auth.uid()
     and current_user_role() not in ('super_admin', 'regional_secretary', 'dept_lead', 'pastor')
  then
    raise exception 'not authorized';
  end if;

  select * into v_state from public.user_onboarding_state where user_id = v_user_id;

  select jsonb_agg(jsonb_build_object(
    'step_key', step_key,
    'completed_at', completed_at
  )) into v_steps
  from public.user_onboarding_progress
  where user_id = v_user_id;

  return jsonb_build_object(
    'started_at',      v_state.started_at,
    'completed_at',    v_state.completed_at,
    'dismissed_at',    v_state.dismissed_at,
    'last_seen_at',    v_state.last_seen_at,
    'onboarding_version', coalesce(v_state.onboarding_version, 1),
    'steps',           coalesce(v_steps, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_onboarding_status to authenticated;
