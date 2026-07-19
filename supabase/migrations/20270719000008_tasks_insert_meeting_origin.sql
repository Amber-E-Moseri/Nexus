-- Allow meeting-originated tasks to be created in any department.
-- The current tasks_insert policy requires created_by = auth.uid() AND the
-- creator to be a member of tasks.department_id. AI extraction from a meeting
-- legitimately routes action items to other departments (e.g. a Programs task
-- created by a Media user), causing an RLS violation for non-super_admin users.
--
-- The escape: if meeting_id IS NOT NULL the destination department check is
-- waived. created_by = auth.uid() still holds (the creator owns the row), and
-- the meeting itself already scopes who can perform the extraction (only people
-- who can see the meeting can access the extraction UI).

drop policy if exists "tasks_insert" on public.tasks;

create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      is_personal = true
      or meeting_id is not null
      or public.current_user_role() in ('super_admin', 'regional_secretary')
      or public.has_space_role(auth.uid(), department_id, 'dept_lead')
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.department_id = tasks.department_id
      )
      or exists (
        select 1 from public.space_members sm
        where sm.user_id = auth.uid() and sm.space_id = tasks.department_id
      )
    )
  );
