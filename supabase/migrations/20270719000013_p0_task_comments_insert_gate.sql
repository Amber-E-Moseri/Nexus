-- P0: task_comments_write_related was FOR ALL WITH CHECK (author_id = auth.uid()),
-- meaning any authenticated user could INSERT a comment on any task_id regardless
-- of whether they can see that task. Split into separate policies; INSERT now gates
-- on user_can_view_task() (defined in 20270101000001_user_can_view_task.sql).

drop policy if exists "task_comments_write_related" on public.task_comments;

create policy "task_comments_insert" on public.task_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.user_can_view_task(task_id, auth.uid())
  );

create policy "task_comments_update" on public.task_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "task_comments_delete" on public.task_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or public.current_user_role() = 'super_admin'
  );
