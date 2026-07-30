-- Add added_by column to sprint_members for audit trail
ALTER TABLE public.sprint_members ADD COLUMN IF NOT EXISTS added_by uuid references public.users(id) on delete set null;

-- Update sprint_access_requests UPDATE/DELETE policy to allow regional_secretary, programs members, and group owners to approve
-- Regional secretaries can approve requests for regional (Pastors) sprints
-- Programs members can approve requests for regional sprints
-- Group owners can approve requests for group sprints

DROP POLICY IF EXISTS "sprint_access_requests_update" ON public.sprint_access_requests;

CREATE POLICY "sprint_access_requests_update" ON public.sprint_access_requests
  FOR UPDATE TO authenticated
  USING (
    -- Super admin, dept_lead can always approve
    public.current_user_role() IN ('super_admin', 'dept_lead')
    -- Regional secretary can approve for regional (Pastors) sprints
    OR (
      public.current_user_role() = 'regional_secretary'
      AND EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.department_id = (SELECT id FROM public.departments WHERE name = 'Pastors')
      )
    )
    -- Programs members can approve for regional (Pastors) sprints
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
    -- Group owner/manager can approve for their group sprints
    OR (
      EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.space_type = 'group'
          AND EXISTS (
            SELECT 1 FROM public.space_members sm
            WHERE sm.space_id = s.department_id
              AND sm.user_id = auth.uid()
              AND sm.role IN ('owner', 'manager')
          )
      )
    )
  )
  WITH CHECK (
    -- Same as USING clause
    public.current_user_role() IN ('super_admin', 'dept_lead')
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
    OR (
      EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.space_type = 'group'
          AND EXISTS (
            SELECT 1 FROM public.space_members sm
            WHERE sm.space_id = s.department_id
              AND sm.user_id = auth.uid()
              AND sm.role IN ('owner', 'manager')
          )
      )
    )
  );

DROP POLICY IF EXISTS "sprint_access_requests_delete" ON public.sprint_access_requests;

CREATE POLICY "sprint_access_requests_delete" ON public.sprint_access_requests
  FOR DELETE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'dept_lead')
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
    OR (
      EXISTS (
        SELECT 1 FROM public.sprints s
        WHERE s.id = sprint_access_requests.sprint_id
          AND s.space_type = 'group'
          AND EXISTS (
            SELECT 1 FROM public.space_members sm
            WHERE sm.space_id = s.department_id
              AND sm.user_id = auth.uid()
              AND sm.role IN ('owner', 'manager')
          )
      )
    )
  );
