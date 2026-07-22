-- Fix: task_follows_select → tasks → task_follows_select infinite recursion.
--
-- The previous migration (20270720000000) added an EXISTS (SELECT FROM tasks)
-- check to task_follows_select. But task_select_follower also queries task_follows,
-- creating a cycle. Replace the tasks lookup with a SECURITY DEFINER helper that
-- reads tasks without triggering RLS, breaking the cycle.

create or replace function public.task_department_id(p_task_id uuid)
  returns uuid
  language sql
  security definer
  stable
  set search_path = public
as $$
  select department_id from public.tasks where id = p_task_id limit 1;
$$;

-- Re-create task_follows_select using the helper instead of a bare subquery on tasks.
drop policy if exists "task_follows_select" on public.task_follows;

create policy "task_follows_select" on public.task_follows
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.task_department_id(task_id) = public.current_user_department()
  );

-- Re-create task_follows_insert using the helper too (was also querying tasks).
drop policy if exists "task_follows_insert" on public.task_follows;

create policy "task_follows_insert" on public.task_follows
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (
          t.created_by = auth.uid()
          or public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
        )
    )
  );

-- task_follows_delete: the created_by/dept_lead check also queries tasks,
-- but DELETE doesn't feed back into task_follows_select, so no cycle there.
-- Leave as-is.
