-- Fix email typo from 20270722000001/20270722000004: the real account is
-- regionalsecretary@lwcanada.org (Pastor IK Nwokem, role regional_secretary),
-- not regionalsec@lwcanada.org (no such user exists). Both prior migrations
-- were no-ops against real data as a result — this re-runs the backfill and
-- repoints the trigger function at the correct address.

update public.meetings
set visibility = 'private',
    updated_at = now()
where created_by = (select id from public.users where email = 'regionalsecretary@lwcanada.org')
  and visibility is distinct from 'private';

create or replace function public.force_regionalsec_meetings_private()
returns trigger as $$
begin
  if new.created_by = (select id from public.users where email = 'regionalsecretary@lwcanada.org') then
    new.visibility := 'private';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
