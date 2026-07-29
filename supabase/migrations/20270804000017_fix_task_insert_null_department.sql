-- Fix task insert RLS to allow users with NULL department_id (external/temporary members)
-- External invitees (sprint members without a home department) should still be able to create tasks
-- in their assigned sprint or as personal tasks.

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;

CREATE POLICY "tasks_insert" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    -- Personal tasks (any user)
    is_personal = true
    -- Super admin can create anywhere
    OR (auth.jwt() ->> 'role') = 'super_admin'
    -- Dept lead in their department
    OR (
      (auth.jwt() ->> 'role') = 'dept_lead'
      AND department_id = current_user_department()
    )
    -- User's home department (or NULL department for tasks)
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND (u.department_id = tasks.department_id OR (u.department_id IS NULL AND tasks.department_id IS NULL))
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
    -- Sprint members (external/temporary) can create sprint tasks
    OR (
      EXISTS (
        SELECT 1 FROM public.sprint_members sm
        WHERE sm.user_id = auth.uid()
          AND sm.sprint_id = tasks.sprint_id
          AND tasks.sprint_id IS NOT NULL
      )
    )
  )
);
