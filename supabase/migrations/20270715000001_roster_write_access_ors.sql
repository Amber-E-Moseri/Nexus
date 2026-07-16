-- ─────────────────────────────────────────────────────────────────────────────
-- Extend roster write access to ORS, regional_secretary, and programs
--
-- The Report/Roster tabs in the Meetings module are available to
-- super_admin, ors, programs, and regional_secretary, but the RLS write
-- policies on expected_attendees / expected_attendee_aliases only allowed
-- super_admin and dept_lead. ORS users are also identified by membership in
-- the ORS department (mirroring the meetings_select_access /
-- meetings_write_access policies), not only by users.role = 'ors'.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.can_manage_roster()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (auth.jwt() ->> 'user_role') in ('super_admin', 'dept_lead', 'ors', 'regional_secretary', 'programs')
    or exists (
      select 1
      from public.departments d
      where d.id = public.current_user_department()
        and d.name in ('ORS', 'ORS Projects')
    );
$$;

-- expected_attendees ----------------------------------------------------------

drop policy if exists "admins can insert expected attendees" on public.expected_attendees;
drop policy if exists "admins can update expected attendees" on public.expected_attendees;
drop policy if exists "admins can delete expected attendees" on public.expected_attendees;
drop policy if exists "roster managers can insert expected attendees" on public.expected_attendees;
drop policy if exists "roster managers can update expected attendees" on public.expected_attendees;
drop policy if exists "roster managers can delete expected attendees" on public.expected_attendees;

create policy "roster managers can insert expected attendees"
  on public.expected_attendees
  for insert
  with check (public.can_manage_roster());

create policy "roster managers can update expected attendees"
  on public.expected_attendees
  for update
  using (public.can_manage_roster())
  with check (public.can_manage_roster());

create policy "roster managers can delete expected attendees"
  on public.expected_attendees
  for delete
  using (public.can_manage_roster());

-- expected_attendee_aliases ---------------------------------------------------

drop policy if exists "aliases_write" on public.expected_attendee_aliases;

create policy "aliases_write"
  on public.expected_attendee_aliases
  for all
  to authenticated
  using (public.can_manage_roster())
  with check (public.can_manage_roster());
