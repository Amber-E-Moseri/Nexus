-- Fix sprint_members_insert to allow dept_leads and sprint managers to add members
-- Previously only super_admin and sprint creator (bootstrap) could insert

DROP POLICY IF EXISTS "sprint_members_insert" ON public.sprint_members;

CREATE POLICY "sprint_members_insert" ON public.sprint_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR public.has_space_role_anywhere(auth.uid(), 'dept_lead')
    OR public.can_manage_sprint(sprint_id)
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_id AND s.created_by = auth.uid()
      )
    )
  );
