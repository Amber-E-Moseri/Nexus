-- Ensure super admins are explicit Ministry Calendar managers
-- Grant calendar management permission to all super admins

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
    raise notice 'super_admin calendar grantor % not found — skipping (fresh install)', v_granted_by;
    return;
  end if;

  -- Grant calendar permissions to all super admins who don't have it
  insert into public.calendar_permissions (user_id, permission, granted_at, created_by)
  select u.id, 'can_manage', now(), v_granted_by
  from public.users u
  where u.role = 'super_admin'
    and not exists (
      select 1
      from public.calendar_permissions cp
      where cp.user_id = u.id
        and cp.permission = 'can_manage'
    );
end $$;
