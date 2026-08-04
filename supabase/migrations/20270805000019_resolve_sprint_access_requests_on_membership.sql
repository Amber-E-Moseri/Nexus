-- Direct member additions must resolve any outstanding request for that sprint.
create or replace function public.resolve_sprint_access_request_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sprint_access_requests
  set status = 'approved',
      responded_at = coalesce(responded_at, now()),
      response_message = coalesce(response_message, 'Access was granted directly.')
  where sprint_id = new.sprint_id
    and user_id = new.user_id
    and status = 'pending';

  return new;
end;
$$;

drop trigger if exists resolve_sprint_access_request_on_membership on public.sprint_members;
create trigger resolve_sprint_access_request_on_membership
  after insert on public.sprint_members
  for each row execute function public.resolve_sprint_access_request_on_membership();

-- Clean up requests left behind before the trigger existed.
update public.sprint_access_requests request
set status = 'approved',
    responded_at = coalesce(request.responded_at, now()),
    response_message = coalesce(request.response_message, 'Access was granted directly.')
from public.sprint_members member
where request.sprint_id = member.sprint_id
  and request.user_id = member.user_id
  and request.status = 'pending';
