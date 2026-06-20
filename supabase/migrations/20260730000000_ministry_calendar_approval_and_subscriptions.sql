-- ============================================================
-- MINISTRY CALENDAR — APPROVAL WORKFLOW & ICAL SUBSCRIPTIONS
-- ============================================================
-- Extends calendar_events with full approval workflow.
-- Adds calendar_permissions table (super admin grants can_manage).
-- Adds calendar_subscriptions table for iCal token feeds.
-- Handles org-wide and department-scoped events.

-- ---- calendar_permissions table ------------------------------
-- Super admin grants can_manage permission to specific users.
-- This enables auto-approval on event submission.
create table if not exists public.calendar_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  permission text not null default 'can_manage' check (permission = 'can_manage'),
  granted_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  unique(user_id, permission)
);

create index if not exists calendar_permissions_user_id_idx on public.calendar_permissions(user_id);
create index if not exists calendar_permissions_permission_idx on public.calendar_permissions(permission);

alter table public.calendar_permissions enable row level security;

create policy "calendar_permissions_select_super_admin"
  on public.calendar_permissions
  for select
  to authenticated
  using ((auth.jwt() ->> 'user_role') = 'super_admin');

create policy "calendar_permissions_insert_super_admin"
  on public.calendar_permissions
  for insert
  to authenticated
  with check ((auth.jwt() ->> 'user_role') = 'super_admin');

create policy "calendar_permissions_delete_super_admin"
  on public.calendar_permissions
  for delete
  to authenticated
  using ((auth.jwt() ->> 'user_role') = 'super_admin');

-- ---- calendar_subscriptions table ---------------------------
-- Users generate tokens to subscribe to iCal feeds.
-- scope: 'all' = org-wide approved events
-- scope: 'department' = department-scoped events only (requires department_id)
-- URL: GET /calendar-ical?token={token} returns .ics file
create table if not exists public.calendar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  scope text not null default 'all' check (scope in ('all', 'department')),
  department_id uuid references public.departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  constraint department_required_for_dept_scope check (
    (scope = 'all' and department_id is null) or
    (scope = 'department' and department_id is not null)
  )
);

create index if not exists calendar_subscriptions_user_id_idx on public.calendar_subscriptions(user_id);
create index if not exists calendar_subscriptions_token_idx on public.calendar_subscriptions(token);
create index if not exists calendar_subscriptions_department_id_idx on public.calendar_subscriptions(department_id);

alter table public.calendar_subscriptions enable row level security;

create policy "calendar_subscriptions_select_own"
  on public.calendar_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "calendar_subscriptions_insert_own"
  on public.calendar_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "calendar_subscriptions_delete_own"
  on public.calendar_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- extend calendar_events table --------------------------
alter table public.calendar_events
  add column if not exists department_id uuid references public.departments(id) on delete set null;

alter table public.calendar_events
  add column if not exists recurrence_rule text;

-- Status was added in 20260726000000; ensure it exists with correct constraint
alter table public.calendar_events
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'));

-- These were also added in 20260726000000; add if missing
alter table public.calendar_events
  add column if not exists approved_by uuid references public.users(id) on delete set null;

alter table public.calendar_events
  add column if not exists approved_at timestamptz;

alter table public.calendar_events
  add column if not exists rejection_note text;

create index if not exists calendar_events_department_id_idx on public.calendar_events(department_id);
create index if not exists calendar_events_status_idx on public.calendar_events(status);
create index if not exists calendar_events_approved_by_idx on public.calendar_events(approved_by);

-- ---- RLS for calendar_events (org-wide approval workflow) ---
-- Replaces policies from 20260726000000 for consistency.
-- Scoped events (space_id or sprint_id) bypass approval.
-- Org-wide events visible when approved, to approvers, or to submitter.

drop policy if exists "calendar_events_select" on public.calendar_events;
drop policy if exists "calendar_events_insert" on public.calendar_events;
drop policy if exists "calendar_events_update" on public.calendar_events;
drop policy if exists "calendar_events_delete" on public.calendar_events;

create policy "calendar_events_select"
  on public.calendar_events
  for select
  to authenticated
  using (
    -- Scoped events (space/sprint/dept) always visible to members
    space_id is not null
    or sprint_id is not null
    -- Org-wide events: approved, or user is approver, or user created it
    or status = 'approved'
    or public.has_permission('calendar:write')
    or created_by = auth.uid()
  );

create policy "calendar_events_insert"
  on public.calendar_events
  for insert
  to authenticated
  with check (
    -- Scoped events bypass approval
    space_id is not null
    or sprint_id is not null
    -- Org-wide: can_manage auto-approves; others submit as pending
    or status in ('pending', 'approved')
  );

create policy "calendar_events_update"
  on public.calendar_events
  for update
  to authenticated
  using (
    -- Approvers (super_admin or calendar:write permission)
    public.has_permission('calendar:write')
    -- Scoped events: space/sprint leads or creator
    or ((space_id is not null or sprint_id is not null)
        and ((auth.jwt() ->> 'user_role') in ('super_admin', 'dept_lead') or created_by = auth.uid()))
    -- Org-wide: creator can edit pending/rejected only
    or ((created_by = auth.uid() or submitted_by = auth.uid())
        and status in ('draft', 'rejected', 'pending'))
  )
  with check (
    public.has_permission('calendar:write')
    or ((space_id is not null or sprint_id is not null)
        and ((auth.jwt() ->> 'user_role') in ('super_admin', 'dept_lead') or created_by = auth.uid()))
    or ((created_by = auth.uid() or submitted_by = auth.uid())
        and status in ('draft', 'pending', 'rejected'))
  );

create policy "calendar_events_delete"
  on public.calendar_events
  for delete
  to authenticated
  using (
    (auth.jwt() ->> 'user_role') = 'super_admin'
    or public.has_permission('calendar:write')
    or ((space_id is not null or sprint_id is not null)
        and ((auth.jwt() ->> 'user_role') = 'dept_lead' or created_by = auth.uid()))
  );

-- ---- RPC: approve event ---
create or replace function public.approve_calendar_event(
  p_event_id uuid,
  p_approver_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
begin
  -- Check approver permission
  if not public.has_permission(p_approver_id, 'calendar:write') then
    return json_build_object('error', 'Unauthorized');
  end if;

  -- Update event
  update public.calendar_events
  set status = 'approved',
      approved_by = p_approver_id,
      approved_at = now()
  where id = p_event_id
  returning * into v_event;

  if v_event is null then
    return json_build_object('error', 'Event not found');
  end if;

  return json_build_object('success', true, 'event', row_to_json(v_event));
end $$;

grant execute on function public.approve_calendar_event to authenticated;

-- ---- RPC: reject event ---
create or replace function public.reject_calendar_event(
  p_event_id uuid,
  p_approver_id uuid,
  p_rejection_note text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
begin
  -- Check approver permission
  if not public.has_permission(p_approver_id, 'calendar:write') then
    return json_build_object('error', 'Unauthorized');
  end if;

  -- Update event
  update public.calendar_events
  set status = 'rejected',
      approved_by = p_approver_id,
      approved_at = now(),
      rejection_note = p_rejection_note
  where id = p_event_id
  returning * into v_event;

  if v_event is null then
    return json_build_object('error', 'Event not found');
  end if;

  return json_build_object('success', true, 'event', row_to_json(v_event));
end $$;

grant execute on function public.reject_calendar_event to authenticated;

-- ---- RPC: list pending approvals ---
create or replace function public.list_pending_approvals()
returns table (
  id uuid,
  title text,
  description text,
  start_date timestamptz,
  end_date timestamptz,
  created_by uuid,
  submitted_by uuid,
  department_id uuid,
  status text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select id, title, description, start_date, end_date, created_by,
         submitted_by, department_id, status, created_at
  from public.calendar_events
  where status = 'pending'
    and space_id is null
    and sprint_id is null
  order by created_at asc;
$$;

grant execute on function public.list_pending_approvals() to authenticated;

-- ---- RPC: generate ical subscription token ---
create or replace function public.generate_ical_token(
  p_user_id uuid,
  p_scope text default 'all',
  p_department_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_subscription uuid;
begin
  -- Only user can generate their own token
  if auth.uid() != p_user_id then
    return json_build_object('error', 'Unauthorized');
  end if;

  -- Validate scope
  if p_scope not in ('all', 'department') then
    return json_build_object('error', 'Invalid scope');
  end if;

  -- If department scope, require department_id
  if p_scope = 'department' and p_department_id is null then
    return json_build_object('error', 'department_id required for department scope');
  end if;

  -- Generate random hex token
  v_token := substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 64);

  -- Insert subscription
  insert into public.calendar_subscriptions (user_id, token, scope, department_id)
  values (p_user_id, v_token, p_scope, p_department_id)
  returning id into v_subscription;

  return json_build_object(
    'success', true,
    'token', v_token,
    'scope', p_scope,
    'department_id', p_department_id
  );
end $$;

grant execute on function public.generate_ical_token to authenticated;
