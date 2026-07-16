-- Grant regional_secretary cross-department task visibility.
-- tasks_select_admin was super_admin only; reg-sec can see all spaces
-- (departments RLS fixed in 20270716000000) but couldn't read tasks in them.

drop policy if exists "tasks_select_admin" on public.tasks;

create policy "tasks_select_admin"
  on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and public.current_user_role() in ('super_admin', 'regional_secretary')
    and (is_personal = false or created_by = auth.uid() or assignee_id = auth.uid())
  );
