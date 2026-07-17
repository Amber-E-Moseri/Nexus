-- Let a follower open the task they were mentioned/added to. Verified this applies to
-- personal tasks too, not assumed: grepped every migration touching public.tasks
-- policies (20260608000000_initial_blw_canada_os_schema.sql, 20261216000000_
-- phase3_rls_swap.sql, 20261222000000_personal_list.sql) for `as restrictive` — zero
-- matches, so every existing tasks SELECT policy (including tasks_personal_owner) is
-- the Postgres default PERMISSIVE, meaning policies OR together. This policy is
-- additive and correctly extends to personal tasks without touching
-- tasks_personal_owner itself.
create policy "tasks_select_follower" on public.tasks
  for select to authenticated
  using (
    exists (
      select 1 from public.task_follows tf
      where tf.task_id = tasks.id and tf.user_id = auth.uid()
    )
  );

-- dept_lead team monitoring — scoped to genuine cross-team asks only, not every
-- personal watch. Only added_via = 'mention' rows from members of the dept_lead's own
-- department count, and personal tasks are explicitly excluded (same as pastors). A
-- team member watching something out of personal interest (added_via = 'manual', never
-- upgraded because mention_user_on_task's upsert only upgrades, never downgrades) does
-- not surface to their dept_lead — only "someone else looped my team member in" does.
drop policy if exists "tasks_select_lead" on public.tasks;
create policy "tasks_select_lead" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and (
      public.has_space_role(auth.uid(), department_id, 'dept_lead')
      or exists (
        select 1 from public.task_follows tf
        join public.users u on u.id = tf.user_id
        where tf.task_id = tasks.id
          and tf.added_via = 'mention'
          and u.department_id = public.current_user_department()
          and tasks.is_personal = false
      )
    )
  );

-- Cross-department pastoral-assignment coordination is not solved by RLS — see the
-- UI-level visibility fix in 20260718000005 instead; this migration only concerns
-- task-follow monitoring.
