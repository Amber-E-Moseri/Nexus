-- Room Assignments tab is reachable by regional_secretary, Programs-space members,
-- users with an explicit rooms_access grant, and Accommodation sprint team members
-- (see RegistrationEcosystem.jsx hasRoomsAccess) — none of which are in
-- current_user_role() in ('super_admin','dept_lead','pastor'), the only roles the
-- original registration_config write policy allowed. Every save from those users
-- (saveKey('room-assignments', ...) upserts) was silently rejected by RLS: the UI
-- updated in-memory so the drag looked like it worked, but nothing persisted, so a
-- refresh (or opening the page on another device) reverted to the last state an
-- actual admin/pastor had saved — often empty.
--
-- Fix: add a narrow policy, scoped to key = 'room-assignments' only, that lets any
-- authenticated user write — matching the reasoning already used for the table's
-- read policy ("the page already gates non-permitted users out"). Other keys
-- (roster, registrations, targets, last-import) stay admin/pastor-only.

drop policy if exists "Registration room assignments writable by any authenticated user" on public.registration_config;
create policy "Registration room assignments writable by any authenticated user"
  on public.registration_config for all
  using (key = 'room-assignments' and auth.uid() is not null)
  with check (key = 'room-assignments' and auth.uid() is not null);
