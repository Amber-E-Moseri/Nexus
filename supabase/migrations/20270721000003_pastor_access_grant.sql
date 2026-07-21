-- Pastor IK Nwokem (regionalsecretary@lwcanada.org) is regional_secretary FIRST,
-- pastor second. His base users.role is 'regional_secretary' (not 'pastor'),
-- which is what regional_secretary-scoped RLS/RPCs key off. He also carries
-- pastoral-care duties, so rather than flipping role (which would drop his
-- direct regional_secretary role matches elsewhere and reopen the
-- role='pastor' vs role='regional_secretary' conflict), grant him a new
-- 'pastor_access' user_grants row: an additive capability, same pattern as
-- the existing 'regional_secretary_access' grant used for the inverse case.
insert into public.user_grants (user_id, grant_type)
select id, 'pastor_access'
from public.users
where email ilike 'regionalsecretary@lwcanada.org'
on conflict (user_id, grant_type, resource_type) do nothing;

-- assign_pastor_member / remove_pastor_member (20270101000006) hard-require
-- v_pastor.role = 'pastor'. Widen to also accept the pastor_access grant, so
-- a regional_secretary who holds it can be selected as a pastoral-care
-- assignee without changing their base role.
create or replace function public.assign_pastor_member(p_pastor_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pastor public.users%rowtype;
  v_member public.users%rowtype;
  v_count int;
begin
  perform public.assert_can_manage_pastoral_assignment(p_member_id);

  select * into v_pastor from public.users where id = p_pastor_id;
  select * into v_member from public.users where id = p_member_id;
  if v_pastor.role <> 'pastor'
     and not exists (
       select 1 from public.user_grants
       where user_id = v_pastor.id and grant_type = 'pastor_access'
     )
  then
    raise exception 'Selected user is not a pastor';
  end if;
  if v_member.role <> 'member' then
    raise exception 'Selected user is not a member';
  end if;

  if exists (
    select 1 from public.pastor_members
    where member_id = p_member_id and pastor_id = p_pastor_id
  ) then
    return; -- idempotent no-op, already assigned
  end if;

  select count(*) into v_count from public.pastor_members where member_id = p_member_id;
  if v_count >= 2 then
    raise exception 'Member already has the maximum of two pastors assigned';
  end if;

  begin
    insert into public.pastor_members (pastor_id, member_id, is_primary)
    values (p_pastor_id, p_member_id, v_count = 0);
  exception when unique_violation then
    -- Concurrent assignment to the same member raced past the count check above; the
    -- unique index is the real guard, this just gives the friendly message instead of
    -- a raw constraint-violation error.
    raise exception 'Member already has the maximum of two pastors assigned';
  end;
end;
$$;

grant execute on function public.assign_pastor_member(uuid, uuid) to authenticated;
