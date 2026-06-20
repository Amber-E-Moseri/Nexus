-- Grant ORS and department leads view+edit access to all meetings
-- ORS members can view and edit all meetings across departments
-- Department leads can view and edit meetings in their own department
-- Others can view meetings in their own department only

drop policy if exists "meetings_write_leads" on public.meetings;
drop policy if exists "meetings_select_hierarchy" on public.meetings;

-- View policy: super_admin, ORS members, dept_leads, or meeting creator
create policy "meetings_select_access"
on public.meetings
for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    select d.name = 'ORS Projects' or d.name = 'ORS'
    from public.departments d
    where d.id = public.current_user_department()
  )
  or public.current_user_role() = 'dept_lead'
  or created_by = auth.uid()
);

-- Edit policy: super_admin, ORS members, dept_leads in same dept, or meeting creator
create policy "meetings_write_access"
on public.meetings
for all
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    select d.name = 'ORS Projects' or d.name = 'ORS'
    from public.departments d
    where d.id = public.current_user_department()
  )
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
  or created_by = auth.uid()
)
with check (
  public.current_user_role() = 'super_admin'
  or (
    select d.name = 'ORS Projects' or d.name = 'ORS'
    from public.departments d
    where d.id = public.current_user_department()
  )
  or (public.current_user_role() = 'dept_lead' and department_id = public.current_user_department())
  or created_by = auth.uid()
);
