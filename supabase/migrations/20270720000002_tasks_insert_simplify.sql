-- Simplify tasks_insert: drop the department membership check entirely.
-- created_by = auth.uid() already pins the row to the authenticated creator.
-- Department-level access control lives in the SELECT policies — INSERT
-- does not need to duplicate it. The old check blocked legitimate cross-dept
-- task creation (meeting AI extraction, sprint tasks, etc.) and will keep
-- causing RLS errors as new cross-dept workflows are added.
-- SELECT policies are unchanged — users still can't read tasks they shouldn't see.

drop policy if exists "tasks_insert" on public.tasks;

create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (created_by = auth.uid());
