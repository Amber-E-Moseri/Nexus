-- Allow super_admin to create, update, and delete regional updates

-- Update create policy to include super_admin
DROP POLICY "rs_can_create_regional_updates" ON public.regional_updates;
CREATE POLICY "rs_and_admin_can_create_regional_updates"
  ON public.regional_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (u.role = 'regional_secretary' OR u.role = 'super_admin')
    )
  );

-- Update update policy to include super_admin
DROP POLICY "rs_can_update_own_regional_updates" ON public.regional_updates;
CREATE POLICY "rs_and_admin_can_update_regional_updates"
  ON public.regional_updates FOR UPDATE
  TO authenticated
  USING (
    (
      auth.uid() = created_by
      AND EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'regional_secretary'
      )
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    (
      auth.uid() = created_by
      AND EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'regional_secretary'
      )
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- Update delete policy to include super_admin
DROP POLICY "rs_can_delete_own_regional_updates" ON public.regional_updates;
CREATE POLICY "rs_and_admin_can_delete_regional_updates"
  ON public.regional_updates FOR DELETE
  TO authenticated
  USING (
    (
      auth.uid() = created_by
      AND EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'regional_secretary'
      )
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'
    )
  );
