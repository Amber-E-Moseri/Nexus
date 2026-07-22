-- Mark all meetings created by regionalsec@lwcanada.org as private.
--
-- Uses the existing visibility mechanism from 20260911000000_add_meeting_permissions.sql.
-- Combined with 20270721000004_ors_and_regional_secretary_excluded_from_private_meetings.sql,
-- private meetings are hidden from everyone except: the creator, super_admin,
-- invited allowed_viewers/allowed_editors, dept_lead of the meeting's department,
-- and meetings_manager grant holders.

update public.meetings
set visibility = 'private',
    updated_at = now()
where created_by = (select id from public.users where email = 'regionalsec@lwcanada.org')
  and visibility is distinct from 'private';
