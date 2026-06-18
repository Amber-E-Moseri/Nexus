-- ============================================================
-- FIX: ORG-WIDE SPRINTS RLS ACCESS
-- ============================================================
-- Org-wide sprints (department_id IS NULL) should be readable
-- by all authenticated users, not just sprint members.

drop policy if exists "sprints_select" on public.sprints;
create policy "sprints_select" on public.sprints
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or department_id is null  -- org-wide sprints visible to all
    or public.is_sprint_member(id)
    or created_by = auth.uid()
  );
