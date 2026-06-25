-- ============================================================
-- WEEK 1: CALENDAR ROLES & PERMISSIONS SETUP
-- Sets up Programs Manager, Admin Manager, and Regional Secretary roles
-- ============================================================

-- ─── Create Role Definitions ────────────────────────────────────
-- These are application-level roles, tracked via calendar_permissions

-- Helper function to grant calendar permission
CREATE OR REPLACE FUNCTION public.grant_calendar_permission(
  p_user_id UUID,
  p_space_id UUID,
  p_can_manage BOOLEAN,
  p_granted_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_permission_id UUID;
BEGIN
  -- Only super_admin can grant permissions
  IF auth.jwt() ->> 'user_role' != 'super_admin' THEN
    RAISE EXCEPTION 'Only super admin can grant calendar permissions';
  END IF;

  INSERT INTO public.calendar_permissions (
    user_id,
    space_id,
    org_id,
    can_manage,
    granted_by
  )
  SELECT
    p_user_id,
    p_space_id,
    (SELECT organization_id FROM public.departments WHERE id = p_space_id),
    p_can_manage,
    COALESCE(p_granted_by, auth.uid())
  ON CONFLICT (user_id, space_id) DO UPDATE
  SET
    can_manage = p_can_manage,
    granted_by = COALESCE(p_granted_by, auth.uid()),
    granted_at = NOW()
  RETURNING id INTO v_permission_id;

  -- Log this action
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN p_can_manage THEN 'grant_calendar_manager' ELSE 'grant_calendar_view' END,
    'calendar_permission',
    v_permission_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'space_id', p_space_id,
      'can_manage', p_can_manage
    )
  );

  RETURN v_permission_id;
END;
$$;

-- Helper function to revoke calendar permission
CREATE OR REPLACE FUNCTION public.revoke_calendar_permission(
  p_user_id UUID,
  p_space_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only super_admin can revoke permissions
  IF auth.jwt() ->> 'user_role' != 'super_admin' THEN
    RAISE EXCEPTION 'Only super admin can revoke calendar permissions';
  END IF;

  DELETE FROM public.calendar_permissions
  WHERE user_id = p_user_id AND space_id = p_space_id;

  -- Log this action
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'revoke_calendar_permission',
    'calendar_permission',
    p_user_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'space_id', p_space_id
    )
  );
END;
$$;

-- ─── Seed Initial Data ──────────────────────────────────────────

-- Ensure the Programs and Admin spaces have been created
DO $$
DECLARE
  programs_space_id UUID;
  admin_space_id UUID;
BEGIN
  -- Get Programs space
  SELECT id INTO programs_space_id FROM public.departments
  WHERE name = 'Programs' AND space_type = 'department'
  LIMIT 1;

  -- Get Admin space
  SELECT id INTO admin_space_id FROM public.departments
  WHERE name = 'Admin' AND space_type = 'department'
  LIMIT 1;

  IF programs_space_id IS NOT NULL THEN
    -- Create default list for Programs space if needed
    INSERT INTO public.space_lists (space_id, name, sort_order)
    VALUES (programs_space_id, 'Programs Calendar', 0)
    ON CONFLICT DO NOTHING;
  END IF;

  IF admin_space_id IS NOT NULL THEN
    -- Create default list for Admin space if needed
    INSERT INTO public.space_lists (space_id, name, sort_order)
    VALUES (admin_space_id, 'Admin Calendar', 0)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ─── RLS Policies for calendar_subscriptions ──────────────────────

DROP POLICY IF EXISTS "manage_own_subscriptions" ON public.calendar_subscriptions;
DROP POLICY IF EXISTS "view_subscription" ON public.calendar_subscriptions;

-- Users can create their own subscriptions
CREATE POLICY "create_own_subscriptions"
  ON public.calendar_subscriptions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can view and manage their own subscriptions
CREATE POLICY "manage_own_subscriptions"
  ON public.calendar_subscriptions
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own subscriptions
CREATE POLICY "update_own_subscriptions"
  ON public.calendar_subscriptions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own subscriptions
CREATE POLICY "delete_own_subscriptions"
  ON public.calendar_subscriptions
  FOR DELETE
  USING (user_id = auth.uid());

-- ─── View for Calendar Permissions Summary ─────────────────────

CREATE OR REPLACE VIEW public.calendar_permissions_summary AS
SELECT
  cp.id,
  cp.user_id,
  u.email,
  u.name,
  cp.space_id,
  d.name AS space_name,
  CASE
    WHEN cp.can_manage THEN 'Manager'
    WHEN cp.user_id IS NOT NULL THEN 'Viewer'
  END AS role_name,
  cp.can_manage,
  cp.granted_at,
  cp.granted_by,
  u2.email AS granted_by_email
FROM public.calendar_permissions cp
INNER JOIN public.users u ON u.id = cp.user_id
LEFT JOIN public.departments d ON d.id = cp.space_id
LEFT JOIN public.users u2 ON u2.id = cp.granted_by;

-- ─── View for Active Google Calendar Syncs ─────────────────────

CREATE OR REPLACE VIEW public.active_google_syncs AS
SELECT
  gcs.id,
  gcs.org_id,
  gcs.space_id,
  d.name AS space_name,
  gcs.sync_enabled,
  gcs.sync_direction,
  gcs.last_sync_at,
  COUNT(ce.id) AS event_count,
  SUM(CASE WHEN ce.synced_to_google THEN 1 ELSE 0 END) AS synced_count,
  u.email AS connected_by_email,
  gcs.connected_at
FROM public.google_calendar_sync gcs
LEFT JOIN public.departments d ON d.id = gcs.space_id
LEFT JOIN public.calendar_events ce ON ce.space_id = gcs.space_id
LEFT JOIN public.users u ON u.id = gcs.connected_by
WHERE gcs.sync_enabled = TRUE
GROUP BY
  gcs.id, gcs.org_id, gcs.space_id, d.name,
  gcs.sync_enabled, gcs.sync_direction, gcs.last_sync_at,
  u.email, gcs.connected_at;

-- ─── View for Subscription Analytics ────────────────────────────

CREATE OR REPLACE VIEW public.subscription_analytics AS
SELECT
  cs.id,
  cs.token,
  cs.name,
  cs.space_id,
  d.name AS space_name,
  u.email AS created_by_email,
  cs.is_public,
  cs.filter_priority,
  cs.filter_status,
  cs.access_count,
  cs.last_accessed_at,
  cs.created_at,
  EXTRACT(DAY FROM NOW() - cs.created_at) AS days_active
FROM public.calendar_subscriptions cs
LEFT JOIN public.departments d ON d.id = cs.space_id
LEFT JOIN public.users u ON u.id = cs.user_id;

-- ─── Helper Function to Check User Role for Space ─────────────────

CREATE OR REPLACE FUNCTION public.get_user_calendar_role(
  p_user_id UUID,
  p_space_id UUID
)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT
    CASE
      WHEN (SELECT auth.jwt() ->> 'user_role') = 'super_admin' THEN 'super_admin'
      WHEN cp.can_manage = TRUE THEN 'manager'
      WHEN cp.id IS NOT NULL THEN 'viewer'
      ELSE NULL
    END
  FROM public.calendar_permissions cp
  WHERE cp.user_id = p_user_id AND cp.space_id = p_space_id;
$$;

-- ─── Indexes for Performance ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS activity_log_calendar_idx
  ON public.activity_log(action)
  WHERE entity_type = 'calendar_event' OR entity_type = 'google_calendar_sync';

CREATE INDEX IF NOT EXISTS calendar_subscriptions_user_created_idx
  ON public.calendar_subscriptions(user_id, created_at DESC);

-- ─── Test Data & Seed Values (Optional, commented out) ───────────
-- Uncomment after determining which users should have which roles

/*
-- Example: Grant Programs Manager role to a user
SELECT public.grant_calendar_permission(
  (SELECT id FROM public.users WHERE email = 'programs-manager@blwcanada.org' LIMIT 1),
  (SELECT id FROM public.departments WHERE name = 'Programs' LIMIT 1),
  TRUE
);

-- Example: Grant Admin Manager role to a user
SELECT public.grant_calendar_permission(
  (SELECT id FROM public.users WHERE email = 'admin-manager@blwcanada.org' LIMIT 1),
  (SELECT id FROM public.departments WHERE name = 'Admin' LIMIT 1),
  TRUE
);

-- Example: Grant Regional Secretary read-only access to both spaces
SELECT public.grant_calendar_permission(
  (SELECT id FROM public.users WHERE email = 'regional-secretary@blwcanada.org' LIMIT 1),
  (SELECT id FROM public.departments WHERE name = 'Programs' LIMIT 1),
  FALSE
);

SELECT public.grant_calendar_permission(
  (SELECT id FROM public.users WHERE email = 'regional-secretary@blwcanada.org' LIMIT 1),
  (SELECT id FROM public.departments WHERE name = 'Admin' LIMIT 1),
  FALSE
);
*/
