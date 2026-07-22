-- Permissions audit fixes — 2026-07-20
-- Addresses findings: C1, H1, H2, M1, M2, L1, L2, L3
-- H3 (sprints_update stale role) — confirmed NO-OP: sprints_update already uses
--   can_manage_sprint() which correctly checks role in ('owner', 'manager')
--   since 20260621000000_spaces_rls_security.sql.

-- ── C1: approve_sprint_access_request inserts with role='member' ──────────────
-- 'member' violates the sprint_members role CHECK constraint ('owner','manager',
-- 'contributor','viewer'). Every approval call fails at runtime. Fix: use 'contributor'.

create or replace function public.approve_sprint_access_request(p_request_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_sprint_id uuid;
  v_user_id uuid;
begin
  select sprint_id, user_id into v_sprint_id, v_user_id
  from public.sprint_access_requests
  where id = p_request_id;

  if v_sprint_id is null then
    raise exception 'Access request not found';
  end if;

  -- Check permission: super_admin, sprint creator, or sprint member
  if auth.uid() <> (select created_by from public.sprints where id = v_sprint_id)
     and public.current_user_role() <> 'super_admin'
     and not exists (
       select 1 from public.sprint_members
       where sprint_id = v_sprint_id and user_id = auth.uid()
     )
  then
    raise exception 'You do not have permission to approve this request';
  end if;

  -- Add to sprint_members with valid role 'contributor' (was 'member' — broken)
  insert into public.sprint_members (sprint_id, user_id, role, added_by)
  values (v_sprint_id, v_user_id, 'contributor', auth.uid())
  on conflict (sprint_id, user_id) do nothing;

  update public.sprint_access_requests
  set status = 'approved', responded_at = now(), responded_by = auth.uid()
  where id = p_request_id;
end;
$$;

-- ── H1: tasks_select_follower bypasses private-meeting gate ───────────────────
-- The follower policy (last set in 20270719000014) has no meeting-privacy guard.
-- A watcher on a private-meeting task can see it even if not in allowed_viewers.
-- Fix: add the same meeting-privacy clause as tasks_select_member.

drop policy if exists "tasks_select_follower" on public.tasks;
create policy "tasks_select_follower" on public.tasks
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.task_follows tf
      where tf.task_id = tasks.id and tf.user_id = auth.uid()
    )
    and (
      meeting_id is null
      or exists (
        select 1 from public.meetings m
        where m.id = tasks.meeting_id
          and (
            m.visibility = 'published'
            or m.created_by = auth.uid()
            or auth.uid() = any(coalesce(m.allowed_viewers, '{}'))
            or auth.uid() = any(coalesce(m.allowed_editors, '{}'))
            or public.current_user_role() in ('super_admin', 'regional_secretary')
          )
      )
    )
  );

-- ── H2: tasks_select_lead bypasses private-meeting gate ───────────────────────
-- The dept_lead monitoring policy (20270101000004) lacks the meeting-privacy check.
-- A dept_lead can see private-meeting tasks from their department's members.
-- Fix: add the same meeting-privacy clause.

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
    and (
      meeting_id is null
      or exists (
        select 1 from public.meetings m
        where m.id = tasks.meeting_id
          and (
            m.visibility = 'published'
            or m.created_by = auth.uid()
            or auth.uid() = any(coalesce(m.allowed_viewers, '{}'))
            or auth.uid() = any(coalesce(m.allowed_editors, '{}'))
            or public.current_user_role() in ('super_admin', 'regional_secretary')
          )
      )
    )
  );

-- ── M1: task_follows_insert raw subquery on tasks — recursion risk ─────────────
-- The INSERT policy still does EXISTS (SELECT FROM tasks) through tasks RLS,
-- which can re-enter task_follows. Mirror the SECURITY DEFINER pattern used in
-- 20270720000001 for SELECT. Add a task_created_by() helper for the created_by check.

create or replace function public.task_created_by(p_task_id uuid)
  returns uuid
  language sql
  security definer
  stable
  set search_path = public
as $$
  select created_by from public.tasks where id = p_task_id limit 1;
$$;

drop policy if exists "task_follows_insert" on public.task_follows;
create policy "task_follows_insert" on public.task_follows
  for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.task_created_by(task_id) = auth.uid()
    or public.has_space_role(auth.uid(), public.task_department_id(task_id), 'dept_lead')
  );

-- ── M2: tasks_insert_sprint_member is dead code ────────────────────────────────
-- Since 20270720000002 simplified tasks_insert to only check created_by = auth.uid(),
-- this policy's conditions are a strict subset. Drop it to remove the extra evaluation.

drop policy if exists "tasks_insert_sprint_member" on public.tasks;

-- ── L1: checklist UPDATE policies missing WITH CHECK ──────────────────────────
-- UPDATE policies without WITH CHECK allow a user to change task_id to a task
-- they don't own. Rebuild both UPDATE policies with WITH CHECK matching USING.

-- ── L2: checklist policies missing deleted_at IS NULL on task lookup ───────────
-- Checklists on soft-deleted tasks are writable. Add the guard to all six policies.

-- Combined fix for L1 + L2 on task_checklists:

DROP POLICY IF EXISTS "checklists_insert" ON task_checklists;
CREATE POLICY "checklists_insert" ON task_checklists
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND t.deleted_at IS NULL
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "checklists_update" ON task_checklists;
CREATE POLICY "checklists_update" ON task_checklists
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND t.deleted_at IS NULL
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND t.deleted_at IS NULL
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "checklists_delete" ON task_checklists;
CREATE POLICY "checklists_delete" ON task_checklists
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_checklists.task_id
        AND t.deleted_at IS NULL
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

-- Combined fix for L1 + L2 on task_checklist_items:

DROP POLICY IF EXISTS "checklist_items_insert" ON task_checklist_items;
CREATE POLICY "checklist_items_insert" ON task_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM task_checklists tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.id = task_checklist_items.checklist_id
        AND t.deleted_at IS NULL
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "checklist_items_update" ON task_checklist_items;
CREATE POLICY "checklist_items_update" ON task_checklist_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_checklists tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.id = task_checklist_items.checklist_id
        AND t.deleted_at IS NULL
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM task_checklists tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.id = task_checklist_items.checklist_id
        AND t.deleted_at IS NULL
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "checklist_items_delete" ON task_checklist_items;
CREATE POLICY "checklist_items_delete" ON task_checklist_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_checklists tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE tc.id = task_checklist_items.checklist_id
        AND t.deleted_at IS NULL
        AND (
          t.created_by = auth.uid()
          OR t.assignee_id = auth.uid()
          OR public.current_user_role() IN ('super_admin', 'regional_secretary')
          OR public.has_space_role(auth.uid(), t.department_id, 'dept_lead')
          OR EXISTS (
            SELECT 1 FROM task_assignees ta
            WHERE ta.task_id = t.id AND ta.user_id = auth.uid()
          )
        )
    )
  );

-- ── L3: tasks_delete uses current_user_department() vs tasks_update has_space_role ──
-- A dept_lead with cross-dept space membership can update but not delete.
-- Unify tasks_delete to use has_space_role() matching tasks_update.

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
    or public.has_space_role(auth.uid(), department_id, 'dept_lead')
  );
