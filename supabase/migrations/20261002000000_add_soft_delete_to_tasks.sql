-- ============================================================
-- SOFT DELETE FOR TASKS
-- ============================================================

-- Add deleted_at column to tasks for soft delete support
alter table public.tasks
add column deleted_at timestamptz default null;

-- Create index for deleted_at for efficient filtering
create index if not exists idx_tasks_deleted_at on public.tasks(deleted_at);

-- Update RLS policies to exclude soft-deleted tasks
drop policy if exists "tasks_select_member" on public.tasks;
create policy "tasks_select_member"
on public.tasks
for select
to authenticated
using (
  deleted_at is null
  and (
    assignee_id = auth.uid()
    or created_by = auth.uid()
    or (is_personal = false and department_id = public.current_user_department())
  )
);

drop policy if exists "tasks_select_lead" on public.tasks;
create policy "tasks_select_lead"
on public.tasks
for select
to authenticated
using (
  deleted_at is null
  and public.current_user_role() = 'dept_lead'
  and public.current_user_department() = department_id
);

drop policy if exists "tasks_select_admin" on public.tasks;
create policy "tasks_select_admin"
on public.tasks
for select
to authenticated
using (
  deleted_at is null
  and public.current_user_role() = 'super_admin'
);

drop policy if exists "tasks_select_pastor" on public.tasks;
create policy "tasks_select_pastor"
on public.tasks
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.pastor_members pm
    where pm.pastor_id = auth.uid() and pm.member_id = tasks.assignee_id
  )
);

drop policy if exists "tasks_personal_owner" on public.tasks;
create policy "tasks_personal_owner"
on public.tasks
for select
to authenticated
using (
  deleted_at is null
  and is_personal = true
  and assignee_id = auth.uid()
);

-- Allow soft delete (update deleted_at)
drop policy if exists "tasks_update_delete" on public.tasks;
create policy "tasks_update_delete"
on public.tasks
for all
to authenticated
using (
  created_by = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
)
with check (
  created_by = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (public.current_user_role() = 'dept_lead' and public.current_user_department() = department_id)
);
