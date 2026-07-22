-- dept_lead should not see other people's private meetings either.
--
-- 20270721000004 scoped regional_secretary/ORS's org-wide reach to
-- visibility = 'published' so marking a meeting "private" actually hides it
-- from them. The dept_lead clause in that same policy was left unconditional
-- (`has_space_role(auth.uid(), department_id, 'dept_lead')`), so any dept_lead
-- of a meeting's department could still see it regardless of visibility —
-- the same backdoor, just via a different role. This closes that gap:
-- dept_lead keeps full org-wide access to published meetings in their
-- department (unchanged), and still sees their own private meetings via the
-- existing created_by/allowed_viewers/allowed_editors clauses, but loses
-- visibility into other people's private meetings.

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
    or (
      public.has_space_role(auth.uid(), department_id, 'dept_lead')
      and visibility = 'published'
    )
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
