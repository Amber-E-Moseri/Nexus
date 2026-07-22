-- Force every meeting created by regionalsec@lwcanada.org to be private,
-- not just the ones backfilled in 20270722000001.
--
-- The app only sets visibility = 'private' when the creator explicitly
-- toggles it in MeetingModal, and ScheduleMeetingModal hardcodes
-- visibility = 'published' with no toggle at all. Without enforcement at
-- the DB layer, any new meeting he creates (or an edit that flips visibility
-- back to 'published') would silently fall out of the private/RLS
-- protections set up in 20270722000001-000003.

create or replace function public.force_regionalsec_meetings_private()
returns trigger as $$
begin
  if new.created_by = (select id from public.users where email = 'regionalsec@lwcanada.org') then
    new.visibility := 'private';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists force_regionalsec_meetings_private on public.meetings;

create trigger force_regionalsec_meetings_private
  before insert or update on public.meetings
  for each row
  execute function public.force_regionalsec_meetings_private();
