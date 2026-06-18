drop policy if exists "reports_select" on public.meeting_attendance_reports;
drop policy if exists "users can view own attendance reports" on public.meeting_attendance_reports;
drop policy if exists "Users can view their own attendance reports" on public.meeting_attendance_reports;
drop policy if exists "reports_select_public" on public.meeting_attendance_reports;

create policy "reports_select_public"
  on public.meeting_attendance_reports
  for select
  to anon, authenticated
  using (true);

drop policy if exists "expected_attendees_select_anon" on public.expected_attendees;

create policy "expected_attendees_select_anon"
  on public.expected_attendees
  for select
  to anon
  using (true);
