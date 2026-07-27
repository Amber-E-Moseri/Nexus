-- Fix: infinite recursion in meeting_spaces_select policy
--
-- 20270803000000_cross_dept_meetings.sql introduced a circular RLS
-- reference: meeting_spaces_select checked meeting_spaces (via ms2) to
-- verify parent-meeting visibility, while meetings_select also checks
-- meeting_spaces for its cross-dept share clause. Postgres detects this
-- as infinite recursion at query time ("infinite recursion detected in
-- policy for relation meeting_spaces").
--
-- Fix: meeting_spaces_select no longer re-checks meeting_spaces itself.
-- If a user can see the parent meeting through any of its other
-- visibility rules (creator, viewer, editor, dept match), that's
-- sufficient to let them see which departments it's shared with.

drop policy if exists "meeting_spaces_select" on public.meeting_spaces;

create policy "meeting_spaces_select" on public.meeting_spaces
  for select to authenticated using (
    (select public.current_user_role()) = 'super_admin'
    or exists (
      select 1 from public.meetings m where m.id = meeting_spaces.meeting_id
        and (
          m.created_by = (select auth.uid())
          or (select auth.uid()) = any(m.allowed_viewers)
          or (select auth.uid()) = any(m.allowed_editors)
          or (m.visibility = 'published' and (m.department_id = (select public.current_user_department()) or m.department_id is null))
        )
    )
  );
