-- Fix: scope a dept_lead's meeting VIEW access to their own department.
--
-- The live select policy "meetings_select_access" (20260620000018) grants view
-- access to ANY user with base role 'dept_lead' with no department scoping —
-- so a lead of one department can see every department's meetings. The write
-- policy "meetings_write_access" already scopes dept_lead to their own
-- department (department_id = current_user_department()); only the select side
-- was left org-wide. This aligns the two.
--
-- Standalone / does not depend on the unapplied phase-3 RLS swap. Phase-3's
-- "meetings_select" already scopes dept_lead via has_space_role(..., department_id,
-- 'dept_lead'); this brings the live pre-phase-3 policy to the same behavior
-- using the live primitives (current_user_role / current_user_department).
--
-- Note: this NARROWS dept_lead view access. Everyone else's access is unchanged
-- (super_admin, ORS-department members, meetings_manager grant holders, and the
-- meeting creator all keep view access; the separate "users_view_meetings"
-- policy still exposes published meetings and explicitly-invited viewers).

drop policy if exists "meetings_select_access" on public.meetings;

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
  -- dept_lead now scoped to meetings in their OWN department only
  or (
    public.current_user_role() = 'dept_lead'
    and department_id = public.current_user_department()
  )
  or public.user_has_grant(auth.uid(), 'meetings_manager')
  or created_by = auth.uid()
);
