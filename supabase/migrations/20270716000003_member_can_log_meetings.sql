-- Allow space members to log meetings in their own department.
-- meetings_insert previously required ors/dept_lead/designated_creator/meetings_manager.
-- Members should be able to log from their space's Meetings tab.

drop policy if exists "meetings_insert" on public.meetings;

create policy "meetings_insert" on public.meetings
  for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or public.current_user_role() = 'regional_secretary'
    or (
      created_by = auth.uid()
      and (
        -- dept leads, ors, and designated/grant holders can log anywhere
        public.has_space_role_anywhere(auth.uid(), 'ors')
        or public.has_space_role(auth.uid(), department_id, 'dept_lead')
        or exists (select 1 from public.designated_creators where user_id = auth.uid())
        or public.user_has_grant(auth.uid(), 'meetings_manager')
        -- regular members can log in their own department only
        or (
          public.current_user_role() in ('member', 'pastor')
          and department_id = public.current_user_department()
        )
      )
    )
  );
