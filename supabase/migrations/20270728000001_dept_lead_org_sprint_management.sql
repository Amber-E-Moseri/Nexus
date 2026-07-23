-- Expand sprint management to org-wide for any dept_lead.
-- Dept leads can now manage all sprints, not just those in their space.

CREATE OR REPLACE FUNCTION public.can_manage_sprint(p_sprint_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sprints s
    WHERE s.id = p_sprint_id
      AND (
        public.is_super_admin()
        OR public.current_user_role() = 'regional_secretary'
        OR public.is_programs_team()
        OR s.created_by = auth.uid()
        OR public.has_space_role_anywhere(auth.uid(), 'dept_lead')
        OR (
          s.department_id IS NOT NULL
          AND public.can_manage_space(s.department_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.sprint_members sm
          WHERE sm.sprint_id = p_sprint_id
            AND sm.user_id = auth.uid()
            AND sm.role IN ('owner', 'manager')
        )
      )
  );
$$;
