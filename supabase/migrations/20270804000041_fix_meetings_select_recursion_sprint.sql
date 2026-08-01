-- Fix: infinite recursion re-introduced by 20270804000040_meetings_select_sprint_member_clause
--
-- That migration dropped + recreated meetings_select using a raw
--   EXISTS(SELECT 1 FROM public.meeting_spaces ms ...)
-- for the cross-dept share clause, which re-introduced the mutual cycle
-- that 20270803000002 fixed by wrapping the lookup in the
-- meeting_shared_with_department() SECURITY DEFINER function.
--
-- Cycle:
--   meetings_select -> EXISTS(meeting_spaces) -> meeting_spaces_select
--     -> EXISTS(meetings) -> meetings_select -> ...
--
-- This migration re-applies the 20270803000002 fix and also folds in the
-- sprint-linked clause from 20270804000040 (which is safe because
-- sprint_meetings_select does not query meetings).

drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    (
      (select public.current_user_role()) = 'super_admin'
      and not public.is_regionalsecretary_private_meeting(created_by, visibility)
    )
    or created_by = (select auth.uid())
    or (select auth.uid()) = any(allowed_viewers)
    or (select auth.uid()) = any(allowed_editors)
    or (
      ((select public.current_user_role()) = 'regional_secretary'
       or public.has_space_role_anywhere((select auth.uid()), 'ors'))
      and visibility = 'published'
    )
    or (
      public.has_space_role((select auth.uid()), department_id, 'dept_lead')
      and visibility = 'published'
    )
    or (
      public.user_has_grant((select auth.uid()), 'meetings_manager')
      and visibility = 'published'
    )
    or exists (
      select 1 from public.group_space_members gsm
      where gsm.user_id = (select auth.uid())
        and gsm.group_space_id = meetings.department_id
    )
    or (
      visibility = 'published'
      and (select public.current_user_role()) is distinct from 'group_member'
      and (department_id = (select public.current_user_department()) or department_id is null)
    )
    -- cross-dept share: use security definer fn to avoid meeting_spaces RLS cycle
    or (
      visibility = 'published'
      and (select public.current_user_role()) is distinct from 'group_member'
      and public.meeting_shared_with_department(id, (select public.current_user_department()))
    )
    -- sprint-linked: published meeting linked to a sprint the viewer is a member of
    or (
      visibility = 'published'
      and exists (
        select 1 from public.sprint_meetings sm
        where sm.meeting_id = meetings.id
          and public.is_sprint_member(sm.sprint_id)
      )
    )
  );
