-- =============================================================================
-- Planner: task_schedule, google_calendar_tokens, org_calendar_config
-- =============================================================================

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- task_schedule
-- -------------------------------------------------------------------------
create table if not exists public.task_schedule (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  scheduled_date   date not null,
  start_time       time not null,
  end_time         time not null,
  google_event_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (task_id, user_id, scheduled_date)
);

create index if not exists task_schedule_user_date_idx on public.task_schedule (user_id, scheduled_date);
create index if not exists task_schedule_task_idx     on public.task_schedule (task_id);
create index if not exists task_schedule_gcal_idx     on public.task_schedule (google_event_id)
  where google_event_id is not null;

alter table public.task_schedule enable row level security;

create policy "task_schedule_select" on public.task_schedule
  for select to authenticated using (user_id = auth.uid());

create policy "task_schedule_insert" on public.task_schedule
  for insert to authenticated with check (user_id = auth.uid());

create policy "task_schedule_update" on public.task_schedule
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "task_schedule_delete" on public.task_schedule
  for delete to authenticated using (user_id = auth.uid());

create trigger task_schedule_updated_at
  before update on public.task_schedule
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- google_calendar_tokens
-- -------------------------------------------------------------------------
create table if not exists public.google_calendar_tokens (
  user_id              uuid primary key references public.users(id) on delete cascade,
  access_token         text not null,
  refresh_token        text not null,
  token_expiry         timestamptz not null,
  google_calendar_id   text not null default 'primary',
  connected_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.google_calendar_tokens enable row level security;

create policy "gcal_tokens_select" on public.google_calendar_tokens
  for select to authenticated using (user_id = auth.uid());

create policy "gcal_tokens_insert" on public.google_calendar_tokens
  for insert to authenticated with check (true);

create policy "gcal_tokens_update" on public.google_calendar_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "gcal_tokens_delete" on public.google_calendar_tokens
  for delete to authenticated using (user_id = auth.uid());

create trigger gcal_tokens_updated_at
  before update on public.google_calendar_tokens
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- org_calendar_config
-- -------------------------------------------------------------------------
create table if not exists public.org_calendar_config (
  id                    uuid primary key default gen_random_uuid(),
  google_calendar_id    text not null,
  google_calendar_name  text not null,
  public_subscribe_url  text,
  connected_by          uuid references public.users(id),
  connected_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.org_calendar_config enable row level security;

create policy "org_cal_config_select" on public.org_calendar_config
  for select to authenticated using (true);

create policy "org_cal_config_write" on public.org_calendar_config
  for all to authenticated
  using (auth.jwt() ->> 'user_role' = 'super_admin')
  with check (auth.jwt() ->> 'user_role' = 'super_admin');

create trigger org_cal_config_updated_at
  before update on public.org_calendar_config
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------------------
-- google_event_id on calendar_events (for org calendar sync)
-- -------------------------------------------------------------------------
alter table public.calendar_events
  add column if not exists google_event_id text;
