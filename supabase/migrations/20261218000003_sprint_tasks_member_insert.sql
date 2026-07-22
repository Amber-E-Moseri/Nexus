-- Relax sprint-task insertion so ANY sprint member (not only managers/leads) can
-- create a task linked to a sprint they belong to.
--
-- Why: the meeting-extraction "Add to board" flow and the TaskModal sprint picker
-- both let a regular member link an action item / task to a sprint. The original
-- policy `tasks_insert_sprint_manager` (20260614000000_sprints.sql) restricts
-- INSERT of task_type='sprint' rows to sprint managers/leads, so a plain member's
-- insert is rejected by RLS. Product decision (2026-07-09): allow any member.
--
-- This is ADDITIVE — Postgres OR's permissive INSERT policies, so the existing
-- manager policy stays valid and this simply widens who may insert. Super admins
-- are included to mirror the existing update/delete policy.
--
-- Rollback: `drop policy "tasks_insert_sprint_member" on public.tasks;`
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_insert_sprint_member'
  ) then
    create policy "tasks_insert_sprint_member" on public.tasks
      for insert to authenticated
      with check (
        created_by = auth.uid()
        and task_type = 'sprint'
        and sprint_id is not null
        and (
          public.current_user_role() = 'super_admin'
          or exists (
            select 1
            from public.sprint_members sm
            where sm.sprint_id = tasks.sprint_id
              and sm.user_id = auth.uid()
          )
        )
      );
  end if;
end $$;
