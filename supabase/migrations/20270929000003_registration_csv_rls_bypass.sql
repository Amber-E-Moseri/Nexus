-- ICPLC Registration CSV RLS adjustment
-- Add service_role bypass to read identity_maps for backend RPCs

CREATE POLICY "service_role_identity_maps_read"
  ON public.icplc_identity_maps
  FOR SELECT
  TO service_role
  USING (true);
