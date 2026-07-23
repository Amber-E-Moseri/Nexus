-- Ensure sprint_teams policy allows dept_leads and sprint managers to add teams
-- Explicitly grants dept_leads full sprint_teams access (read/write/manage)

DROP POLICY IF EXISTS "sprint_teams_write" ON public.sprint_teams;

CREATE POLICY "sprint_teams_write" ON public.sprint_teams
  FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'super_admin'
    OR public.has_space_role_anywhere(auth.uid(), 'dept_lead')
    OR public.can_manage_sprint(sprint_id)
  )
  WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR public.has_space_role_anywhere(auth.uid(), 'dept_lead')
    OR public.can_manage_sprint(sprint_id)
  );
