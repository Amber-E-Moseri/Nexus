-- Fix sprint_members_write policy to recognize space-role dept_leads
-- The policy was only checking base role='dept_lead', missing space-scoped dept_leads

DROP POLICY IF EXISTS "sprint_members_write" ON public.sprint_members;

CREATE POLICY "sprint_members_write" ON public.sprint_members
  FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'dept_lead')
    OR public.has_space_role_anywhere(auth.uid(), 'dept_lead')
    OR public.can_manage_sprint(sprint_id)
  )
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'dept_lead')
    OR public.has_space_role_anywhere(auth.uid(), 'dept_lead')
    OR public.can_manage_sprint(sprint_id)
    OR EXISTS (
      SELECT 1 FROM public.sprints s
      WHERE s.id = sprint_id AND s.created_by = auth.uid()
    )
  );
