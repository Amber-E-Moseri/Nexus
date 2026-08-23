-- Bug 4: RLS on notifications only allows user_id = auth.uid() or super_admin.
-- dept_leads inserting support-ticket replies and sprint member notifications
-- for other users were silently failing.
-- Allow dept_lead and regional_secretary to insert for any target user.

CREATE POLICY "privileged_users_can_notify_others"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'dept_lead', 'regional_secretary')
    )
  );
