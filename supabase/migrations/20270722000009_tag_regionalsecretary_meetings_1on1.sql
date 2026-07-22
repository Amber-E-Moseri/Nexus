-- Tag regionalsecretary@lwcanada.org's current meetings with a new
-- "1 on 1 Meeting" category. The meetings list UI derives its type filter
-- chips dynamically from the distinct meeting_type values present
-- (UnifiedMeetingsView.jsx: allTypes = Object.keys(grouped).sort()), and
-- formatMeetingType() renders snake_case as title case, so no UI changes
-- are needed — "1_on_1_meeting" renders as "1 On 1 Meeting" the same way
-- "staff_meeting" already renders as "Staff Meeting".
--
-- One-time backfill of his existing meetings only, not enforced going
-- forward — unlike visibility, not every future meeting he creates is
-- necessarily a 1-on-1.

update public.meetings
set meeting_type = '1_on_1_meeting'
where created_by = (select id from public.users where email = 'regionalsecretary@lwcanada.org');
