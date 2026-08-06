-- Allow Programs and ORS roles to send communications
-- Both roles need to create and manage communication campaigns

DROP POLICY IF EXISTS "admins_insert_broadcast_campaigns" ON public.broadcast_campaigns;
CREATE POLICY "admins_insert_broadcast_campaigns"
  ON public.broadcast_campaigns FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') IN ('super_admin', 'dept_lead', 'programs', 'ors')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "admins_update_broadcast_campaigns" ON public.broadcast_campaigns;
CREATE POLICY "admins_update_broadcast_campaigns"
  ON public.broadcast_campaigns FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('super_admin', 'dept_lead', 'programs', 'ors'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "admins_delete_broadcast_campaigns" ON public.broadcast_campaigns;
CREATE POLICY "admins_delete_broadcast_campaigns"
  ON public.broadcast_campaigns FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('super_admin', 'dept_lead', 'programs', 'ors'));

-- Allow Programs and ORS to manage communications infrastructure
DROP POLICY IF EXISTS "comm_contacts_insert" ON public.communication_contacts;
CREATE POLICY "comm_contacts_insert"
  ON public.communication_contacts FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "comm_contacts_update" ON public.communication_contacts;
CREATE POLICY "comm_contacts_update"
  ON public.communication_contacts FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "comm_contacts_delete" ON public.communication_contacts;
CREATE POLICY "comm_contacts_delete"
  ON public.communication_contacts FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "comm_categories_insert" ON public.communication_categories;
CREATE POLICY "comm_categories_insert"
  ON public.communication_categories FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "comm_categories_update" ON public.communication_categories;
CREATE POLICY "comm_categories_update"
  ON public.communication_categories FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "comm_categories_delete" ON public.communication_categories;
CREATE POLICY "comm_categories_delete"
  ON public.communication_categories FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "comm_contact_categories_insert" ON public.communication_contact_categories;
CREATE POLICY "comm_contact_categories_insert"
  ON public.communication_contact_categories FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "comm_contact_categories_delete" ON public.communication_contact_categories;
CREATE POLICY "comm_contact_categories_delete"
  ON public.communication_contact_categories FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

-- Allow Programs and ORS to manage campaign infrastructure
DROP POLICY IF EXISTS "campaign_templates_insert" ON public.communication_email_templates;
CREATE POLICY "campaign_templates_insert"
  ON public.communication_email_templates FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "campaign_templates_update" ON public.communication_email_templates;
CREATE POLICY "campaign_templates_update"
  ON public.communication_email_templates FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));

DROP POLICY IF EXISTS "campaign_templates_delete" ON public.communication_email_templates;
CREATE POLICY "campaign_templates_delete"
  ON public.communication_email_templates FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'role') in ('super_admin', 'dept_lead', 'programs', 'ors'));
