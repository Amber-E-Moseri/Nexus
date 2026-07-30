-- Allow regular members to see meetings in their own department.
-- Previously only super_admin, ORS, dept_lead, grant holders, or the creator
-- could SELECT meetings — so the "meetings this week" dashboard stat always
-- showed 0 for regular members.

drop policy if exists "meetings_select_access" on public.meetings;

create policy "meetings_select_access"
on public.meetings
for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or public.current_user_role() = 'regional_secretary'
  or (
    select d.name = 'ORS Projects' or d.name = 'ORS'
    from public.departments d
    where d.id = public.current_user_department()
  )
  or public.current_user_role() = 'dept_lead'
  or public.user_has_grant(auth.uid(), 'meetings_manager')
  or created_by = auth.uid()
  -- Members see meetings in their own department
  or (department_id is not null and department_id = public.current_user_department())
);
