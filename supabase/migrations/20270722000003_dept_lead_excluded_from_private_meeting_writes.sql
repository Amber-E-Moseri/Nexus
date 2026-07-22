-- Close the same dept_lead AND ORS gap in meetings_update/meetings_delete
-- that 20270721000004/20270722000002 closed for meetings_select.
--
-- meetings_select now hides other people's private meetings from dept_lead,
-- ORS, and regional_secretary, but the live write policies (meetings_update
-- from 20261230000009, meetings_delete from phase-3 20261216000000) still
-- grant dept_lead and ORS unconditional access via
-- has_space_role(auth.uid(), department_id, 'dept_lead') and
-- has_space_role_anywhere(auth.uid(), 'ors') — neither checks visibility.
-- Someone who can no longer see a private meeting in any list could still
-- edit or delete it directly given the row id (e.g. a stale link or a direct
-- API call). Scoping both clauses to visibility = 'published' closes that:
-- dept_lead/ORS keep full write access to published meetings (unchanged),
-- and still manage their own private meetings via created_by/allowed_editors,
-- but lose write access to other people's private meetings. (No separate
-- regional_secretary clause exists in these write policies to begin with —
-- only meetings_select granted that role a bypass, already fixed.)

drop policy if exists "meetings_update" on public.meetings;

create policy "meetings_update" on public.meetings
  for update to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or auth.uid() = any(allowed_editors)
    or created_by = auth.uid()
    or (
      public.has_space_role_anywhere(auth.uid(), 'ors')
      and visibility = 'published'
    )
    or (
      public.has_space_role(auth.uid(), department_id, 'dept_lead')
      and visibility = 'published'
    )
    or public.user_has_grant(auth.uid(), 'meetings_manager')
  );

drop policy if exists "meetings_delete" on public.meetings;

create policy "meetings_delete" on public.meetings
  for delete to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or created_by = auth.uid()
    or (
      public.has_space_role_anywhere(auth.uid(), 'ors')
      and visibility = 'published'
    )
    or (
      public.has_space_role(auth.uid(), department_id, 'dept_lead')
      and visibility = 'published'
    )
    or public.user_has_grant(auth.uid(), 'meetings_manager')
  );
