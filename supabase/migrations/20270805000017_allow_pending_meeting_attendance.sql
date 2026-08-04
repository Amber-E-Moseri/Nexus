-- Scheduled meetings need a neutral attendee state before attendance is taken.
alter table public.meeting_attendance
  drop constraint if exists meeting_attendance_status_check;

alter table public.meeting_attendance
  add constraint meeting_attendance_status_check
  check (status in ('pending', 'present', 'absent', 'excused'));
