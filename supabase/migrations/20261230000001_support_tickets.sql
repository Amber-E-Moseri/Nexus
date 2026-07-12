-- Support tickets: users contact super admin for help, task requests, bugs, features
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('support', 'task_request', 'bug', 'feature_request')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  submitted_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS support_tickets_submitted_by_idx ON public.support_tickets(submitted_by);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS support_ticket_replies_ticket_id_idx ON public.support_ticket_replies(ticket_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_support_ticket()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_replies_touch ON public.support_ticket_replies;
CREATE TRIGGER support_ticket_replies_touch
  AFTER INSERT ON public.support_ticket_replies
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket();

-- RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;

-- Tickets: submitter sees own; super_admin sees all
CREATE POLICY "tickets_select" ON public.support_tickets FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR coalesce(
      (auth.jwt() -> 'user_metadata' ->> 'user_role'),
      (SELECT role FROM public.users WHERE id = auth.uid())
    ) = 'super_admin'
  );

CREATE POLICY "tickets_insert" ON public.support_tickets FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "tickets_update" ON public.support_tickets FOR UPDATE
  USING (
    coalesce(
      (auth.jwt() -> 'user_metadata' ->> 'user_role'),
      (SELECT role FROM public.users WHERE id = auth.uid())
    ) = 'super_admin'
  );

-- Replies: submitter + super_admin can read/write on their tickets
CREATE POLICY "replies_select" ON public.support_ticket_replies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          t.submitted_by = auth.uid()
          OR coalesce(
            (auth.jwt() -> 'user_metadata' ->> 'user_role'),
            (SELECT role FROM public.users WHERE id = auth.uid())
          ) = 'super_admin'
        )
    )
  );

CREATE POLICY "replies_insert" ON public.support_ticket_replies FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          t.submitted_by = auth.uid()
          OR coalesce(
            (auth.jwt() -> 'user_metadata' ->> 'user_role'),
            (SELECT role FROM public.users WHERE id = auth.uid())
          ) = 'super_admin'
        )
    )
  );
