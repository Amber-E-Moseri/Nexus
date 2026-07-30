-- Sprint creators can always approve access requests to their sprints

DROP POLICY IF EXISTS "sprint_access_requests_update" ON public.sprint_access_requests;

CREATE POLICY "sprint_access_requests_update" ON public.sprint_access_requests
  FOR UPDATE TO authenticated
  USING (
    -- Super admin, dept_lead can always approve
    public.current_user_role() IN ('super_admin', 'dept_lead')
    -- Sprint creator can always approve
    OR EXISTS (
      SELECT 1 FROM public.sprints s
      WHERE s.id = sprint_access_requests.sprint_id
        AND s.created_by = auth.uid()
    )
    -- Regional secretary can approve for Pastors sprints
    OR (
      public.current_user_role() = 'regional_secretary'
      AND EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.department_id = (SELECT id FROM public.departments WHERE name = 'Pastors')
      )
    )
    -- Programs members can approve for Pastors sprints
    OR (
      EXISTS (
        SELECT 1 FROM public.space_members sm
        WHERE sm.space_id = (SELECT id FROM public.departments WHERE name = 'Programs')
          AND sm.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.department_id = (SELECT id FROM public.departments WHERE name = 'Pastors')
      )
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'dept_lead')
    OR EXISTS (
      SELECT 1 FROM public.sprints s
      WHERE s.id = sprint_access_requests.sprint_id
        AND s.created_by = auth.uid()
    )
    OR (
      public.current_user_role() = 'regional_secretary'
      AND EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.department_id = (SELECT id FROM public.departments WHERE name = 'Pastors')
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.space_members sm
        WHERE sm.space_id = (SELECT id FROM public.departments WHERE name = 'Programs')
          AND sm.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.department_id = (SELECT id FROM public.departments WHERE name = 'Pastors')
      )
    )
  );

DROP POLICY IF EXISTS "sprint_access_requests_delete" ON public.sprint_access_requests;

CREATE POLICY "sprint_access_requests_delete" ON public.sprint_access_requests
  FOR DELETE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'dept_lead')
    OR EXISTS (
      SELECT 1 FROM public.sprints s
      WHERE s.id = sprint_access_requests.sprint_id
        AND s.created_by = auth.uid()
    )
    OR (
      public.current_user_role() = 'regional_secretary'
      AND EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.department_id = (SELECT id FROM public.departments WHERE name = 'Pastors')
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.space_members sm
        WHERE sm.space_id = (SELECT id FROM public.departments WHERE name = 'Programs')
          AND sm.user_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.department_id = (SELECT id FROM public.departments WHERE name = 'Pastors')
      )
    )
  );
