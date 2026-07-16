-- Clean slate for regional_updates RLS.
-- Prior migrations left policy names in flux:
--   rs_can_create_regional_updates (original)
--   rs_and_admin_can_create_regional_updates (20261212)
--   regional_updates_insert (20270106000002, 20270715000006)
-- DROP all variants, then create one authoritative set.

drop policy if exists "rs_can_create_regional_updates"        on public.regional_updates;
drop policy if exists "rs_and_admin_can_create_regional_updates" on public.regional_updates;
drop policy if exists "regional_updates_insert"               on public.regional_updates;

drop policy if exists "rs_can_update_own_regional_updates"    on public.regional_updates;
drop policy if exists "rs_and_admin_can_update_regional_updates" on public.regional_updates;
drop policy if exists "regional_updates_update"               on public.regional_updates;

drop policy if exists "rs_can_delete_own_regional_updates"    on public.regional_updates;
drop policy if exists "rs_and_admin_can_delete_regional_updates" on public.regional_updates;
drop policy if exists "regional_updates_delete"               on public.regional_updates;

drop policy if exists "regional_updates_select"               on public.regional_updates;
drop policy if exists "rs_can_read_regional_updates"          on public.regional_updates;
drop policy if exists "everyone_can_read_regional_updates"    on public.regional_updates;

-- SELECT: all authenticated users can read updates
create policy "regional_updates_select"
  on public.regional_updates
  for select to authenticated
  using (true);

-- INSERT: super_admin, regional_secretary, or grant holders
-- No created_by check — the column DEFAULT auth.uid() handles it
create policy "regional_updates_insert"
  on public.regional_updates
  for insert to authenticated
  with check (
    public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.user_has_grant(auth.uid(), 'regional_secretary_access')
  );

-- UPDATE: own rows for rs/grant holders; any row for super_admin
create policy "regional_updates_update"
  on public.regional_updates
  for update to authenticated
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

-- DELETE: same as update
create policy "regional_updates_delete"
  on public.regional_updates
  for delete to authenticated
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
