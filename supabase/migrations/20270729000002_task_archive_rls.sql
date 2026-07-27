-- Bake "archived_at is null" into every PERMISSIVE tasks_select_* policy,
-- exactly mirroring how deleted_at is null was added to each of these same
-- policies (20270719000014_p0_soft_deleted_tasks_leak.sql and predecessors).
-- This makes RLS the single source of truth for hiding archived tasks —
-- covers every read path automatically, including src/features/spaces/lib
-- /spaces.js's getSpaceTasks(), which has no app-level deleted_at filter
-- today and relies on RLS alone.
--
-- Deliberately NOT touched:
--   - tasks_hide_deliverables_from_non_programs, tasks_pastors_privacy:
--     RESTRICTIVE policies (AND-combined, never grant access on their own)
--     — don't need the guard, they can only narrow further.
--   - tasks_update_delete_sprint_manager: PERMISSIVE + cmd ALL, so it does
--     participate in SELECT, but it also has no deleted_at guard today.
--     Left alone for exact parity with the existing (pre-archival)
--     treatment — not this migration's job to fix. Moot in practice for
--     archival anyway: sprint tasks are explicitly excluded from the
--     auto-archive sweep, so archived_at stays null for every row this
--     policy could match.
--   - tasks_update / tasks_update_* / tasks_delete*: write policies stay
--     unguarded so archiving and unarchiving (both are writes) keep
--     working, same reasoning as the deleted_at write policies.
--
-- Once this lands, a plain .select() can no longer see archived rows —
-- the Archive view must go through a SECURITY DEFINER RPC
-- (get_archived_tasks, added in 20270729000003), same as Trash.
--
-- (Verified live via a temporary introspection RPC, since Docker/`supabase
-- db dump` wasn't available locally — the RPC has already been dropped.)

alter policy "tasks_personal_owner" on public.tasks
  using (deleted_at is null and archived_at is null and is_personal = true and assignee_id = auth.uid());

alter policy "tasks_select_admin" on public.tasks
  using (
    deleted_at is null and archived_at is null
    and current_user_role() = 'super_admin'
    and (is_personal = false or created_by = auth.uid() or assignee_id = auth.uid())
  );

alter policy "tasks_select_follower" on public.tasks
  using (
    deleted_at is null and archived_at is null
    and exists (select 1 from task_follows tf where tf.task_id = tasks.id and tf.user_id = auth.uid())
    and (
      meeting_id is null
      or exists (
        select 1 from meetings m
        where m.id = tasks.meeting_id
          and (
            m.visibility = 'published'
            or m.created_by = auth.uid()
            or auth.uid() = any (coalesce(m.allowed_viewers, '{}'::uuid[]))
            or auth.uid() = any (coalesce(m.allowed_editors, '{}'::uuid[]))
            or current_user_role() = any (array['super_admin','regional_secretary'])
          )
      )
    )
  );

alter policy "tasks_select_lead" on public.tasks
  using (
    deleted_at is null and archived_at is null
    and (
      has_space_role(auth.uid(), department_id, 'dept_lead')
      or exists (
        select 1 from task_follows tf join users u on u.id = tf.user_id
        where tf.task_id = tasks.id and tf.added_via = 'mention'
          and u.department_id = current_user_department() and tasks.is_personal = false
      )
    )
    and (
      meeting_id is null
      or exists (
        select 1 from meetings m
        where m.id = tasks.meeting_id
          and (
            m.visibility = 'published'
            or m.created_by = auth.uid()
            or auth.uid() = any (coalesce(m.allowed_viewers, '{}'::uuid[]))
            or auth.uid() = any (coalesce(m.allowed_editors, '{}'::uuid[]))
            or current_user_role() = any (array['super_admin','regional_secretary'])
          )
      )
    )
  );

alter policy "tasks_select_member" on public.tasks
  using (
    deleted_at is null and archived_at is null
    and (
      assignee_id = auth.uid()
      or created_by = auth.uid()
      or (
        is_personal = false and department_id = current_user_department()
        and (
          meeting_id is null
          or exists (
            select 1 from meetings m
            where m.id = tasks.meeting_id
              and (
                m.visibility = 'published'
                or m.created_by = auth.uid()
                or auth.uid() = any (coalesce(m.allowed_viewers, '{}'::uuid[]))
                or auth.uid() = any (coalesce(m.allowed_editors, '{}'::uuid[]))
                or current_user_role() = any (array['super_admin','regional_secretary'])
              )
          )
        )
      )
    )
  );

alter policy "tasks_select_pastor" on public.tasks
  using (
    deleted_at is null and archived_at is null
    and is_personal = false
    and exists (select 1 from pastor_members pm where pm.pastor_id = auth.uid() and pm.member_id = tasks.assignee_id)
  );

alter policy "tasks_select_space_access" on public.tasks
  using (
    deleted_at is null and archived_at is null
    and not is_personal
    and (
      (department_id is not null and can_view_space(department_id))
      or (
        sprint_id is not null
        and exists (select 1 from sprints s where s.id = tasks.sprint_id and s.department_id is not null and can_view_space(s.department_id))
      )
    )
  );

alter policy "tasks_select_sprint_member" on public.tasks
  using (
    deleted_at is null and archived_at is null
    and task_type = 'sprint' and sprint_id is not null and is_sprint_member(sprint_id)
  );
