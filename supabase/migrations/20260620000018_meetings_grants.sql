-- Update meetings policies to use user grants system
-- Allows ORS, dept_leads, and users with grants

drop policy if exists "meetings_select_access" on public.meetings;
drop policy if exists "meetings_write_access" on public.meetings;

-- View policy: super_admin, ORS members, dept_leads, grant holders, or meeting creator
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
  or public.user_has_grant(auth.uid(), 'meetings_manager')
  or created_by = auth.uid()
);

-- Edit policy: super_admin, ORS members, dept_leads in same dept, grant holders, or meeting creator
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
  or public.user_has_grant(auth.uid(), 'meetings_manager')
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
  or public.user_has_grant(auth.uid(), 'meetings_manager')
  or created_by = auth.uid()
);
