-- ============================================================
-- PHASE 5 — MINISTRY CALENDAR + NOTIFICATIONS
-- ============================================================

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text not null default 'event'
    check (event_type in (
      'conference', 'program', 'training', 'prayer',
      'graduation', 'event', 'deadline'
    )),
  start_date timestamptz not null,
  end_date timestamptz,
  all_day boolean not null default true,
  location text,
  space_id uuid references public.departments(id) on delete set null,
  sprint_id uuid references public.sprints(id) on delete set null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_start_idx on public.calendar_events(start_date);
create index if not exists calendar_events_type_idx on public.calendar_events(event_type);

alter table public.calendar_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_events'
      and policyname = 'calendar_events_select_all'
  ) then
    create policy "calendar_events_select_all"
      on public.calendar_events for select to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_events'
      and policyname = 'calendar_events_write'
  ) then
    create policy "calendar_events_write"
      on public.calendar_events for all to authenticated
      using (
        public.current_user_role() in ('super_admin', 'dept_lead')
        or created_by = auth.uid()
      )
      with check (
        public.current_user_role() in ('super_admin', 'dept_lead')
        or created_by = auth.uid()
      );
  end if;
end $$;

create index if not exists notifications_user_id_idx
  on public.notifications(user_id);

create index if not exists notifications_read_idx
  on public.notifications(user_id, read)
  where read = false;

create index if not exists notifications_created_at_idx
  on public.notifications(created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_select_own'
  ) then
    execute $policy$
      create policy "notifications_select_own" on public.notifications
        for select to authenticated
        using (user_id = auth.uid())
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_update_own'
  ) then
    execute $policy$
      create policy "notifications_update_own" on public.notifications
        for update to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_insert_system'
  ) then
    execute $policy$
      create policy "notifications_insert_system" on public.notifications
        for insert to authenticated
        with check (true)
    $policy$;
  end if;
end $$;

-- Enable realtime separately if needed:
-- alter publication supabase_realtime add table notifications;
