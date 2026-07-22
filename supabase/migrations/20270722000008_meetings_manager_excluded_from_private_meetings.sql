-- Close the last open gap: the meetings_manager grant was still
-- unconditional in meetings_select/update/delete, same class of bug as
-- dept_lead and ORS (closed in 20270722000002/000003) — no visibility
-- check, so a meetings_manager grant holder could view/edit/delete any
-- private meeting including regionalsecretary@lwcanada.org's.
--
-- Scoping it to visibility = 'published' closes that: meetings_manager
-- grant holders keep full access to published meetings (their actual
-- purpose — day-to-day meeting/roster management), and still manage their
-- own private meetings via created_by/allowed_editors, but lose access to
-- other people's private meetings.

drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    (
      public.current_user_role() = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(created_by, visibility)
    )
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
    or (
      public.user_has_grant(auth.uid(), 'meetings_manager')
      and visibility = 'published'
    )
    or exists (
      select 1 from public.group_space_members gsm
      where gsm.user_id = auth.uid()
        and gsm.group_space_id = meetings.department_id
    )
    or (
      visibility = 'published'
      and public.current_user_role() is distinct from 'group_member'
      and (department_id = public.current_user_department() or department_id is null)
    )
  );

drop policy if exists "meetings_update" on public.meetings;

create policy "meetings_update" on public.meetings
  for update to authenticated
  using (
    (
      public.current_user_role() = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(created_by, visibility)
    )
    or auth.uid() = any(allowed_editors)
    or created_by = auth.uid()
    or (
      public.has_space_role_anywhere(auth.uid(), 'ors')
      and visibility = 'published'
    )
    or (
      public.has_space_role(auth.uid(), department_id, 'dept_lead')
      and visibility = 'published'
    )
    or (
      public.user_has_grant(auth.uid(), 'meetings_manager')
      and visibility = 'published'
    )
  );

drop policy if exists "meetings_delete" on public.meetings;

create policy "meetings_delete" on public.meetings
  for delete to authenticated
  using (
    (
      public.current_user_role() = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(created_by, visibility)
    )
    or created_by = auth.uid()
    or (
      public.has_space_role_anywhere(auth.uid(), 'ors')
      and visibility = 'published'
    )
    or (
      public.has_space_role(auth.uid(), department_id, 'dept_lead')
      and visibility = 'published'
    )
    or (
      public.user_has_grant(auth.uid(), 'meetings_manager')
      and visibility = 'published'
    )
  );
