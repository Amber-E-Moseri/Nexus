-- Allow super_admin and ORS to create meetings without role check complexity
-- Override previous policies with a simpler, more direct approach

DROP POLICY IF EXISTS "users_create_meetings" ON public.meetings;

-- Allow creation if:
-- 1. User is setting themselves as creator AND (ORS or super_admin or designated creator)
-- 2. OR user is super_admin (bypass other checks)
CREATE POLICY "users_create_meetings" ON public.meetings
  FOR INSERT WITH CHECK (
    CASE
      -- Super admin can always create
      WHEN auth.jwt() ->> 'user_role' = 'super_admin' THEN true
      -- ORS and designated creators with auth check
      WHEN auth.uid() = created_by AND (
        auth.jwt() ->> 'user_role' = 'ors'
        OR EXISTS (SELECT 1 FROM designated_creators WHERE user_id = auth.uid())
      ) THEN true
      ELSE false
    END
  );
