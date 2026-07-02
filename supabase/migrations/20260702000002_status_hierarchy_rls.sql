-- RLS Policies for Status Hierarchy
-- Enforce visibility rules around org vs dept statuses

BEGIN;

-- Ensure RLS is enabled
ALTER TABLE public.task_status_definitions ENABLE ROW LEVEL SECURITY;

-- DROP existing policies to avoid conflicts
DROP POLICY IF EXISTS "status_definitions_select_authenticated" ON public.task_status_definitions;
DROP POLICY IF EXISTS "status_definitions_manage_admin" ON public.task_status_definitions;

-- SELECT: Authenticated users can see:
--   1. All org-wide statuses (is_org_status = true, department_id IS NULL)
--   2. Dept-specific statuses for their own department
-- Admin can see all
CREATE POLICY "status_definitions_select_authenticated"
ON public.task_status_definitions
FOR SELECT
TO authenticated
USING (
  is_org_status = true
  OR department_id = public.current_user_department()
  OR (auth.jwt() ->> 'user_role') = 'super_admin'
);

-- INSERT/UPDATE/DELETE: Only super_admin or dept_lead of the department
-- Super admin can manage everything
-- Dept lead can only manage statuses in their own department
CREATE POLICY "status_definitions_manage_admin"
ON public.task_status_definitions
FOR ALL
TO authenticated
USING (
  (auth.jwt() ->> 'user_role') = 'super_admin'
  OR (
    (auth.jwt() ->> 'user_role') = 'dept_lead'
    AND (
      department_id = public.current_user_department()
      OR is_org_status = false -- Can't directly manage org statuses, but can manage dept ones
    )
  )
)
WITH CHECK (
  (auth.jwt() ->> 'user_role') = 'super_admin'
  OR (
    (auth.jwt() ->> 'user_role') = 'dept_lead'
    AND (
      department_id = public.current_user_department()
      OR is_org_status = false
    )
  )
);

-- Prevent accidental deletion of org statuses (even by admin in some cases)
-- Org statuses should only be modified through controlled migrations
CREATE POLICY "prevent_org_status_deletion"
ON public.task_status_definitions
FOR DELETE
TO authenticated
USING (
  -- Only allow deletion if it's not an org status
  -- OR if it's a super admin deleting an inactive org status (careful!)
  (is_org_status = false)
  OR ((auth.jwt() ->> 'user_role') = 'super_admin' AND active = false)
);

COMMIT;
