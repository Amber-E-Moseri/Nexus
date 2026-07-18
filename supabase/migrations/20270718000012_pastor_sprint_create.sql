-- Allow pastors to create their own sprints (previously restricted to super_admin and dept_lead).
-- Post-creation ownership is already handled: createSprint() auto-inserts the creator as 'owner'
-- sprint_member, and can_manage_sprint() grants full management to created_by.
drop policy if exists "sprints_insert" on public.sprints;

create policy "sprints_insert" on public.sprints
  for insert to authenticated
  with check (
    public.current_user_role() in ('super_admin', 'dept_lead', 'pastor')
    and created_by = auth.uid()
  );
