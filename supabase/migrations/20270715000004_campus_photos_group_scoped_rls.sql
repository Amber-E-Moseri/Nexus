-- Campus photos group-scoped visibility.
-- super_admin, regional_secretary, and ORS space-role holders see all campuses.
-- Everyone else (admins, pastors, dept leads, etc.) sees only campuses whose
-- group_name matches their own users.group_name.
-- Campuses with no group_name are org-wide and visible to everyone.
-- Users with no group_name assigned are not restricted (they see all).

DROP POLICY IF EXISTS "campuses_read_all" ON public.campuses;

CREATE POLICY "campuses_read_scoped" ON public.campuses
  FOR SELECT TO authenticated
  USING (
    -- Global roles always see everything
    current_user_role() IN ('super_admin', 'regional_secretary')
    OR has_space_role_anywhere(auth.uid(), 'ors')
    -- Campus has no group assignment → org-wide, visible to all
    OR campuses.group_name IS NULL
    -- Viewing user has no group assigned → no restriction yet
    OR (SELECT group_name FROM public.users WHERE id = auth.uid()) IS NULL
    -- User's group matches campus group
    OR campuses.group_name = (SELECT group_name FROM public.users WHERE id = auth.uid())
  );
