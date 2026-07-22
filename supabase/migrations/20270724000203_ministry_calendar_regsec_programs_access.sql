-- Widen Ministry Calendar admin access beyond super_admin (+ ad-hoc
-- calendar_permissions.can_manage grants) to also cover regional_secretary
-- and any Programs department member.
--
-- CalendarSettingsPage.jsx already intends this (canManageConnections /
-- canManageVisibility include isProgramsMember and role === 'regional_secretary'),
-- but the underlying tables' RLS never caught up:
--   - ministry_calendar_connection: admin-only policy meant a Programs member
--     could complete the Google OAuth flow (the edge function writes via the
--     service role) but then the settings page's own SELECT came back empty
--     under their session, so the UI reverted to "not connected" — "the
--     connection doesn't stick".
--   - ministry_calendar_sources / ministry_calendar_source_dept_visibility /
--     calendar_category_dept_visibility / calendar_event_types: all
--     super_admin-only (or gated on a calendar_permissions row nobody had),
--     so Programs members and regional_secretary got silent RLS-filtered
--     no-ops on every write.
--
-- is_programs_team() (20260930000003) already exists and is SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.can_manage_ministry_calendar()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    (auth.jwt() ->> 'user_role') = 'super_admin'
    OR (auth.jwt() ->> 'user_role') = 'regional_secretary'
    OR public.is_programs_team()
$$;

COMMENT ON FUNCTION public.can_manage_ministry_calendar() IS
  'True for super_admin, regional_secretary, or any Programs department member. Gates Ministry Calendar admin tables (connection, sources, source/category visibility, event types) — additive to the existing super_admin / calendar_permissions.can_manage policies, combined via OR.';

-- ministry_calendar_connection: additive permissive policy (OR'd with the
-- existing "ministry_calendar_connection_admin_only").
CREATE POLICY "ministry_calendar_connection_programs_regsec"
  ON public.ministry_calendar_connection
  FOR ALL
  USING (public.can_manage_ministry_calendar())
  WITH CHECK (public.can_manage_ministry_calendar());

-- ministry_calendar_sources: additive permissive policy.
CREATE POLICY "ministry_calendar_sources_programs_regsec"
  ON public.ministry_calendar_sources
  FOR ALL
  USING (public.can_manage_ministry_calendar())
  WITH CHECK (public.can_manage_ministry_calendar());

-- ministry_calendar_source_dept_visibility: was super_admin-only for writes.
CREATE POLICY "manage_source_visibility_programs_regsec"
  ON public.ministry_calendar_source_dept_visibility
  FOR ALL TO authenticated
  USING (public.can_manage_ministry_calendar())
  WITH CHECK (public.can_manage_ministry_calendar());

-- calendar_category_dept_visibility: was super_admin-only for writes, despite
-- the UI (CategoryVisibilityConfig.jsx) being built for Programs + regsec too.
CREATE POLICY "cat_dept_vis_programs_regsec"
  ON public.calendar_category_dept_visibility
  FOR ALL
  USING (public.can_manage_ministry_calendar())
  WITH CHECK (public.can_manage_ministry_calendar());

-- calendar_event_types: additive to the existing super_admin / can_manage-grant policy.
CREATE POLICY "calendar_event_types_programs_regsec"
  ON public.calendar_event_types
  FOR ALL
  TO authenticated
  USING (public.can_manage_ministry_calendar())
  WITH CHECK (public.can_manage_ministry_calendar());
