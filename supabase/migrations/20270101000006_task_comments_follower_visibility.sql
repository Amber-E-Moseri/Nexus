-- Add a follower clause to task_comments SELECT so someone granted task visibility via
-- task_follows (20260718000003) can also read the thread that likely contains the
-- mention that looped them in. Verified gap: the active task_comments_select_related
-- policy (20260627000003_task_comments_rls_policy.sql) checks assignee/creator/
-- department/super_admin only.
drop policy if exists "task_comments_select_related" on public.task_comments;
create policy "task_comments_select_related" on public.task_comments
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and (
          t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or (t.is_personal = false and t.department_id = public.current_user_department())
          or public.current_user_role() = 'super_admin'
          or exists (
            select 1 from public.task_follows tf
            where tf.task_id = t.id and tf.user_id = auth.uid()
          )
        )
    )
  );

-- Separately flagged, out of scope: task_comments_write_related
-- (20260608000000_initial_blw_canada_os_schema.sql:294-299, still active,
-- `for all using/with check (author_id = auth.uid())`) has no task-visibility gate on
-- INSERT — anyone authenticated can comment on any task_id today, visible or not. Not
-- caused by this change; worth a separate ticket.
