-- Allow Programs team members to create sprints (they already have full manage rights via can_manage_sprint)
DROP POLICY IF EXISTS "sprints_insert" ON public.sprints;

CREATE POLICY "sprints_insert" ON public.sprints
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.current_user_role() IN ('super_admin', 'dept_lead', 'pastor') OR public.is_programs_team())
    AND created_by = auth.uid()
  );
