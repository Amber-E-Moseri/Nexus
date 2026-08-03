-- 1-on-1 meetings are private to their creator and explicit viewers.
-- The super_admin catch-all clause was granting blanket access even to
-- 1_on_1_meeting rows the admin neither created nor was invited to.
--
-- Fix: exclude meeting_type = '1_on_1_meeting' from the super_admin clause.
-- Super admins still see 1-on-1s they created (created_by) or were added
-- to as allowed_viewers / allowed_editors — those clauses are untouched.

drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    -- super_admin sees all published meetings EXCEPT:
    --   • regional-secretary private meetings (is_regionalsecretary_private_meeting)
    --   • 1-on-1 meetings (private to creator + explicit viewers only)
    (
      (select public.current_user_role()) = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(created_by, visibility)
      and meeting_type is distinct from '1_on_1_meeting'
    )
    or created_by = (select auth.uid())
    or (select auth.uid()) = any(allowed_viewers)
    or (select auth.uid()) = any(allowed_editors)
    or (
      ((select public.current_user_role()) = 'regional_secretary'
       or public.has_space_role_anywhere((select auth.uid()), 'ors'))
      and visibility = 'published'
      and meeting_type is distinct from '1_on_1_meeting'
    )
    or (
      public.has_space_role((select auth.uid()), department_id, 'dept_lead')
      and visibility = 'published'
      and meeting_type is distinct from '1_on_1_meeting'
    )
    or (
      public.user_has_grant((select auth.uid()), 'meetings_manager')
      and visibility = 'published'
      and meeting_type is distinct from '1_on_1_meeting'
    )
    or exists (
      select 1 from public.group_space_members gsm
      where gsm.user_id = (select auth.uid())
        and gsm.group_space_id = meetings.department_id
    )
    or (
      visibility = 'published'
      and meeting_type is distinct from '1_on_1_meeting'
      and (select public.current_user_role()) is distinct from 'group_member'
      and (department_id = (select public.current_user_department()) or department_id is null)
    )
    -- cross-dept share: use security definer fn to avoid meeting_spaces RLS cycle
    or (
      visibility = 'published'
      and meeting_type is distinct from '1_on_1_meeting'
      and (select public.current_user_role()) is distinct from 'group_member'
      and public.meeting_shared_with_department(id, (select public.current_user_department()))
    )
    -- sprint-linked: published meeting linked to a sprint the viewer is a member of
    or (
      visibility = 'published'
      and meeting_type is distinct from '1_on_1_meeting'
      and exists (
        select 1 from public.sprint_meetings sm
        where sm.meeting_id = meetings.id
          and public.is_sprint_member(sm.sprint_id)
      )
    )
  );
