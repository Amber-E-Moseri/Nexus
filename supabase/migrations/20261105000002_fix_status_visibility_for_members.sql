-- Fix status visibility for regular space members
DROP POLICY IF EXISTS "status_definitions_select_authenticated" ON public.task_status_definitions;

CREATE POLICY "status_definitions_select_authenticated" ON public.task_status_definitions
FOR SELECT TO authenticated
USING (
  -- Org-wide statuses (no department)
  department_id IS NULL
  OR
  -- Dept lead can see their department's statuses
  (
    (auth.jwt() ->> 'role') = 'dept_lead'
    AND department_id = current_user_department()
  )
  OR
  -- Super admin can see all
  (auth.jwt() ->> 'role') = 'super_admin'
  OR
  -- Members of the space can see the space's statuses
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.department_id = task_status_definitions.department_id
  )
  OR
  -- Space members can see statuses
  EXISTS (
    SELECT 1 FROM public.space_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.space_id = task_status_definitions.department_id
  )
);
