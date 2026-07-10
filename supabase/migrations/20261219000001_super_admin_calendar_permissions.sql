-- Ensure super admins are explicit Ministry Calendar managers for DB paths
-- that still require calendar_permissions.can_manage = true.

do $$
declare
  v_granted_by uuid := '3e5ad72c-1da4-4cde-9220-97e82c920e4e';
begin
  if not exists (
    select 1
    from public.users
    where id = v_granted_by
      and role = 'super_admin'
  ) then
    raise exception 'super_admin calendar grantor % is missing or is not super_admin', v_granted_by;
  end if;

  update public.calendar_permissions cp
  set
    can_manage = true,
    granted_by = coalesce(cp.granted_by, v_granted_by),
    granted_at = coalesce(cp.granted_at, now())
  from public.users u
  where cp.user_id = u.id
    and u.role = 'super_admin'
    and cp.space_id is null;

  insert into public.calendar_permissions (user_id, can_manage, granted_by)
  select u.id, true, v_granted_by
  from public.users u
  where u.role = 'super_admin'
    and not exists (
      select 1
      from public.calendar_permissions cp
      where cp.user_id = u.id
        and cp.space_id is null
    );
end $$;
