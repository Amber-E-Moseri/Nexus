-- Allow sprint members to see published meetings linked to their sprint.
--
-- The existing meetings_select policy has no clause for sprint-linked meetings,
-- so a user who is a sprint member but not in the meeting's department cannot
-- read those rows — the join in SprintMeetingsPanel returns empty even though
-- sprint_meetings rows are visible (sprint_meetings_select allows sprint members).
--
-- Fix: drop + recreate meetings_select with one additional OR clause.
-- Using drop + recreate (not ALTER POLICY) because boolean OR expressions
-- cannot be appended via ALTER POLICY — see cross_dept_meetings migration.
--
-- New clause (appended at end):
--   visibility = 'published'
--   AND the meeting is linked (via sprint_meetings) to a sprint the viewer
--       is a member of (checked via SECURITY DEFINER is_sprint_member function)
--
-- Only published meetings are exposed — private/draft meetings stay private
-- even if a sprint manager links them.

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
      and (department_id = (select public.current_user_department()) or department_id is null)
    )
    -- cross-dept share: published meeting explicitly shared with viewer's department
    or (
      visibility = 'published'
      and exists (
        select 1 from public.meeting_spaces ms
        where ms.meeting_id = meetings.id
          and ms.department_id = (select public.current_user_department())
      )
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
