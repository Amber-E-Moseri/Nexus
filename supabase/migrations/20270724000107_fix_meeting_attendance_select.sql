-- =============================================================================
-- Fix: attendance edits don't stick after refresh
-- -----------------------------------------------------------------------------
-- "meeting_attendance_select_hierarchy" (20260608, original schema) only
-- grants read access via: your own attendance row, super_admin, or
-- `meetings.department_id = current_user_department()`. Two real gaps:
--
-- 1. SQL NULL semantics: for any meeting with department_id IS NULL (every
--    1-on-1 meeting, every org-wide meeting — exactly the meeting types this
--    session's Flock/privacy work centers on), `department_id = current_user_
--    department()` evaluates to NULL, not true, even when the viewer's own
--    department is also null (NULL = NULL is NULL, never true in SQL). So
--    the department branch silently grants nobody access on these meetings.
-- 2. The meeting's own creator/full-editor was never in this union at all —
--    only their OWN attendance row (if they happened to also be an
--    attendee, which a host/creator usually isn't) or a department match
--    would let them see attendance. A regional_secretary logging a 1-on-1
--    with a pastor (different department, department_id null) could save
--    attendance successfully via set_meeting_attendance (SECURITY DEFINER,
--    bypasses RLS) but then immediately read back zero rows under their own
--    RLS-scoped SELECT — looking exactly like "the edit didn't stick",
--    both right after saving and on every subsequent refresh.
--
-- Fix: attendance visibility should follow the same "can you see this
-- meeting at all" model already codified in meetings_select (unlike notes/
-- open items, who's attending isn't sensitive beyond that — it's the same
-- information a calendar invite already exposes to every invitee).
-- Mirrors the live meetings_select policy from
-- 20270722000008_meetings_manager_excluded_from_private_meetings.sql.
-- =============================================================================

drop policy if exists "meeting_attendance_select_hierarchy" on public.meeting_attendance;

create policy "meeting_attendance_select_hierarchy" on public.meeting_attendance
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.meetings m
      where m.id = meeting_attendance.meeting_id
        and (
          (
            public.current_user_role() = 'super_admin'
            and not public.is_regionalsecretary_private_meeting(m.created_by, m.visibility)
          )
          or m.created_by = auth.uid()
          or auth.uid() = any(m.allowed_viewers)
          or auth.uid() = any(m.allowed_editors)
          or (
            (public.current_user_role() = 'regional_secretary' or public.has_space_role_anywhere(auth.uid(), 'ors'))
            and m.visibility = 'published'
          )
          or (
            public.has_space_role(auth.uid(), m.department_id, 'dept_lead')
            and m.visibility = 'published'
          )
          or (
            public.user_has_grant(auth.uid(), 'meetings_manager')
            and m.visibility = 'published'
          )
          or exists (
            select 1 from public.group_space_members gsm
            where gsm.user_id = auth.uid() and gsm.group_space_id = m.department_id
          )
          or (
            m.visibility = 'published'
            and public.current_user_role() is distinct from 'group_member'
            and (m.department_id = public.current_user_department() or m.department_id is null)
          )
        )
    )
  );
