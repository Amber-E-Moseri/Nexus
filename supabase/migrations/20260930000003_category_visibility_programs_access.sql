-- Allow the Programs team to manage calendar category visibility.
-- The original policy (20260930000000) only permits super_admin to read/write
-- calendar_category_visibility. The Category Visibility config UI is also used by
-- the Programs team (any member of the Programs department), so they need access.
--
-- A SECURITY DEFINER helper avoids RLS recursion when checking department
-- membership from inside the policy expression.

CREATE OR REPLACE FUNCTION public.is_programs_team()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.departments d ON d.id = u.department_id
    WHERE u.id = auth.uid()
      AND lower(d.name) = 'programs'
  );
$$;

-- Permissive policy: combined with the existing super_admin policy via OR.
-- GUARD: calendar_category_visibility created by 20260930000004 (ordering defect).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'calendar_category_visibility' AND relnamespace = 'public'::regnamespace) THEN
    RAISE NOTICE 'Skipping: calendar_category_visibility not yet created';
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "visibility_programs_team_all" ON public.calendar_category_visibility';
  EXECUTE $pol$CREATE POLICY "visibility_programs_team_all"
    ON public.calendar_category_visibility
    USING (public.is_programs_team())
    WITH CHECK (public.is_programs_team())$pol$;
END;
$$;

COMMENT ON FUNCTION public.is_programs_team() IS
  'True when the current user belongs to the Programs department. Used by category visibility RLS.';
