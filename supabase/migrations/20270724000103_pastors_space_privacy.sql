-- =============================================================================
-- Pastors-space privacy
-- -----------------------------------------------------------------------------
-- The Pastors space exists purely so the Regional Secretary can administer
-- things in one place — it was never meant to let pastors see each other's
-- tasks, comments, checklists, or meeting open items. Today, every relevant
-- SELECT policy grants full department-wide visibility whenever
-- department_id/space_id matches the viewer's own department, with no
-- per-space override, so any pastor can already see every other pastor's
-- data in this space.
--
-- Confirmed tasks_insert (20270720000002_tasks_insert_simplify.sql) has no
-- assignee constraint at all — nothing today stops one pastor assigning a
-- task to another. Only regional_secretary bypasses these restrictions
-- (deliberately narrower than the usual super_admin+regional_secretary
-- pairing elsewhere — mirrors the one existing precedent for excluding
-- super_admin too: 20270722000006's regional-secretary-private-meetings
-- carveout). A Pastors dept_lead is restricted to their own items same as
-- any ordinary pastor.
--
-- Approach: RESTRICTIVE policies, ANDed against every existing permissive
-- policy on each table at once, without editing the permissive policies
-- individually. Not a novel technique here — 20270101000010_tasks_deliverables_rls.sql
-- already uses this exact shape (restrictive `for all` + a separate
-- restrictive `for insert`) to gate event-deliverable tasks.
--
-- Acknowledged, not addressed here: this only blocks FUTURE cross-pastor
-- task assignment. Any task already assigned Pastor-A -> Pastor-B before
-- this migration keeps working via assignee_id = auth.uid() — a legitimate
-- access path this migration doesn't touch, by design.
-- =============================================================================

create or replace function public.is_pastors_space(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.departments
    where id = p_department_id and space_type = 'department' and name = 'Pastors'
  );
$$;

-- ── tasks ────────────────────────────────────────────────────────────────

create policy "tasks_pastors_privacy" on public.tasks
  as restrictive for select to authenticated
  using (
    not public.is_pastors_space(department_id)
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or public.current_user_role() = 'regional_secretary'
    or exists (select 1 from public.task_assignees ta where ta.task_id = tasks.id and ta.user_id = auth.uid())
  );

create policy "tasks_pastors_privacy_update" on public.tasks
  as restrictive for update to authenticated
  using (
    not public.is_pastors_space(department_id)
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or public.current_user_role() = 'regional_secretary'
    or exists (select 1 from public.task_assignees ta where ta.task_id = tasks.id and ta.user_id = auth.uid())
  );

create policy "tasks_pastors_privacy_delete" on public.tasks
  as restrictive for delete to authenticated
  using (
    not public.is_pastors_space(department_id)
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or public.current_user_role() = 'regional_secretary'
  );

-- Stops one pastor assigning a task to another within the Pastors space —
-- the actual gap tasks_insert/tasks_update never checked. assignee_id must
-- be null, self, or set by regional_secretary.
create policy "tasks_pastors_privacy_insert_check" on public.tasks
  as restrictive for insert to authenticated
  with check (
    not public.is_pastors_space(department_id)
    or assignee_id is null
    or assignee_id = auth.uid()
    or public.current_user_role() = 'regional_secretary'
  );

create policy "tasks_pastors_privacy_update_check" on public.tasks
  as restrictive for update to authenticated
  with check (
    not public.is_pastors_space(department_id)
    or assignee_id is null
    or assignee_id = auth.uid()
    or public.current_user_role() = 'regional_secretary'
  );

-- ── task_assignees ──────────────────────────────────────────────────────

create policy "task_assignees_pastors_privacy" on public.task_assignees
  as restrictive for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id
        and (
          not public.is_pastors_space(t.department_id)
          or t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or public.current_user_role() = 'regional_secretary'
          or task_assignees.user_id = auth.uid()
        )
    )
  );

create policy "task_assignees_pastors_privacy_write" on public.task_assignees
  as restrictive for all to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_assignees.task_id
        and (
          not public.is_pastors_space(t.department_id)
          or t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or public.current_user_role() = 'regional_secretary'
        )
    )
  );

-- ── task_comments ────────────────────────────────────────────────────────

create policy "task_comments_pastors_privacy" on public.task_comments
  as restrictive for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and (
          not public.is_pastors_space(t.department_id)
          or t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or public.current_user_role() = 'regional_secretary'
          or exists (select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = auth.uid())
        )
    )
  );

-- ── task_checklists / task_checklist_items ─────────────────────────────
-- These carry their own baked-in department check and do not automatically
-- inherit a fix applied only to `tasks`.

create policy "checklists_pastors_privacy" on public.task_checklists
  as restrictive for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_checklists.task_id
        and (
          not public.is_pastors_space(t.department_id)
          or t.assignee_id = auth.uid()
          or t.created_by = auth.uid()
          or public.current_user_role() = 'regional_secretary'
          or exists (select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = auth.uid())
        )
    )
  );

create policy "checklist_items_pastors_privacy" on public.task_checklist_items
  as restrictive for select to authenticated
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
          or exists (select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = auth.uid())
        )
    )
  );

-- ── meeting_open_items ───────────────────────────────────────────────────
-- The parent-meeting subquery is a plain (non-SECURITY DEFINER) reference,
-- so it's itself subject to the viewer's own meetings_select RLS — an open
-- item stays visible to whichever pastor is allowed_viewers/created_by on
-- that specific 1-on-1 meeting, reusing the meeting's own privacy rather
-- than a parallel ACL.

create policy "open_items_pastors_privacy" on public.meeting_open_items
  as restrictive for select to authenticated
  using (
    not public.is_pastors_space(space_id)
    or user_id = auth.uid()
    or public.current_user_role() = 'regional_secretary'
    or exists (select 1 from public.meetings m where m.id = meeting_open_items.meeting_id)
  );

create policy "open_items_pastors_privacy_update" on public.meeting_open_items
  as restrictive for update to authenticated
  using (
    not public.is_pastors_space(space_id)
    or user_id = auth.uid()
    or public.current_user_role() = 'regional_secretary'
  );

create policy "open_items_pastors_privacy_delete" on public.meeting_open_items
  as restrictive for delete to authenticated
  using (
    not public.is_pastors_space(space_id)
    or user_id = auth.uid()
    or public.current_user_role() = 'regional_secretary'
  );
