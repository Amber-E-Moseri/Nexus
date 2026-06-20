-- Allow pastors to create and manage tasks for their flock members

drop policy if exists "tasks_insert" on public.tasks;
drop policy if exists "tasks_update_delete" on public.tasks;

create policy "tasks_insert"
on public.tasks
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    is_personal = true
    or public.current_user_role() = 'super_admin'
    or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
    or public.current_user_department() = department_id
    or (public.current_user_role() = 'pastor' and
      exists (
        select 1 from public.pastor_members
        where pastor_id = auth.uid() and member_id = assignee_id
      )
    )
  )
);

create policy "tasks_update_delete"
on public.tasks
for all
to authenticated
using (
  created_by = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
  or (public.current_user_role() = 'pastor' and
    exists (
      select 1 from public.pastor_members
      where pastor_id = auth.uid() and member_id = assignee_id
    )
  )
)
with check (
  created_by = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
  or (public.current_user_role() = 'pastor' and
    exists (
      select 1 from public.pastor_members
      where pastor_id = auth.uid() and member_id = assignee_id
    )
  )
);
