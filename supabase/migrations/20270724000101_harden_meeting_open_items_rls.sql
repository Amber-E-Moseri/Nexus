-- =============================================================================
-- Harden meeting_open_items RLS to follow the parent meeting's privacy
-- -----------------------------------------------------------------------------
-- meeting_open_items RLS was never hardened through the meetings_select
-- audit chain (20270721000004 -> 20270722000001..008 -> 20270723000001):
-- open_items_select still grants read to every regional_secretary org-wide,
-- and to anyone whose department matches the open item's space_id (or
-- everyone, if space_id is null) — completely unconnected to the parent
-- meeting's own visibility/created_by/allowed_viewers/allowed_editors.
-- Since ScheduleMeetingModal.jsx defaults every meeting's department_id to
-- the creator's department, a private 1-on-1's open items leak to the
-- creator's entire department via SpaceOpenItemsTab.jsx.
--
-- Fix: open items get the SAME visibility as their parent meeting's notes
-- (not the meeting's calendar-visibility, which is broader). This is
-- deliberately NOT a verbatim copy of meetings_select: meetings_select
-- grants allowed_viewers unconditional access (so attendees see the
-- meeting exists on their calendar), but that would leak 1:1 open items to
-- the other participant with no sharing step, defeating the goal. Instead
-- this mirrors canSeeNotes (MeetingDetailView.jsx) — allowed_viewers alone
-- is sufficient for non-1:1 meetings, but for a 1:1 meeting a plain
-- allowed_viewers membership additionally requires notes_shared_with,
-- exactly like sharing minutes.
-- =============================================================================

drop policy if exists "open_items_select" on public.meeting_open_items;
drop policy if exists "open_items_insert" on public.meeting_open_items;
drop policy if exists "open_items_update" on public.meeting_open_items;
drop policy if exists "open_items_delete" on public.meeting_open_items;

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
          -- Plain invited viewers: full access for ordinary meetings
          -- (mirrors canSeeNotes's !isOneOnOne branch). For a 1:1, this
          -- alone is NOT enough — must also be explicitly note-shared.
          or (
            auth.uid() = any(m.allowed_viewers)
            and (m.meeting_type is distinct from '1_on_1_meeting' or auth.uid() = any(m.notes_shared_with))
          )
        )
    )
  );

-- INSERT: previously only checked user_id = auth.uid(), with NO check that
-- the inserting user has any relationship to meeting_id at all — anyone
-- authenticated could attach an open item to any meeting_id. Now requires
-- full-editor status on the parent meeting, reusing the existing
-- is_meetings_full_editor() helper (20270723000006) rather than duplicating
-- its branches.
create policy "open_items_insert" on public.meeting_open_items
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_open_items.meeting_id
        and public.is_meetings_full_editor(m.created_by, m.department_id, m.visibility, m.allowed_editors)
    )
  );

create policy "open_items_update" on public.meeting_open_items
  for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.meetings m
      where m.id = meeting_open_items.meeting_id
        and public.is_meetings_full_editor(m.created_by, m.department_id, m.visibility, m.allowed_editors)
    )
  );

create policy "open_items_delete" on public.meeting_open_items
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.meetings m
      where m.id = meeting_open_items.meeting_id
        and public.is_meetings_full_editor(m.created_by, m.department_id, m.visibility, m.allowed_editors)
    )
  );
