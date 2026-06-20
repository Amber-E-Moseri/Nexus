-- Allow pastors to be assigned members from any department
-- Pastors have representatives across departments and need to track progress
-- across department boundaries

create or replace function public.assign_pastor_member(p_pastor_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor public.users%rowtype;
  v_pastor public.users%rowtype;
  v_member public.users%rowtype;
begin
  select *
  into v_actor
  from public.users
  where id = auth.uid();

  if v_actor.role not in ('super_admin', 'dept_lead') then
    raise exception 'You do not have permission to manage pastoral assignments';
  end if;

  select * into v_pastor from public.users where id = p_pastor_id;
  select * into v_member from public.users where id = p_member_id;

  if v_pastor.role <> 'pastor' then
    raise exception 'Selected user is not a pastor';
  end if;

  if v_member.role <> 'member' then
    raise exception 'Selected user is not a member';
  end if;

  if v_actor.role = 'dept_lead' and v_actor.department_id is distinct from v_member.department_id then
    raise exception 'Department leads may manage assignments in their own department only';
  end if;

  delete from public.pastor_members
  where member_id = p_member_id;

  insert into public.pastor_members (pastor_id, member_id)
  values (p_pastor_id, p_member_id);
end;
$$;
