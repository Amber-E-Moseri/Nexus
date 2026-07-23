-- Fix: adding attendees when scheduling a meeting fails with 403
-- (new row violates row-level security policy for table "meeting_attendance").
--
-- meeting_attendance_write_leads only allowed super_admin, an ORS grant
-- holder anywhere, or dept_lead of the meeting's own department — it never
-- included the meeting's own creator or allowed_editors, unlike every other
-- meeting-scoped write policy (meetings_update, open_items_update, etc.),
-- which delegate to is_meetings_full_editor(). ScheduleMeetingModal.jsx and
-- meetings.js do raw `.from('meeting_attendance').insert(...)` calls (not
-- routed through the set_meeting_attendance RPC), so they hit this policy
-- directly and failed for anyone who wasn't already super_admin/ORS/
-- dept_lead-of-that-department — including the meeting's own creator.
--
-- Fix: delegate to the same is_meetings_full_editor() helper everything
-- else uses, so authorization stays in one place instead of drifting.

drop policy if exists meeting_attendance_write_leads on public.meeting_attendance;
create policy meeting_attendance_write_leads on public.meeting_attendance
  for all
  to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendance.meeting_id
        and is_meetings_full_editor(m.created_by, m.department_id, m.visibility, m.allowed_editors)
    )
  )
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendance.meeting_id
        and is_meetings_full_editor(m.created_by, m.department_id, m.visibility, m.allowed_editors)
    )
  );
