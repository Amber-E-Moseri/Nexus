-- ============================================================
-- MINISTRY CALENDAR — Approval Workflow & iCal Subscriptions
-- ============================================================

-- ─── Calendar Permissions ───────────────────────────────────────
-- Managers who can approve/reject/review submitted events.
-- Super admin is implicit (not listed here).

-- calendar_permissions already exists from 20260730000000; add missing columns
alter table if exists public.calendar_permissions
  add column if not exists can_manage boolean default false;

alter table if exists public.calendar_permissions
  add column if not exists granted_by uuid references public.users(id) on delete set null;

create index if not exists calendar_permissions_user_idx on public.calendar_permissions(user_id);
create index if not exists calendar_permissions_can_manage_idx on public.calendar_permissions(can_manage);

alter table public.calendar_permissions enable row level security;

-- Only super admin can read/write calendar permissions
create policy "super_admin_permissions" on public.calendar_permissions
  for all
  using (auth.jwt() ->> 'user_role' = 'super_admin');

create policy "view_own_permission" on public.calendar_permissions
  for select
  using (user_id = auth.uid());

-- ─── Calendar Subscriptions (iCal) ──────────────────────────────
-- Token-based public subscriptions for calendar feeds (webcal://).
-- No auth required on the calendar-ical edge function — token is the auth.

create table if not exists public.calendar_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token       text not null unique default substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 64),
  scope       text not null default 'all'
                check (scope in ('all', 'department')),
  dept_id     uuid references public.departments(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(user_id, scope, dept_id)
);

create index if not exists calendar_subscriptions_token_idx on public.calendar_subscriptions(token);
create index if not exists calendar_subscriptions_user_idx on public.calendar_subscriptions(user_id);

alter table public.calendar_subscriptions enable row level security;

-- Users manage their own subscriptions
create policy "manage_own_subscriptions" on public.calendar_subscriptions
  for all
  using (user_id = auth.uid());

-- ─── Update calendar_events Table ──────────────────────────────
-- Add approval workflow fields and scope fields.

alter table public.calendar_events
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'));

alter table public.calendar_events
  add column if not exists approved_by uuid references public.users(id) on delete set null;

alter table public.calendar_events
  add column if not exists approved_at timestamptz;

alter table public.calendar_events
  add column if not exists rejection_note text;

alter table public.calendar_events
  add column if not exists is_org_wide boolean not null default false;

alter table public.calendar_events
  add column if not exists recurrence_rule text;

alter table public.calendar_events
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists calendar_events_status_idx on public.calendar_events(status);
create index if not exists calendar_events_created_by_idx on public.calendar_events(created_by);
create index if not exists calendar_events_department_idx on public.calendar_events(department_id);

-- ─── RLS Policies for calendar_events ────────────────────────────
-- Drop old policies and re-create with approval workflow logic.

do $$
begin
  -- Drop old policies if they exist
  drop policy if exists "calendar_events_select_all" on public.calendar_events;
  drop policy if exists "calendar_events_write" on public.calendar_events;
end $$;

-- Authenticated users can view approved events or events they created (pending or not)
drop policy if exists "calendar_events_view_approved" on public.calendar_events;
drop policy if exists "calendar_events_select" on public.calendar_events;
create policy "calendar_events_view_approved"
  on public.calendar_events for select
  using (
    auth.role() = 'authenticated'
    and (
      status = 'approved'
      or created_by = auth.uid()
      or auth.jwt() ->> 'user_role' = 'super_admin'
      or exists (
        select 1 from public.calendar_permissions
        where user_id = auth.uid() and can_manage = true
      )
    )
  );

-- Managers and super admin can view all events (including pending)
drop policy if exists "calendar_events_view_all_for_managers" on public.calendar_events;
create policy "calendar_events_view_all_for_managers"
  on public.calendar_events for select
  using (
    auth.jwt() ->> 'user_role' = 'super_admin'
    or exists (
      select 1 from public.calendar_permissions
      where user_id = auth.uid() and can_manage = true
    )
  );

-- Any authenticated user can insert (submit) events — status defaults to pending
drop policy if exists "calendar_events_insert" on public.calendar_events;
create policy "calendar_events_insert"
  on public.calendar_events for insert
  with check (auth.role() = 'authenticated');

-- Managers and super admin can update (approve/reject/edit)
drop policy if exists "calendar_events_update_managers" on public.calendar_events;
drop policy if exists "calendar_events_update" on public.calendar_events;
create policy "calendar_events_update_managers"
  on public.calendar_events for update
  using (
    auth.jwt() ->> 'user_role' = 'super_admin'
    or exists (
      select 1 from public.calendar_permissions
      where user_id = auth.uid() and can_manage = true
    )
  );

-- Creators can update their own pending events
drop policy if exists "calendar_events_update_creator" on public.calendar_events;
create policy "calendar_events_update_creator"
  on public.calendar_events for update
  using (
    created_by = auth.uid()
    and status = 'pending'
  );

-- Only super admin can delete
drop policy if exists "calendar_events_delete_admin" on public.calendar_events;
drop policy if exists "calendar_events_delete" on public.calendar_events;
create policy "calendar_events_delete_admin"
  on public.calendar_events for delete
  using (auth.jwt() ->> 'user_role' = 'super_admin');

-- ─── RPC Functions for Approval Workflow ────────────────────────

create or replace function public.get_pending_calendar_events()
returns setof public.calendar_events
language sql security definer
as $$
  select * from public.calendar_events
  where status = 'pending'
  order by created_at desc;
$$;

create or replace function public.approve_calendar_event(
  event_id uuid
)
returns void
language sql security definer
as $$
  update public.calendar_events
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  where id = event_id;
$$;

create or replace function public.reject_calendar_event(
  event_id uuid,
  note text
)
returns void
language sql security definer
as $$
  update public.calendar_events
  set status = 'rejected',
      approved_by = auth.uid(),
      approved_at = now(),
      rejection_note = note
  where id = event_id;
$$;

-- ─── Activity Log (Audit Trail) ─────────────────────────────────
-- Record approval actions.

create or replace function public.log_calendar_event_action()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'approved' and old.status = 'pending' then
    insert into public.activity_log (user_id, action, entity_type, entity_id)
    values (auth.uid(), 'calendar_event_approved', 'calendar_event', new.id);
  elsif new.status = 'rejected' and old.status = 'pending' then
    insert into public.activity_log (user_id, action, entity_type, entity_id)
    values (auth.uid(), 'calendar_event_rejected', 'calendar_event', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists log_calendar_event_action on public.calendar_events;
create trigger log_calendar_event_action
  after update on public.calendar_events
  for each row
  execute function public.log_calendar_event_action();

-- ─── Indexes for Performance ────────────────────────────────────

create index if not exists calendar_events_status_created_idx
  on public.calendar_events(status, created_at desc);

create index if not exists calendar_events_approved_idx
  on public.calendar_events(approved_by)
  where status in ('approved', 'rejected');
