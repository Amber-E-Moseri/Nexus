-- Harden Ministry Calendar auto-approval.
-- 1. Add a durable Programs-space flag to departments.
-- 2. Provide a SECURITY DEFINER helper for server-side/RLS approval checks.
-- 3. Enforce approved-vs-pending inserts at the database layer.

alter table public.departments
  add column if not exists is_programs boolean not null default false;

update public.departments
set is_programs = true
where name ilike '%programs%';

create unique index if not exists departments_one_programs_space_idx
  on public.departments (is_programs)
  where is_programs = true;

create or replace function public.can_auto_approve_calendar_event(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_role text;
  v_department_id uuid;
  v_programs_department_id uuid;
begin
  select role, department_id
    into v_role, v_department_id
  from public.users
  where id = p_user_id;

  if not found then
    return false;
  end if;

  if v_role in ('super_admin', 'regional_secretary') then
    return true;
  end if;

  select id
    into v_programs_department_id
  from public.departments
  where is_programs = true
  limit 1;

  if v_programs_department_id is null then
    return false;
  end if;

  return v_department_id = v_programs_department_id;
end;
$$;

comment on function public.can_auto_approve_calendar_event(uuid) is
  'Returns true when a user can insert Ministry Calendar events directly as approved.';

drop policy if exists "calendar_events_insert" on public.calendar_events;
create policy "calendar_events_insert"
  on public.calendar_events
  for insert
  to authenticated
  with check (
    auth.role() = 'authenticated'
    and created_by = auth.uid()
    and (
      coalesce(status, 'pending') = 'pending'
      or (
        status = 'approved'
        and approved_by = auth.uid()
        and approved_at is not null
        and public.can_auto_approve_calendar_event(auth.uid())
      )
    )
  );
