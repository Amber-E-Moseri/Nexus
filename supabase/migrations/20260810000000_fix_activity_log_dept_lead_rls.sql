-- FIX: Allow dept_lead to view activity log for their department users
-- The activity_log RLS policy was too restrictive and prevented dept_lead
-- from viewing activity logs of their department members.

drop policy "activity_log_select_scope" on public.activity_log;

create policy "activity_log_select_scope"
on public.activity_log
for select
to authenticated
using (
  -- Users can see their own activity
  user_id = auth.uid()
  -- Super admins can see all activity
  or public.current_user_role() = 'super_admin'
  -- Dept leads can see activity from users in their department
  or (
    public.current_user_role() = 'dept_lead'
    and exists (
      select 1 from public.users u
      where u.id = activity_log.user_id
      and u.department_id = public.current_user_department()
    )
  )
);
