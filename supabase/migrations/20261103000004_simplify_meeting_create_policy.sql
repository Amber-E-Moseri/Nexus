-- Simplify meeting create policy to allow super_admin
-- Previous policy had issues with role checking

DROP POLICY IF EXISTS "users_create_meetings" ON public.meetings;

CREATE POLICY "users_create_meetings" ON public.meetings
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND (
      public.current_user_role() IN ('ors', 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.designated_creators WHERE user_id = auth.uid()
      )
    )
  );
