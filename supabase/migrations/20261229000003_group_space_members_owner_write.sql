-- Allow group space owners to add/remove members from their own spaces

drop policy if exists "group_space_members_insert" on public.group_space_members;

create policy "group_space_members_insert" on public.group_space_members
  for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or
    -- Owner can add members to their own group space
    exists (
      select 1 from public.departments d
      where d.id = group_space_id
      and d.space_type = 'group'
      and d.owner_id = auth.uid()
    )
  );

drop policy if exists "group_space_members_delete" on public.group_space_members;

create policy "group_space_members_delete" on public.group_space_members
  for delete to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or
    -- Owner can remove members from their own group space
    exists (
      select 1 from public.departments d
      where d.id = group_space_id
      and d.space_type = 'group'
      and d.owner_id = auth.uid()
    )
  );
