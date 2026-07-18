-- Regional secretaries need org-wide read access to Flock CRM tables to
-- provide administrative oversight across all pastors' records.
-- SELECT only — write operations remain restricted to the owning pastor and super_admin.

CREATE POLICY "flock_contacts_regional_sec_read" ON public.flock_contacts
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'regional_secretary');

CREATE POLICY "flock_interactions_regional_sec_read" ON public.flock_interactions
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'regional_secretary');

CREATE POLICY "flock_todos_regional_sec_read" ON public.flock_todos
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'regional_secretary');

CREATE POLICY "flock_settings_regional_sec_read" ON public.flock_settings
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'regional_secretary');
