-- =============================================================================
-- Widen open_items_select's note-share requirement from "1-on-1 meetings
-- only" to "any private meeting" — matching the same widening just made to
-- canSeeNotes in MeetingDetailView.jsx.
-- -----------------------------------------------------------------------------
-- 20270724000101 correctly stopped 1-on-1 open items leaking to the other
-- attendee via plain allowed_viewers membership, but left every OTHER
-- private meeting type (staff_meeting, department_meeting, regional_group,
-- etc.) on the old rule: any allowed_viewers member sees open items with no
-- explicit share step. Being invited to a private meeting means you can see
-- it exists on your calendar — it was never meant to mean you can see its
-- notes/open items too. Only a published meeting should grant that for free.
-- =============================================================================

drop policy if exists "open_items_select" on public.meeting_open_items;

create policy "open_items_select" on public.meeting_open_items
  for select to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_open_items.meeting_id
        and (
          (
            public.current_user_role() = 'super_admin'
            and not public.is_regionalsecretary_private_meeting(m.created_by, m.visibility)
          )
          or m.created_by = auth.uid()
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
          -- Plain invited viewers: free access once the meeting is
          -- published. While the meeting is still private (any type, not
          -- just 1-on-1), allowed_viewers alone is NOT enough — must also
          -- be explicitly note-shared (mirrors canSeeNotes).
          or (
            auth.uid() = any(m.allowed_viewers)
            and (m.visibility = 'published' or auth.uid() = any(m.notes_shared_with))
          )
        )
    )
  );
