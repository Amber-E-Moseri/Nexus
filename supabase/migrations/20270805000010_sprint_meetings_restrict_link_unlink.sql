-- Restrict sprint_meetings INSERT/DELETE to sprint owner, manager, or super_admin/dept_lead.
-- This ensures only sprint leadership can link/unlink meetings, not all sprint members.
-- Sprint members can still view linked meetings (SELECT remains unchanged).

drop policy if exists "sprint_meetings_insert" on public.sprint_meetings;
drop policy if exists "sprint_meetings_delete" on public.sprint_meetings;

create policy "sprint_meetings_insert" on public.sprint_meetings
  for insert to authenticated
  with check (
    public.current_user_role() = any(array['super_admin', 'dept_lead'])
    or exists (
      select 1 from public.sprint_members sm
      where sm.sprint_id = sprint_meetings.sprint_id
        and sm.user_id = auth.uid()
        and sm.role in ('owner', 'manager')
    )
  );

create policy "sprint_meetings_delete" on public.sprint_meetings
  for delete to authenticated
  using (
    public.current_user_role() = any(array['super_admin', 'dept_lead'])
    or exists (
      select 1 from public.sprint_members sm
      where sm.sprint_id = sprint_meetings.sprint_id
        and sm.user_id = auth.uid()
        and sm.role in ('owner', 'manager')
    )
  );
