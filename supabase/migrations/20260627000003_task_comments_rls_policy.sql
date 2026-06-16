drop policy if exists "task_comments_select_related" on public.task_comments;

create policy "task_comments_select_related"
on public.task_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.tasks
    where tasks.id = task_comments.task_id
      and (
        tasks.assignee_id = auth.uid()
        or tasks.created_by = auth.uid()
        or (
          tasks.is_personal = false
          and tasks.department_id = public.current_user_department()
        )
        or public.current_user_role() = 'super_admin'
      )
  )
);
