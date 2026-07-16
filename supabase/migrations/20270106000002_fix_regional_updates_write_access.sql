-- Fix regional_updates writes for the live permission model.
--
-- Problem 1:
--   The client insert path omits created_by, but the table required it and the
--   RLS policies checked it. Without a DB default, inserts fail unless the
--   client provides a trusted created_by value.
--
-- Problem 2:
--   The sidebar and route guards allow users with the
--   regional_secretary_access grant to manage regional updates, but the table
--   RLS only checked users.role = 'regional_secretary' (and later super_admin).
--
-- Fix:
--   - default created_by to auth.uid()
--   - align insert/update/delete policies with current_user_role() plus the
--     user_grants helper already used elsewhere in the app

alter table public.regional_updates
  alter column created_by set default auth.uid();

drop policy if exists "rs_can_create_regional_updates" on public.regional_updates;
drop policy if exists "rs_and_admin_can_create_regional_updates" on public.regional_updates;
drop policy if exists "rs_can_update_own_regional_updates" on public.regional_updates;
drop policy if exists "rs_and_admin_can_update_regional_updates" on public.regional_updates;
drop policy if exists "rs_can_delete_own_regional_updates" on public.regional_updates;
drop policy if exists "rs_and_admin_can_delete_regional_updates" on public.regional_updates;

create policy "regional_updates_insert"
  on public.regional_updates
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.user_has_grant(auth.uid(), 'regional_secretary_access')
    )
  );

create policy "regional_updates_update"
  on public.regional_updates
  for update
  to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (
      created_by = auth.uid()
      and (
        public.current_user_role() = 'regional_secretary'
        or public.user_has_grant(auth.uid(), 'regional_secretary_access')
      )
    )
  )
  with check (
    public.current_user_role() = 'super_admin'
    or (
      created_by = auth.uid()
      and (
        public.current_user_role() = 'regional_secretary'
        or public.user_has_grant(auth.uid(), 'regional_secretary_access')
      )
    )
  );

create policy "regional_updates_delete"
  on public.regional_updates
  for delete
  to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (
      created_by = auth.uid()
      and (
        public.current_user_role() = 'regional_secretary'
        or public.user_has_grant(auth.uid(), 'regional_secretary_access')
      )
    )
  );
