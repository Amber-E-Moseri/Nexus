-- =============================================================================
-- Fix: task_comments/task_checklists/task_checklist_items timing out (57014)
-- -----------------------------------------------------------------------------
-- 20270724000108 fixed genuine infinite recursion between tasks_pastors_
-- privacy and task_assignees_pastors_privacy by moving the task_assignees
-- membership check into a SECURITY DEFINER helper (is_task_assignee), which
-- bypasses task_assignees' own RLS and breaks the cycle.
--
-- These three sibling policies (added in the same original Pastors-privacy
-- migration, 20270724000103) were never updated to match — they still run
-- the raw `EXISTS (SELECT 1 FROM task_assignees ta WHERE ...)` subquery.
-- That doesn't recurse infinitely (Postgres would reject that outright with
-- 42P17, same as before), but it's still a real performance problem: that
-- raw subquery triggers task_assignees' own RLS, which re-queries tasks,
-- which re-evaluates tasks' RLS (now cheap, thanks to is_task_assignee) —
-- but this chain runs once per row scanned in task_comments/task_checklists/
-- task_checklist_items, on every single select. For any task with even a
-- moderate comment/checklist count this compounds into genuinely exceeding
-- Postgres's statement_timeout (confirmed live: "canceling statement due to
-- statement timeout" on all three tables), not just being slow — hence
-- TaskModal's comments/checklists/subtasks all failing to load and reads on
-- personal-list/task board pages stalling ("saving is taking too long").
--
-- Fix: same as before — replace the raw task_assignees subquery with
-- is_task_assignee(), which bypasses task_assignees' RLS internally and
-- collapses the nested re-evaluation chain.
-- =============================================================================

drop policy if exists "task_comments_pastors_privacy" on public.task_comments;

create policy "task_comments_pastors_privacy" on public.task_comments
  as restrictive
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and (
          not public.is_pastors_space(t.department_id)
          or t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or public.current_user_role() = 'regional_secretary'
          or public.is_task_assignee(t.id, auth.uid())
        )
    )
  );

drop policy if exists "checklists_pastors_privacy" on public.task_checklists;

create policy "checklists_pastors_privacy" on public.task_checklists
  as restrictive
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_checklists.task_id
        and (
          not public.is_pastors_space(t.department_id)
          or t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or public.current_user_role() = 'regional_secretary'
          or public.is_task_assignee(t.id, auth.uid())
        )
    )
  );

drop policy if exists "checklist_items_pastors_privacy" on public.task_checklist_items;

create policy "checklist_items_pastors_privacy" on public.task_checklist_items
  as restrictive
  for select to authenticated
  using (
    exists (
      select 1 from public.task_checklists tc
      join public.tasks t on t.id = tc.task_id
      where tc.id = task_checklist_items.checklist_id
        and (
          not public.is_pastors_space(t.department_id)
          or t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or public.current_user_role() = 'regional_secretary'
          or public.is_task_assignee(t.id, auth.uid())
        )
    )
  );
