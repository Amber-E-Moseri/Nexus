-- Fix: Allow super_admin to create meetings
-- The create policy was only allowing ORS and designated creators

DROP POLICY IF EXISTS "users_create_meetings" ON public.meetings;

CREATE POLICY "users_create_meetings" ON public.meetings
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('ors', 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.designated_creators WHERE user_id = auth.uid()
      )
    )
  );
