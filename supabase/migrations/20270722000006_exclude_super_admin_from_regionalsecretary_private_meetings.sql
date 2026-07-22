-- Carve-out: super_admin loses its unconditional bypass specifically for
-- private meetings created by regionalsecretary@lwcanada.org (Pastor IK
-- Nwokem). Every other private meeting in the system is unaffected — this
-- does NOT remove super_admin's general oversight bypass, only excludes this
-- one creator's private meetings from it. Marking a meeting "private" for
-- this account is meant to mean nobody but him (or anyone he explicitly
-- invites via allowed_viewers/allowed_editors) can see it, full stop.

create or replace function public.is_regionalsecretary_private_meeting(p_created_by uuid, p_visibility text)
returns boolean
language sql
stable
as $$
  select p_visibility = 'private'
    and p_created_by = (select id from public.users where email = 'regionalsecretary@lwcanada.org');
$$;

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
    or public.user_has_grant(auth.uid(), 'meetings_manager')
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
    or public.user_has_grant(auth.uid(), 'meetings_manager')
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
    or public.user_has_grant(auth.uid(), 'meetings_manager')
  );
