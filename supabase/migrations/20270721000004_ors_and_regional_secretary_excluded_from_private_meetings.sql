-- ORS and regional_secretary should not see other people's private meetings.
--
-- meetings_select (20270102000000) grants org-wide, visibility-blind access
-- to super_admin, regional_secretary, and anyone holding the ORS space role:
--
--   public.current_user_role() in ('super_admin', 'regional_secretary')
--   or ...
--   or public.has_space_role_anywhere(auth.uid(), 'ors')
--
-- Neither clause checks visibility, so both ORS and regional_secretary
-- currently see private meetings across every department. Marking a meeting
-- "private" is meant to hide it from everyone except its creator, invited
-- viewers/editors, and true org-wide admins — regional_secretary's and ORS's
-- org-wide reach is for managing meetings/rosters/logistics on *published*
-- meetings, not a backdoor into other people's private ones.
--
-- Fix: super_admin keeps unconditional access. regional_secretary and ORS
-- are moved to their own clause scoped to visibility = 'published' — they
-- still see every published meeting org-wide (unchanged), and still see
-- their own private meetings via the existing created_by/allowed_viewers/
-- allowed_editors clauses, but lose visibility into other people's private
-- meetings.

drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or created_by = auth.uid()
    or auth.uid() = any(allowed_viewers)
    or auth.uid() = any(allowed_editors)
    or (
      (public.current_user_role() = 'regional_secretary' or public.has_space_role_anywhere(auth.uid(), 'ors'))
      and visibility = 'published'
    )
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
    or public.user_has_grant(auth.uid(), 'meetings_manager')
    -- Group-space members: their group's meetings only, any visibility —
    -- the group space is private to its members.
    or exists (
      select 1 from public.group_space_members gsm
      where gsm.user_id = auth.uid()
        and gsm.group_space_id = meetings.department_id
    )
    -- Published meetings: scoped to the viewer's own department, or
    -- genuinely org-wide ad-hoc meetings (no department). Excludes
    -- group_member — their only path is the group-space clause above, so a
    -- group member never sees another department's or another group's
    -- published meetings just for being "published".
    or (
      visibility = 'published'
      and public.current_user_role() is distinct from 'group_member'
      and (department_id = public.current_user_department() or department_id is null)
    )
  );
