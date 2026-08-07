-- Analytics Foundation: analytics_events (event bus)
-- Layer 2 in the adoption system's layered architecture.
-- Populated by trigger on activity_log INSERT + backfill function.
-- All adoption metrics, health scores, onboarding completion, and nudges derive from this table.

-- ─── analytics_events ─────────────────────────────────────────────────────────

create table if not exists public.analytics_events (
  id            uuid        primary key default gen_random_uuid(),
  event         text        not null,
  actor_id      uuid        not null references public.users(id) on delete cascade,
  target_type   text,
  target_id     uuid,
  department_id uuid        references public.departments(id) on delete set null,
  metadata      jsonb       not null default '{}',
  occurred_at   timestamptz not null default now(),
  source        text        not null default 'activity_log'
                              check (source in ('activity_log', 'system', 'realtime'))
);

create index if not exists analytics_events_actor_event_idx
  on public.analytics_events (actor_id, event, occurred_at desc);

create index if not exists analytics_events_target_idx
  on public.analytics_events (target_type, target_id);

create index if not exists analytics_events_dept_time_idx
  on public.analytics_events (department_id, occurred_at desc);

create index if not exists analytics_events_event_time_idx
  on public.analytics_events (event, occurred_at desc);

alter table public.analytics_events enable row level security;

-- Users see their own events; leads see department; super_admin/regional_secretary sees all
create policy analytics_events_select on public.analytics_events
  for select to authenticated
  using (
    actor_id = auth.uid()
    or current_user_role() in ('super_admin', 'regional_secretary')
    or (
      current_user_role() in ('dept_lead', 'pastor')
      and department_id = current_user_department()
    )
  );

-- Only system (triggers/edge functions) can insert; no direct user writes
create policy analytics_events_insert on public.analytics_events
  for insert to authenticated
  with check (false);

-- ─── Trigger: activity_log → analytics_events ─────────────────────────────────
-- Maps existing activity_log actions to analytics_events.
-- Non-blocking: if this trigger fails, the activity_log INSERT still succeeds.
-- De-duplicates on (event, actor_id, target_id, occurred_at) within same second.

create or replace function public.populate_analytics_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept_id uuid;
begin
  -- Resolve department_id from entity context
  v_dept_id := case
    when new.entity_type = 'task' then
      (select department_id from public.tasks where id = new.entity_id limit 1)
    when new.entity_type = 'meeting' then
      (select department_id from public.meetings where id = new.entity_id limit 1)
    when new.entity_type = 'sprint' then
      (select department_id from public.sprints where id = new.entity_id limit 1)
    when new.entity_type = 'user' then
      (select department_id from public.users where id = new.entity_id limit 1)
    else null
  end;

  -- Insert, silently skip exact duplicate within same second
  insert into public.analytics_events (
    event, actor_id, target_type, target_id, department_id, occurred_at, source
  )
  values (
    new.action,
    coalesce(new.user_id, auth.uid()),
    new.entity_type,
    new.entity_id,
    v_dept_id,
    new.timestamp,
    'activity_log'
  )
  on conflict do nothing;

  return new;
exception when others then
  -- Never let this trigger block the activity_log insert
  return new;
end;
$$;

drop trigger if exists activity_log_to_analytics on public.activity_log;
create trigger activity_log_to_analytics
  after insert on public.activity_log
  for each row execute function public.populate_analytics_event();

-- ─── Backfill: historical activity_log → analytics_events ─────────────────────
-- Run once after applying this migration to seed analytics_events from history.
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING so safe to re-run.

create or replace function public.backfill_analytics_events(
  p_from timestamptz default '2020-01-01'::timestamptz,
  p_to   timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  with resolved as (
    select
      al.action                                                    as event,
      coalesce(al.user_id, '00000000-0000-0000-0000-000000000000'::uuid) as actor_id,
      al.entity_type                                               as target_type,
      al.entity_id                                                 as target_id,
      case
        when al.entity_type = 'task'    then (select department_id from public.tasks    where id = al.entity_id limit 1)
        when al.entity_type = 'meeting' then (select department_id from public.meetings where id = al.entity_id limit 1)
        when al.entity_type = 'sprint'  then (select department_id from public.sprints  where id = al.entity_id limit 1)
        when al.entity_type = 'user'    then (select department_id from public.users    where id = al.entity_id limit 1)
        else null
      end                                                          as department_id,
      al.timestamp                                                 as occurred_at
    from public.activity_log al
    where al.timestamp between p_from and p_to
      and al.user_id is not null
  )
  insert into public.analytics_events (event, actor_id, target_type, target_id, department_id, occurred_at, source)
  select event, actor_id, target_type, target_id, department_id, occurred_at, 'activity_log'
  from resolved
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Grant execute to service_role only (called via edge function or Supabase dashboard)
revoke execute on function public.backfill_analytics_events from public, anon, authenticated;
grant  execute on function public.backfill_analytics_events to service_role;
