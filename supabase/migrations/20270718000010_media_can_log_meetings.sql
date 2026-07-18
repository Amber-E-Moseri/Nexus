-- Extend meetings_insert to allow the media role to log meetings in their own department.
-- Builds on 20270716000003 (which added member/pastor); users_create_meetings was already
-- dropped by 20261216000000_phase3_rls_swap and is not present at this point.

drop policy if exists "meetings_insert" on public.meetings;

create policy "meetings_insert" on public.meetings
  for insert to authenticated
  with check (
    public.current_user_role() = 'super_admin'
    or public.current_user_role() = 'regional_secretary'
    or (
      created_by = auth.uid()
      and (
        public.has_space_role_anywhere(auth.uid(), 'ors')
        or public.has_space_role(auth.uid(), department_id, 'dept_lead')
        or exists (select 1 from public.designated_creators where user_id = auth.uid())
        or public.user_has_grant(auth.uid(), 'meetings_manager')
        or (
          public.current_user_role() in ('member', 'pastor', 'media')
          and department_id = public.current_user_department()
        )
      )
    )
  );
