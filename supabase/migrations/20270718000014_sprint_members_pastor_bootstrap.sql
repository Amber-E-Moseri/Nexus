-- Fix sprint_members_write bootstrap hole for pastor-created sprints.
-- can_manage_sprint() queries sprint_members, so a pastor's very first insert
-- (the owner row) fails: the table is empty so can_manage_sprint returns false,
-- and they're not super_admin/dept_lead. The fix: allow insert when the current
-- user is the sprint's created_by, covering the window before the owner row lands.
-- After that first insert, can_manage_sprint() takes over for all subsequent adds.

drop policy if exists "sprint_members_write" on public.sprint_members;

create policy "sprint_members_write" on public.sprint_members
  for all to authenticated
  using (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
  )
  with check (
    public.current_user_role() in ('super_admin', 'dept_lead')
    or public.can_manage_sprint(sprint_id)
    or exists (
      select 1 from public.sprints s
      where s.id = sprint_id and s.created_by = auth.uid()
    )
  );
