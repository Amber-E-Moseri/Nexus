-- Allow group-space owners to view all members of their own spaces
-- and transfer ownership safely without breaking access.

drop policy if exists "group_space_members_select" on public.group_space_members;

create policy "group_space_members_select" on public.group_space_members
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or user_id = auth.uid()
    or exists (
      select 1
      from public.departments d
      where d.id = group_space_id
        and d.space_type = 'group'
        and d.owner_id = auth.uid()
    )
  );

create or replace function public.sync_group_space_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and old.space_type = 'group'
    and new.space_type <> 'group' then
    delete from public.group_space_members
    where group_space_id = new.id;
    return new;
  end if;

  if new.space_type <> 'group' then
    return new;
  end if;

  update public.group_space_members
  set role = 'member'
  where group_space_id = new.id
    and role = 'owner'
    and user_id is distinct from new.owner_id;

  if new.owner_id is not null then
    insert into public.group_space_members (group_space_id, user_id, role, added_by)
    values (new.id, new.owner_id, 'owner', coalesce(auth.uid(), new.owner_id))
    on conflict (group_space_id, user_id) do update
      set role = 'owner';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_group_space_owner_membership on public.departments;

create trigger sync_group_space_owner_membership
after insert or update of owner_id, space_type
on public.departments
for each row
execute function public.sync_group_space_owner_membership();

create or replace function public.transfer_group_space_ownership(
  p_space_id uuid,
  p_new_owner_id uuid
)
returns public.departments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.departments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_space_id is null or p_new_owner_id is null then
    raise exception 'Space and new owner are required';
  end if;

  select *
    into v_space
  from public.departments
  where id = p_space_id;

  if not found then
    raise exception 'Group space not found';
  end if;

  if v_space.space_type <> 'group' then
    raise exception 'Only group spaces can transfer ownership';
  end if;

  if v_space.owner_id = p_new_owner_id then
    raise exception 'Selected user already owns this group space';
  end if;

  if public.current_user_role() <> 'super_admin'
     and v_space.owner_id <> auth.uid() then
    raise exception 'Only the current group owner or a super admin can transfer ownership';
  end if;

  if not exists (
    select 1
    from public.users
    where id = p_new_owner_id
  ) then
    raise exception 'Selected user does not exist';
  end if;

  update public.departments
  set owner_id = p_new_owner_id,
      updated_at = now()
  where id = p_space_id
  returning * into v_space;

  return v_space;
end;
$$;

-- Normalize existing group-space owner membership rows so the current owner
-- is the only owner in group_space_members.
update public.group_space_members gsm
set role = case
  when gsm.user_id = d.owner_id then 'owner'
  else 'member'
end
from public.departments d
where d.id = gsm.group_space_id
  and d.space_type = 'group';
