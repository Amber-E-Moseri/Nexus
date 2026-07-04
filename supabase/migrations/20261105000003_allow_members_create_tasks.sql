-- Allow regular space members to create tasks
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;

CREATE POLICY "tasks_insert" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    -- Personal tasks
    is_personal = true
    -- Super admin can create anywhere
    OR (auth.jwt() ->> 'role') = 'super_admin'
    -- Dept lead in their department
    OR (
      (auth.jwt() ->> 'role') = 'dept_lead'
      AND department_id = current_user_department()
    )
    -- User's home department
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.department_id = tasks.department_id
      )
    )
    -- Space members can create tasks
    OR (
      EXISTS (
        SELECT 1 FROM public.space_members sm
        WHERE sm.user_id = auth.uid()
          AND sm.space_id = tasks.department_id
      )
    )
  )
);
