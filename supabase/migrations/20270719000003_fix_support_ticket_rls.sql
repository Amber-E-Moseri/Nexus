-- Fix support ticket RLS to use current_user_role() consistently
-- (original policies used auth.jwt()->'user_metadata'->>'user_role' which
-- doesn't match the JWT claim path used everywhere else in the codebase)

DROP POLICY IF EXISTS "tickets_select" ON public.support_tickets;
CREATE POLICY "tickets_select" ON public.support_tickets FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR public.current_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "tickets_update" ON public.support_tickets;
CREATE POLICY "tickets_update" ON public.support_tickets FOR UPDATE
  USING (public.current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "replies_select" ON public.support_ticket_replies;
CREATE POLICY "replies_select" ON public.support_ticket_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          t.submitted_by = auth.uid()
          OR public.current_user_role() = 'super_admin'
        )
    )
  );

DROP POLICY IF EXISTS "replies_insert" ON public.support_ticket_replies;
CREATE POLICY "replies_insert" ON public.support_ticket_replies FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          t.submitted_by = auth.uid()
          OR public.current_user_role() = 'super_admin'
        )
    )
  );
